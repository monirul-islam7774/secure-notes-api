import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

export async function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing or malformed Authorization header');
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const user = await User.findById(payload.sub); // default _id index
  if (!user) throw new HttpError(401, 'User no longer exists');
  req.user = user;
  next();
}
