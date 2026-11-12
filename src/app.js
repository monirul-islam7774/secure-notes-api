import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

export const app = express();

app.set('trust proxy', 1); // behind Render's proxy (needed for rate limiting by client IP)
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  }),
);
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.json({ limit: '100kb' }));

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);
