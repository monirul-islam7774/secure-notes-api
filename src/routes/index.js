import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate, objectId } from '../middleware/validate.js';
import { paginationSchema } from '../utils/paginate.js';
import * as authC from '../controllers/auth.js';
import * as usersC from '../controllers/users.js';
import * as notesC from '../controllers/notes.js';
import * as postsC from '../controllers/posts.js';
import * as adminC from '../controllers/admin.js';

const idParam = z.object({ id: objectId });
const page = { query: paginationSchema };

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, try again later' } },
});

export const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// auth
router.post('/auth/register', authLimiter, validate({ body: authC.registerSchema }), authC.register);
router.post('/auth/login', authLimiter, validate({ body: authC.loginSchema }), authC.login);

// everything below requires a valid JWT
router.use(auth);

// users (static paths before /:id)
router.get('/users/me', usersC.getMe);
router.patch('/users/me', validate({ body: usersC.updateMeSchema }), usersC.updateMe);
router.get('/users/grouped-by-interest', validate({ query: usersC.groupedQuerySchema }), usersC.groupedByInterest);
router.get('/users/:id/posts', validate({ params: idParam, query: paginationSchema }), usersC.userPosts);

// notes
router.get('/notes', validate(page), notesC.listMine);
router.post('/notes', validate({ body: notesC.noteBody }), notesC.create);
router.get('/notes/:id', validate({ params: idParam }), notesC.getOne);
router.patch('/notes/:id', validate({ params: idParam, body: notesC.noteUpdate }), notesC.update);
router.delete('/notes/:id', validate({ params: idParam }), notesC.remove);

// posts
router.get('/posts', validate(page), postsC.list);
router.post('/posts', validate({ body: postsC.postBody }), postsC.create);

// admin
const admin = Router();
admin.use(requireRole('admin'));
admin.get('/notes', validate(page), adminC.listNotes);
admin.get('/users', validate(page), adminC.listUsers);
admin.post('/users', validate({ body: adminC.createUserSchema }), adminC.createUser);
admin.patch('/users/:id', validate({ params: idParam, body: adminC.updateUserSchema }), adminC.updateUser);
admin.delete('/users/:id', validate({ params: idParam }), adminC.deleteUser);
router.use('/admin', admin);
