import mongoose from 'mongoose';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { MongoAdminRepository, MongoDatasetRepository, MongoReportRepository } from './repositories/mongo.repository';
import { DatasetCache } from './services/datasetCache';
import { CheckerService } from './services/checker.service';
import { AdminService } from './services/admin.service';

async function main() {
  const env = loadEnv();
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 10_000 });
  const datasets = new MongoDatasetRepository();
  const cache = new DatasetCache(datasets);
  const checker = new CheckerService({ datasets: cache, reports: new MongoReportRepository(), reportTtlDays: env.REPORT_TTL_DAYS, siteName: env.SITE_NAME, supportEmail: env.SUPPORT_EMAIL });
  const admin = new AdminService({ datasets, admins: new MongoAdminRepository(), cache, jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN });
  const app = createApp({ env, checker, admin, cache, isDbReady: () => mongoose.connection.readyState === 1 });
  const server = app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
  const stop = () => server.close(() => void mongoose.disconnect().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error('Startup failed:', (e as Error).message);
  process.exit(1);
});
