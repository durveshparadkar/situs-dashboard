import mongoose, { Mongoose } from "mongoose";

type Cache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const globalCache = globalThis as unknown as {
  mongooseCache?: Cache;
};

const cached: Cache = globalCache.mongooseCache || {
  conn: null,
  promise: null,
};

export async function connectDB(): Promise<Mongoose> {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in .env.local");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      dbName: "situs",
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  globalCache.mongooseCache = cached;

  return cached.conn;
}
