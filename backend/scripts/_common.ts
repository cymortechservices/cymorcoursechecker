import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env';

export async function connect() {
  const env = loadEnv();
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME, serverSelectionTimeoutMS: 10_000 });
  return env;
}
export const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
export const flag = (name: string) => process.argv.includes(`--${name}`);
export const readPdf = (p: string) => fs.readFile(p);
