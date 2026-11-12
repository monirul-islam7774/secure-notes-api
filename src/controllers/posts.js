import { z } from 'zod';
import { Post } from '../models/Post.js';
import { paginate } from '../utils/paginate.js';

export const postBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(10000).default(''),
});

export async function list(req, res) {
  res.json(await paginate(Post.find().populate('author', 'name'), Post.estimatedDocumentCount(), req.valid.query));
}

export async function create(req, res) {
  const post = await Post.create({ ...req.valid.body, author: req.user._id });
  res.status(201).json({ post });
}
