import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  interests: u.interests,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});
