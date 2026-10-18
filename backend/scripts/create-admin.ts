/**
 * Usage (PowerShell):  $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="<long passphrase>"; npm run create:admin
 * Credentials come from environment variables only; nothing is hardcoded or logged.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoAdminRepository } from '../src/repositories/mongo.repository';
import { connect } from './_common';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
  if (pw.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  await connect();
  const repo = new MongoAdminRepository();
  if (await repo.findByEmail(email)) throw new Error('An admin with that email already exists');
  await repo.create({ email, passwordHash: await bcrypt.hash(pw, 12), role: 'admin' });
  console.log(`Admin created: ${email}`);
}
main().then(() => mongoose.disconnect(), async (e) => { console.error((e as Error).message); await mongoose.disconnect(); process.exit(1); });
