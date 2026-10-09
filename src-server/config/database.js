import mongoose from 'mongoose';

const cache = globalThis.__swamySlabsMongo || { connection: null, promise: null };
globalThis.__swamySlabsMongo = cache;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (cache.connection) return cache.connection;

  if (!process.env.MONGODB_URI) {
    throw new Error('Missing required environment variable: MONGODB_URI');
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    cache.connection = null;
    throw error;
  }
}

export async function requireDatabase(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection unavailable:', error.message);
    res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
}

export function databaseStatus() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
