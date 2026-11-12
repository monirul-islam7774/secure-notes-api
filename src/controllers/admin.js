import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Note } from '../models/Note.js';
import { Post } from '../models/Post.js';
import { HttpError } from '../utils/httpError.js';
import { paginate } from '../utils/paginate.js';
import { publicUser } from '../utils/token.js';

const interests = z.array(z.string().trim().min(1)).max(20);

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
  role: z.enum(['user', 'admin']).default('user'),
  interests: interests.default([]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().trim().toLowerCase().optional(),
  password: z.string().min(6).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
  interests: interests.optional(),
});

export async function listNotes(req, res) {
  res.json(await paginate(Note.find().populate('owner', 'name email'), Note.estimatedDocumentCount(), req.valid.query));
}

export async function listUsers(req, res) {
  res.json(await paginate(User.find(), User.estimatedDocumentCount(), req.valid.query));
}

export async function createUser(req, res) {
  const { password, ...rest } = req.valid.body;
  if (await User.exists({ email: rest.email })) throw new HttpError(409, 'Email already registered');
  const user = await User.create({ ...rest, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ user: publicUser(user) });
}

export async function updateUser(req, res) {
  const { password, ...rest } = req.valid.body;
  const update = { ...rest };
  if (password) update.password = await bcrypt.hash(password, 10);
  const user = await User.findByIdAndUpdate(req.valid.params.id, update, { returnDocument: 'after', runValidators: true });
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user: publicUser(user) });
}

export async function deleteUser(req, res) {
  const { id } = req.valid.params;
  if (id === req.user._id.toString()) throw new HttpError(400, 'Admins cannot delete themselves');
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new HttpError(404, 'User not found');
  await Promise.all([Note.deleteMany({ owner: id }), Post.deleteMany({ author: id })]);
  res.json({ message: 'User and their notes/posts deleted' });
}
