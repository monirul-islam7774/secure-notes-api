import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://placeholder/test';
process.env.JWT_SECRET = 'test-secret-test-secret';

let mongod, app, User, Note, Post;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  ({ app } = await import('../src/app.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ Note } = await import('../src/models/Note.js'));
  ({ Post } = await import('../src/models/Post.js'));
  await mongoose.connect(mongod.getUri('test'));
  await Promise.all([User.init(), Note.init(), Post.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Note.deleteMany({}), Post.deleteMany({})]);
});

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

async function makeUser(name, interests = []) {
  const res = await register({ name, email: `${name}@t.com`, password: 'secret1', interests });
  return { token: res.body.token, id: res.body.user._id };
}
async function makeAdmin() {
  await User.create({ name: 'Root', email: 'root@t.com', password: await bcrypt.hash('secret1', 10), role: 'admin' });
  const res = await login('root@t.com', 'secret1');
  return { token: res.body.token, id: res.body.user._id };
}

describe('auth', () => {
  it('registers as role user (ignores role in body), never returns password, hashes with bcrypt', async () => {
    const res = await register({ name: 'a', email: 'A@T.com', password: 'secret1', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.email).toBe('a@t.com');
    expect(res.body.user.password).toBeUndefined();
    const stored = await User.findOne({ email: 'a@t.com' }).select('+password');
    expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
  });

  it('rejects duplicates (409), bad logins (401) and invalid bodies (400)', async () => {
    await makeUser('dup');
    expect((await register({ name: 'dup', email: 'dup@t.com', password: 'secret1' })).status).toBe(409);
    expect((await login('dup@t.com', 'wrong-pass')).status).toBe(401);
    expect((await register({ name: '', email: 'nope', password: '1' })).status).toBe(400);
    expect((await login('dup@t.com', 'secret1')).body.user.password).toBeUndefined();
  });

  it('requires a token on protected routes', async () => {
    expect((await request(app).get('/api/notes')).status).toBe(401);
    expect((await request(app).get('/api/notes').set(bearer('garbage'))).status).toBe(401);
  });
});

describe('notes + owner isolation', () => {
  it('CRUD for the owner; others get 404; invalid id gets 400', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const created = await request(app).post('/api/notes').set(bearer(alice.token)).send({ title: 'T', content: 'C' });
    expect(created.status).toBe(201);
    const id = created.body.note._id;

    expect((await request(app).get(`/api/notes/${id}`).set(bearer(alice.token))).status).toBe(200);
    expect((await request(app).get(`/api/notes/${id}`).set(bearer(bob.token))).status).toBe(404);
    expect((await request(app).patch(`/api/notes/${id}`).set(bearer(bob.token)).send({ title: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/notes/${id}`).set(bearer(bob.token))).status).toBe(404);
    expect((await request(app).get('/api/notes/not-an-id').set(bearer(alice.token))).status).toBe(400);

    const upd = await request(app).patch(`/api/notes/${id}`).set(bearer(alice.token)).send({ title: 'New' });
    expect(upd.body.note.title).toBe('New');
    expect((await request(app).get('/api/notes').set(bearer(bob.token))).body.total).toBe(0);
    expect((await request(app).delete(`/api/notes/${id}`).set(bearer(alice.token))).status).toBe(200);
  });

  it('paginates newest first with the standard shape and caps limit at 50', async () => {
    const alice = await makeUser('alice');
    for (let i = 1; i <= 12; i++) await request(app).post('/api/notes').set(bearer(alice.token)).send({ title: `n${i}` });
    const p1 = await request(app).get('/api/notes?page=1&limit=5').set(bearer(alice.token));
    expect(p1.body).toMatchObject({ page: 1, limit: 5, total: 12, totalPages: 3 });
    expect(p1.body.data.map((n) => n.title)).toEqual(['n12', 'n11', 'n10', 'n9', 'n8']);
    const p3 = await request(app).get('/api/notes?page=3&limit=5').set(bearer(alice.token));
    expect(p3.body.data).toHaveLength(2);
    expect((await request(app).get('/api/notes?limit=51').set(bearer(alice.token))).status).toBe(400);
  });
});

describe('roles', () => {
  it('admin routes return 403 for a user and work for an admin', async () => {
    const alice = await makeUser('alice');
    const admin = await makeAdmin();
    expect((await request(app).get('/api/admin/users').set(bearer(alice.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/notes').set(bearer(alice.token))).status).toBe(403);
    await request(app).post('/api/notes').set(bearer(alice.token)).send({ title: 'secret' });
    const all = await request(app).get('/api/admin/notes').set(bearer(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.data[0].owner.email).toBe('alice@t.com');
    const users = await request(app).get('/api/admin/users').set(bearer(admin.token));
    expect(users.body.total).toBe(2);
    expect(users.body.data.every((u) => u.password === undefined)).toBe(true);
  });

  it('admin can read any single note but not edit another user note', async () => {
    const alice = await makeUser('alice');
    const admin = await makeAdmin();
    const { body } = await request(app).post('/api/notes').set(bearer(alice.token)).send({ title: 'x' });
    const id = body.note._id;
    expect((await request(app).get(`/api/notes/${id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await request(app).patch(`/api/notes/${id}`).set(bearer(admin.token)).send({ title: 'y' })).status).toBe(404);
  });

  it('admin creates/updates/deletes users; delete cascades; cannot delete self', async () => {
    const alice = await makeUser('alice');
    const admin = await makeAdmin();
    await request(app).post('/api/notes').set(bearer(alice.token)).send({ title: 'x' });
    await request(app).post('/api/posts').set(bearer(alice.token)).send({ title: 'p' });

    const created = await request(app).post('/api/admin/users').set(bearer(admin.token)).send({ name: 'M', email: 'm@t.com', password: 'secret1', role: 'admin' });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('admin');
    const upd = await request(app).patch(`/api/admin/users/${alice.id}`).set(bearer(admin.token)).send({ name: 'Alicia', role: 'admin' });
    expect(upd.body.user).toMatchObject({ name: 'Alicia', role: 'admin' });

    expect((await request(app).delete(`/api/admin/users/${admin.id}`).set(bearer(admin.token))).status).toBe(400);
    expect((await request(app).delete(`/api/admin/users/${alice.id}`).set(bearer(admin.token))).status).toBe(200);
    expect(await Note.countDocuments({ owner: alice.id })).toBe(0);
    expect(await Post.countDocuments({ author: alice.id })).toBe(0);
  });
});

describe('aggregations', () => {
  it('Scenario 1: groups users by interest, optional filter, sorted by count desc then name', async () => {
    const a = await makeUser('alice', ['chess', 'reading']);
    await makeUser('bob', ['chess', 'music']);
    await makeUser('cara', ['music']);
    await makeUser('dan', ['chess']);
    const res = await request(app).get('/api/users/grouped-by-interest').set(bearer(a.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((g) => [g._id, g.count])).toEqual([['chess', 3], ['music', 2], ['reading', 1]]);
    expect(res.body.data[0].users[0]).toEqual({ _id: expect.any(String), name: expect.any(String), email: expect.any(String) });
    expect(res.body).toMatchObject({ page: 1, limit: 10, total: 3, totalPages: 1 });

    const f = await request(app).get('/api/users/grouped-by-interest?interest=music').set(bearer(a.token));
    expect(f.body.data).toHaveLength(1);
    expect(f.body.data[0]).toMatchObject({ _id: 'music', count: 2 });

    const paged = await request(app).get('/api/users/grouped-by-interest?limit=1&page=2').set(bearer(a.token));
    expect(paged.body.data.map((g) => g._id)).toEqual(['music']);
    expect(paged.body.totalPages).toBe(3);
  });

  it('Scenario 2: returns a user posts via $lookup, newest first, paginated, no sensitive fields', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    for (const t of ['p1', 'p2', 'p3']) await request(app).post('/api/posts').set(bearer(alice.token)).send({ title: t });
    await request(app).post('/api/posts').set(bearer(bob.token)).send({ title: 'bobs' });

    const res = await request(app).get(`/api/users/${alice.id}/posts?limit=2`).set(bearer(bob.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.title)).toEqual(['p3', 'p2']);
    expect(res.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.user).toEqual({ _id: alice.id, name: 'alice', interests: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/password|email/);

    expect((await request(app).get(`/api/users/${alice.id}/posts?page=2&limit=2`).set(bearer(bob.token))).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/users/${new mongoose.Types.ObjectId()}/posts`).set(bearer(bob.token))).status).toBe(404);
    expect((await request(app).get('/api/users/xyz/posts').set(bearer(bob.token))).status).toBe(400);
  });
});

describe('misc', () => {
  it('health, profile update, and posts list', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    const u = await makeUser('alice');
    const me = await request(app).patch('/api/users/me').set(bearer(u.token)).send({ name: 'Al', interests: ['go'] });
    expect(me.body.user).toMatchObject({ name: 'Al', interests: ['go'] });
    await request(app).post('/api/posts').set(bearer(u.token)).send({ title: 'hello' });
    const posts = await request(app).get('/api/posts').set(bearer(u.token));
    expect(posts.body.data[0].author.name).toBe('Al');
  });

  it('only the intended indexes exist', async () => {
    const names = async (M) => (await M.collection.indexes()).map((i) => i.name).sort();
    expect(await names(User)).toEqual(['_id_', 'email_1', 'interests_1']);
    expect(await names(Note)).toEqual(['_id_', 'owner_1__id_-1']);
    expect(await names(Post)).toEqual(['_id_', 'author_1__id_-1']);
  });
});
