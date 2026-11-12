import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// validate({ body, params, query }) -> parsed values on req.valid.{body,params,query}
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const r = schemas[key].safeParse(req[key] ?? {});
    if (!r.success) return next(r.error);
    req.valid[key] = r.data;
  }
  next();
};
