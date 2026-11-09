import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';
import { Venue } from '../models/Venue.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { RevokedToken } from '../models/RevokedToken.js';

// One connection per process. Serverless instances reuse it across requests.
const cache = (globalThis.__nrMongo ??= { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(env.mongoUri, { dbName: env.mongoDb, serverSelectionTimeoutMS: 10_000 });
  try {
    cache.conn = await cache.promise;
    await prepare();
  } catch (err) {
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}

export const dbMiddleware = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.status(503).json({ error: 'Database unavailable, try again shortly' });
  }
};

// Runs once per process after connecting. Accounts made with email and password left a unique index on `email`;
// wallet accounts have no email, so a second one would collide on null. Dropping it is safe (nothing reads it).
async function prepare() {
  if (cache.ready) return;
  await mongoose.connection.collection('users').dropIndex('email_1').catch(() => {});
  // build the indexes now, so the unique ones exist before the first request that relies on them
  for (const m of [User, Venue, LedgerEntry, RevokedToken]) await m.init().catch((e) => console.warn(`Index build for ${m.modelName} failed:`, e.message));
  cache.ready = true;
}
