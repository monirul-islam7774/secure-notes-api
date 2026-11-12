import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 chars'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};
