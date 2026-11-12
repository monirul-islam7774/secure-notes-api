import mongoose from 'mongoose';
import { env } from './config/env.js';

export async function connectDB(uri = env.MONGO_URI) {
  // autoIndex on in dev/test; in production run `npm run sync-indexes` explicitly.
  mongoose.set('autoIndex', !env.isProd);
  await mongoose.connect(uri);
  return mongoose.connection;
}
