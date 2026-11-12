import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

await connectDB();
for (const Model of [User, Note, Post]) {
  const dropped = await Model.syncIndexes();
  const indexes = await Model.collection.indexes();
  console.log(`${Model.collection.name}: dropped [${dropped.join(', ')}] ->`, indexes.map((i) => i.name).join(', '));
}
await mongoose.disconnect();
