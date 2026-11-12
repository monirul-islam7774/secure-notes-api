import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export function buildPage({ data, page, limit, total }) {
  return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// Always sorts by _id desc so the default _id / {x:1,_id:-1} indexes serve the query.
export async function paginate(query, countQuery, { page, limit }) {
  const [data, total] = await Promise.all([
    query.sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    countQuery,
  ]);
  return buildPage({ data, page, limit, total });
}
