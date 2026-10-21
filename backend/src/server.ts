import mongoose from 'mongoose';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { MongoAdminRepository, MongoCouponRepository, MongoDatasetRepository, MongoOrderRepository, MongoReportRepository } from './repositories/mongo.repository';
import { DatasetCache } from './services/datasetCache';
import { CheckerService } from './services/checker.service';
import { AdminService } from './services/admin.service';
import { PaymentService } from './services/payment.service';
import { DashboardService } from './services/dashboard.service';
import { ReportEmailService } from './services/reportEmail.service';
import { BrevoEmailSender, DisabledEmailSender } from './services/email.service';
import { DarajaClient, DisabledMpesaClient } from './modules/payments/mpesa.client';

async function main() {
  const env = loadEnv();
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 10_000 });
  const datasets = new MongoDatasetRepository();
  const cache = new DatasetCache(datasets);
  const orders = new MongoOrderRepository();
  const coupons = new MongoCouponRepository();
  const checker = new CheckerService({ datasets: cache, reports: new MongoReportRepository(), orders, priceKes: env.PRICE_KES, reportTtlDays: env.REPORT_TTL_DAYS, siteName: env.SITE_NAME, supportEmail: env.SUPPORT_EMAIL, supportWhatsapp: env.SUPPORT_WHATSAPP });
  const admin = new AdminService({ datasets, admins: new MongoAdminRepository(), cache, jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN });

  const sender = env.BREVO_API_KEY && env.EMAIL_FROM ? new BrevoEmailSender(env.BREVO_API_KEY, env.EMAIL_FROM, env.EMAIL_FROM_NAME) : new DisabledEmailSender();
  const emails = new ReportEmailService({ orders, checker, sender, siteName: env.SITE_NAME, supportEmail: env.SUPPORT_EMAIL, supportWhatsapp: env.SUPPORT_WHATSAPP });

  const mpesaReady = Boolean(env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_SECRET && env.MPESA_SHORTCODE && env.MPESA_PASSKEY && env.MPESA_CALLBACK_BASE_URL && env.MPESA_CALLBACK_SECRET);
  const mpesa = mpesaReady
    ? new DarajaClient({
        env: env.MPESA_ENV,
        consumerKey: env.MPESA_CONSUMER_KEY as string,
        consumerSecret: env.MPESA_CONSUMER_SECRET as string,
        shortcode: env.MPESA_SHORTCODE as string,
        passkey: env.MPESA_PASSKEY as string,
        transactionType: env.MPESA_TRANSACTION_TYPE,
        partyB: env.MPESA_PARTY_B || (env.MPESA_SHORTCODE as string),
        callbackUrl: `${(env.MPESA_CALLBACK_BASE_URL as string).replace(/\/+$/, '')}/api/v1/payments/mpesa/callback/${env.MPESA_CALLBACK_SECRET as string}`,
      })
    : new DisabledMpesaClient();
  if (!mpesaReady) console.warn('M-Pesa is not fully configured: paid checkout is unavailable (only 100% coupons will unlock reports).');
  if (!sender.enabled) console.warn('Email is not configured (BREVO_API_KEY / EMAIL_FROM): reports will not be emailed.');
  const payments = new PaymentService({ orders, coupons, mpesa, priceKes: env.PRICE_KES, callbackSecret: env.MPESA_CALLBACK_SECRET, onPaid: (id) => emails.deliver(id) });
  const dashboard = new DashboardService({ orders, coupons, datasets, emails });
  const app = createApp({ env, checker, admin, payments, dashboard, emails, cache, isDbReady: () => mongoose.connection.readyState === 1 });
  const server = app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
  const stop = () => server.close(() => void mongoose.disconnect().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error('Startup failed:', (e as Error).message);
  process.exit(1);
});
