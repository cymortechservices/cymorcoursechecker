/**
 * Usage: npm run import:pdfs -- --cluster <file.pdf> --cutoffs <file.pdf> [--dry-run]
 * Creates a DRAFT dataset (never active). Use activate:dataset after reviewing the report.
 */
import mongoose from 'mongoose';
import { analysePdfs } from '../src/modules/import/import.service';
import { checkActivationReadiness } from '../src/modules/import/corrections';
import { MongoDatasetRepository } from '../src/repositories/mongo.repository';
import { arg, connect, flag, readPdf } from './_common';

async function main() {
  const c = arg('cluster');
  const k = arg('cutoffs');
  if (!c || !k) throw new Error('Usage: --cluster <cluster.pdf> --cutoffs <cutoffs.pdf> [--dry-run]');
  const a = await analysePdfs({ clusterPdf: await readPdf(c), clusterFilename: c, cutoffPdf: await readPdf(k), cutoffFilename: k });
  const readiness = checkActivationReadiness(a.built.quality, a.built.programmes);
  console.log(JSON.stringify({ contentId: a.contentId, sources: a.sources, quality: a.built.quality, readiness }, null, 2));
  if (flag('dry-run')) return console.log('\nDry run: nothing was written.');
  await connect();
  const repo = new MongoDatasetRepository();
  const existing = await repo.findByContentId(a.contentId);
  if (existing) throw new Error(`These files were already imported as ${existing.version}`);
  const version = `ds-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}-${a.contentId.slice(0, 8)}`;
  const meta = await repo.createDraft(version, a.contentId, a.built, a.sources, 'cli');
  console.log(`\nDraft dataset created: ${meta.version} (status: ${meta.status}). Review, then run activate:dataset.`);
}
main().then(() => mongoose.disconnect(), async (e) => { console.error('Import failed:', (e as Error).message); await mongoose.disconnect(); process.exit(1); });
