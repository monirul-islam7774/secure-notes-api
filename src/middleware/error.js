import { ZodError } from 'zod';

export function notFound(_req, res) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; '),
        details: err.issues,
      },
    });
  }
  if (err?.code === 11000) return res.status(409).json({ error: { message: 'Duplicate value: resource already exists' } });
  if (err?.name === 'CastError') return res.status(400).json({ error: { message: 'Invalid id' } });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { message: status >= 500 ? 'Internal server error' : err.message } });
}
