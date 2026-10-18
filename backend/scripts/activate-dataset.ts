/** Usage: npm run activate:dataset -- --version <version>   (runs the activation gate first) */
import mongoose from 'mongoose';
import { checkActivationReadiness } from '../src/modules/import/corrections';
import { MongoDatasetRepository } from '../src/repositories/mongo.repository';
import { arg, connect } from './_common';

async function main() {
  const v = arg('version');
  if (!v) throw new Error('Usage: --version <version>');
  await connect();
  const repo = new MongoDatasetRepository();
  const ds = await repo.loadDataset(v);
  if (!ds) throw new Error('Dataset not found');
  const r = checkActivationReadiness({ ...ds.meta.quality, awaitingReview: ds.programmes.filter((p) => p.verificationStatus === 'needs_review').length }, ds.programmes);
  if (!r.ready) throw new Error(`Activation checks failed: ${JSON.stringify(r)}`);
  const out = await repo.activate(v, 'cli');
  console.log(`Activated ${v}. Previous: ${out.previous ?? 'none'}`);
}
main().then(() => mongoose.disconnect(), async (e) => { console.error((e as Error).message); await mongoose.disconnect(); process.exit(1); });
