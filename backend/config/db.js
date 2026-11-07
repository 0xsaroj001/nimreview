import mongoose from 'mongoose';
import { env } from './env.js';

// One connection per process. Serverless instances reuse it across requests.
const cache = (globalThis.__nrMongo ??= { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(env.mongoUri, { dbName: env.mongoDb, serverSelectionTimeoutMS: 10_000 });
  try {
    cache.conn = await cache.promise;
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
