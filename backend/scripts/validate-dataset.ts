/** Usage: npm run validate:dataset -- --version <version>   (prints readiness; changes nothing) */
import mongoose from 'mongoose';
import { checkActivationReadiness } from '../src/modules/import/corrections';
import { MongoDatasetRepository } from '../src/repositories/mongo.repository';
import { arg, connect } from './_common';

async function main() {
  const v = arg('version');
  if (!v) throw new Error('Usage: --version <version>');
  await connect();
  const ds = await new MongoDatasetRepository().loadDataset(v);
  if (!ds) throw new Error('Dataset not found');
  const awaiting = ds.programmes.filter((p) => p.verificationStatus === 'needs_review').length;
  console.log(JSON.stringify({ version: v, status: ds.meta.status, readiness: checkActivationReadiness({ ...ds.meta.quality, awaitingReview: awaiting }, ds.programmes) }, null, 2));
}
main().then(() => mongoose.disconnect(), async (e) => { console.error((e as Error).message); await mongoose.disconnect(); process.exit(1); });
