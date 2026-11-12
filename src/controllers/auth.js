import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { signToken, publicUser } from '../utils/token.js';

// role is intentionally not accepted: public registration is always 'user'
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
  interests: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export async function register(req, res) {
  const { name, email, password, interests } = req.valid.body;
  if (await User.exists({ email })) throw new HttpError(409, 'Email already registered');
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hash, role: 'user', interests });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+password');
  const ok = user && (await bcrypt.compare(password, user.password));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
}
