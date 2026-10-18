import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analysePdfs, validatePdfBuffer } from '../src/modules/import/import.service';
import { checkActivationReadiness } from '../src/modules/import/corrections';
import { key1, key2 } from '../src/modules/import/nameMatch';

const dir = process.env.KUCCPS_PDF_DIR ?? '/mnt/user-data/uploads';
const C = `${dir}/DEGREE_CLUSTER_DOCUMENT_11_2_2024.pdf`;
const K = `${dir}/DEGREE_CUTOFFS_14_07_2025.pdf`;
const have = fs.existsSync(C) && fs.existsSync(K);

test('non-PDF and empty buffers are rejected', () => {
  assert.throws(() => validatePdfBuffer(Buffer.from('hello'), 'x.pdf'));
  assert.throws(() => validatePdfBuffer(Buffer.alloc(0), 'x.pdf'));
});
test('name keys: connector words and spelling variants normalise; different programmes do not collide', () => {
  assert.equal(key2('Bachelor of Science in Nursing'), key2('Bachelor of Science (Nursing)'));
  assert.notEqual(key2('Bachelor of Science in Nursing'), key2('Bachelor of Science in Clinical Medicine'));
  assert.notEqual(key1('A'), key1('B'));
});
test('corrupt PDF fails cleanly', async () => {
  await assert.rejects(analysePdfs({ clusterPdf: Buffer.from('%PDF-1.4 garbage'), clusterFilename: 'a.pdf', cutoffPdf: Buffer.from('%PDF-1.4 garbage'), cutoffFilename: 'b.pdf' }));
});

test('real PDFs: import metrics, no duplicate codes, no fabricated cutoffs', { skip: !have, timeout: 240_000 }, async () => {
  const a = await analysePdfs({ clusterPdf: fs.readFileSync(C), clusterFilename: C, cutoffPdf: fs.readFileSync(K), cutoffFilename: K });
  const codes = a.built.programmes.map((p) => p.programmeCode);
  assert.equal(new Set(codes).size, codes.length, 'duplicate programme codes');
  assert.ok(a.built.programmes.length > 2000);
  // every stored cutoff is a printed positive decimal; nothing is zero/empty
  for (const p of a.built.programmes) for (const c of p.cutoffs) assert.ok(/^\d+(\.\d+)?$/.test(c.raw) && Number(c.raw) > 0);
  // only validated programmes carry a cluster mapping; the rest are queued for review
  assert.ok(a.built.programmes.every((p) => p.verificationStatus !== 'validated' || (p.clusterId !== null && p.subClusterId)));
  assert.ok(a.built.reviewQueue.length > 0);
  assert.equal(checkActivationReadiness(a.built.quality, a.built.programmes).ready, true);
  // the same files produce the same content id (idempotent import detection)
  const b = await analysePdfs({ clusterPdf: fs.readFileSync(C), clusterFilename: 'renamed.pdf', cutoffPdf: fs.readFileSync(K), cutoffFilename: 'renamed2.pdf' });
  assert.equal(a.contentId, b.contentId);
  // dates come from the content/metadata, never from file names
  assert.ok(!JSON.stringify(a.sources).includes('renamed'));
});
