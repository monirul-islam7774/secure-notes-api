import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { publicUser } from '../utils/token.js';
import { paginationSchema, buildPage } from '../utils/paginate.js';

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  interests: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const groupedQuerySchema = paginationSchema.extend({ interest: z.string().trim().min(1).optional() });

export const getMe = (req, res) => res.json({ user: publicUser(req.user) });

export async function updateMe(req, res) {
  Object.assign(req.user, req.valid.body);
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}

// Scenario 1: exactly one User.aggregate() call; nothing else touches the DB in this handler.
export async function groupedByInterest(req, res) {
  const { interest, page, limit } = req.valid.query;
  const pipeline = [];
  if (interest) pipeline.push({ $match: { interests: interest } }); // served by { interests: 1 }
  pipeline.push({ $unwind: '$interests' });
  if (interest) pipeline.push({ $match: { interests: interest } });
  pipeline.push(
    {
      $group: {
        _id: '$interests',
        users: { $push: { _id: '$_id', name: '$name', email: '$email' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  );
  const [result] = await User.aggregate(pipeline);
  const total = result.meta[0]?.total ?? 0;
  res.json(buildPage({ data: result.data, page, limit, total }));
}

// Scenario 2: single aggregation using $lookup; posts are paginated inside the lookup.
export async function userPosts(req, res) {
  const { id } = req.valid.params;
  const { page, limit } = req.valid.query;
  const uid = new mongoose.Types.ObjectId(id);
  const [doc] = await User.aggregate([
    { $match: { _id: uid } }, // _id index
    {
      // ONE $lookup. The sub-pipeline's $match + $sort use { author: 1, _id: -1 };
      // $facet inside it returns the requested page and the total in a single pass.
      $lookup: {
        from: 'posts',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$author', '$$uid'] } } },
          { $sort: { _id: -1 } },
          {
            $facet: {
              data: [
                { $skip: (page - 1) * limit },
                { $limit: limit },
                { $project: { _id: 1, author: 1, title: 1, body: 1, createdAt: 1, updatedAt: 1 } },
              ],
              meta: [{ $count: 'total' }],
            },
          },
        ],
        as: 'result',
      },
    },
    { $project: { _id: 1, name: 1, interests: 1, result: { $first: '$result' } } }, // strips email/password/role
  ]);
  if (!doc) throw new HttpError(404, 'User not found');
  res.json({
    user: { _id: doc._id, name: doc.name, interests: doc.interests },
    ...buildPage({ data: doc.result.data, page, limit, total: doc.result.meta[0]?.total ?? 0 }),
  });
}
