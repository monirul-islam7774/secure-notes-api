import { z } from 'zod';
import { Note } from '../models/Note.js';
import { HttpError } from '../utils/httpError.js';
import { paginate } from '../utils/paginate.js';

export const noteBody = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(10000).default(''),
});
export const noteUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(10000).optional(),
});

export async function listMine(req, res) {
  const filter = { owner: req.user._id };
  res.json(await paginate(Note.find(filter), Note.countDocuments(filter), req.valid.query));
}

export async function create(req, res) {
  const note = await Note.create({ ...req.valid.body, owner: req.user._id });
  res.status(201).json({ note });
}

export async function getOne(req, res) {
  const filter = { _id: req.valid.params.id };
  if (req.user.role !== 'admin') filter.owner = req.user._id; // ownership enforced in the DB query
  const note = await Note.findOne(filter).populate('owner', 'name email');
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ note });
}

export async function update(req, res) {
  const note = await Note.findOneAndUpdate({ _id: req.valid.params.id, owner: req.user._id }, req.valid.body, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ note });
}

export async function remove(req, res) {
  const note = await Note.findOneAndDelete({ _id: req.valid.params.id, owner: req.user._id });
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ message: 'Note deleted' });
}
