import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

// Walk an explain() document and collect every stage / index name / examined counts.
function summarize(explain) {
  const stages = new Set();
  const indexes = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.stage === 'string') stages.add(o.stage);
    if (typeof o.indexName === 'string') indexes.add(o.indexName);
    for (const v of Object.values(o)) walk(v);
  };
  const root = explain.stages ? explain.stages[0]?.$cursor ?? explain : explain;
  const win = root.queryPlanner?.winningPlan ?? explain.queryPlanner?.winningPlan;
  walk(win);
  const es = root.executionStats ?? explain.executionStats ?? {};
  return {
    stages: [...stages].join(' > '),
    index: [...indexes].join(', ') || '(none)',
    examined: `${es.totalDocsExamined ?? '?'} docs / ${es.totalKeysExamined ?? '?'} keys`,
    returned: es.nReturned ?? '?',
  };
}

const rows = [];
async function run(name, queryOrPromise) {
  const explain = await queryOrPromise;
  rows.push({ query: name, ...summarize(explain) });
}

await connectDB();
const alice = await User.findOne({ email: 'alice@demo.com' }).lean();
const note = await Note.findOne({ owner: alice._id }).lean();
if (!alice || !note) {
  console.error('Run `npm run seed` first.');
  process.exit(1);
}

await run('login lookup (users by email)', User.find({ email: 'alice@demo.com' }).limit(1).explain('executionStats'));
await run('own notes list (owner, _id desc, limit 10)', Note.find({ owner: alice._id }).sort({ _id: -1 }).limit(10).explain('executionStats'));
await run('admin notes list (all, _id desc, limit 10)', Note.find().sort({ _id: -1 }).limit(10).explain('executionStats'));
await run('admin users list (all, _id desc, limit 10)', User.find().sort({ _id: -1 }).limit(10).explain('executionStats'));
await run('get note by id', Note.find({ _id: note._id }).explain('executionStats'));
await run(
  'grouped-by-interest (no filter)',
  User.aggregate([
    { $unwind: '$interests' },
    { $group: { _id: '$interests', users: { $push: { _id: '$_id', name: '$name', email: '$email' } }, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]).explain('executionStats'),
);
await run(
  'grouped-by-interest ?interest=chess',
  User.aggregate([
    { $match: { interests: 'chess' } },
    { $unwind: '$interests' },
    { $match: { interests: 'chess' } },
    { $group: { _id: '$interests', users: { $push: { _id: '$_id', name: '$name', email: '$email' } }, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]).explain('executionStats'),
);
await run(
  'user posts: users $match _id (aggregate root)',
  User.aggregate([{ $match: { _id: alice._id } }]).explain('executionStats'),
);
await run(
  'user posts: $lookup sub-pipeline ($expr $eq author)',
  Post.aggregate([{ $match: { $expr: { $eq: ['$author', alice._id] } } }, { $sort: { _id: -1 } }, { $limit: 10 }]).explain('executionStats'),
);
await run('user posts: $lookup inner query (author, _id desc)', Post.find({ author: alice._id }).sort({ _id: -1 }).limit(10).explain('executionStats'));

console.table(rows);
await mongoose.disconnect();
