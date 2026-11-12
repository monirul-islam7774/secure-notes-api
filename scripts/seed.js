import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

export async function seed() {
  await Promise.all([User.deleteMany({}), Note.deleteMany({}), Post.deleteMany({})]);
  await Promise.all([User.syncIndexes(), Note.syncIndexes(), Post.syncIndexes()]);

  const hash = (p) => bcrypt.hash(p, 10);
  const [adminPw, userPw] = await Promise.all([hash('Admin@123'), hash('User@123')]);

  const [admin, alice, bob] = await User.create([
    { name: 'Admin', email: 'admin@demo.com', password: adminPw, role: 'admin', interests: ['reading', 'travel'] },
    { name: 'Alice', email: 'alice@demo.com', password: userPw, role: 'user', interests: ['chess', 'reading', 'music'] },
    { name: 'Bob', email: 'bob@demo.com', password: userPw, role: 'user', interests: ['chess', 'music', 'cooking'] },
  ]);

  const notes = [
    [admin, 'Admin handbook', 'Rotate the JWT secret quarterly.'],
    [admin, 'Onboarding checklist', 'Create accounts, assign roles.'],
    [alice, 'Groceries', 'Eggs, milk, bread.'],
    [alice, 'Chess openings', 'Study the Sicilian Defence.'],
    [alice, 'Book list', 'Dune, Neuromancer, Snow Crash.'],
    [alice, 'Meeting notes', 'Ship the API by Friday.'],
    [bob, 'Recipe: pasta', 'Boil, drain, sauce.'],
    [bob, 'Playlist ideas', 'Jazz for focus.'],
    [bob, 'Gym plan', 'Mon legs, Wed back, Fri chest.'],
    [bob, 'Travel wishlist', 'Lisbon, Kyoto, Cape Town.'],
  ];
  await Note.create(notes.map(([owner, title, content]) => ({ owner: owner._id, title, content })));

  const posts = [
    [alice, 'My favourite chess puzzle', 'Mate in three, can you find it?'],
    [alice, 'Reading challenge', 'Fifty books this year.'],
    [alice, 'Music for coding', 'Instrumentals only.'],
    [bob, 'Weeknight cooking', 'Fifteen-minute meals.'],
    [bob, 'Chess club meetup', 'Saturday at the cafe.'],
    [admin, 'Welcome!', 'Be kind and keep notes private.'],
  ];
  // sequential so _id order matches creation order
  for (const [author, title, body] of posts) await Post.create({ author: author._id, title, body });

  return { users: 3, notes: notes.length, posts: posts.length };
}

if (process.argv[1]?.endsWith('seed.js')) {
  await connectDB();
  console.log('Seeded:', await seed());
  await mongoose.disconnect();
}
