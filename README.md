# Secure Notes API

REST API for a secure note-taking app. Node 20+, Express 5, MongoDB + Mongoose, JWT auth, bcrypt (cost 10), zod validation.

- **Live API:** `<LIVE_API_URL>` (health: `<LIVE_API_URL>/api/health`). Render free tier sleeps when idle; the first request can take 30–50 s.
- **Frontend repo:** `secure-notes-web`

## Local setup

```bash
npm i
cp .env.example .env        # edit MONGO_URI / JWT_SECRET if needed
npm run dev-db              # OPTIONAL: in-memory MongoDB on :27017 if you have no local mongod
npm run seed                # drops + seeds demo data
npm run dev                 # http://localhost:5000
npm test                    # jest + supertest + mongodb-memory-server
npm run explain             # query-plan report (see below)
npm run sync-indexes        # create/sync indexes (use in production)
```

## Demo credentials

| Role  | Email            | Password    |
|-------|------------------|-------------|
| admin | admin@demo.com   | Admin@123   |
| user  | alice@demo.com   | User@123    |
| user  | bob@demo.com     | User@123    |

## Roles

- `user`: create / read / update / delete **own** notes; read posts; create posts.
- `admin`: everything a user can do, plus list/create/update/delete users and list every user's notes (and read any single note).
- Public registration always creates `role: 'user'` (a `role` in the body is ignored). Admins come from the seed script or another admin.

## Endpoints

All list endpoints take `?page=1&limit=10` (limit max 50) and return `{ data, page, limit, total, totalPages }`. Errors: `{ error: { message } }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | `{ status: 'ok' }` |
| POST | `/api/auth/register` | none | returns `{ token, user }` |
| POST | `/api/auth/login` | none | returns `{ token, user }` |
| GET / PATCH | `/api/users/me` | user | PATCH: `name`, `interests` |
| GET | `/api/users/grouped-by-interest?interest=` | user | **Scenario 1** |
| GET | `/api/users/:id/posts` | user | **Scenario 2** |
| GET / POST | `/api/notes` | user | own notes, paginated |
| GET / PATCH / DELETE | `/api/notes/:id` | user | owner only (admin may GET any) |
| GET / POST | `/api/posts` | user | visible to everyone |
| GET | `/api/admin/notes` | admin | all notes, owner populated |
| GET / POST | `/api/admin/users` | admin | |
| PATCH / DELETE | `/api/admin/users/:id` | admin | delete cascades to notes + posts; cannot delete self |

Invalid ObjectIds return 400, missing/invalid token 401, wrong role 403, not found (or not yours) 404. `requests.http` covers every endpoint.

## Index strategy

Indexes are declared **only** with `schema.index(...)` at the bottom of each model (no `unique`/`index`/`sparse` in field definitions). `autoIndex` is on outside production; in production run `npm run sync-indexes`.

| Collection | Index | Query it serves | Why |
|---|---|---|---|
| users | `{ email: 1 }` unique | login lookup, duplicate-email check | equality lookup on every login/register; uniqueness enforced by the DB |
| users | `{ interests: 1 }` | `GET /users/grouped-by-interest?interest=x`, first `$match` | multikey index narrows to matching users before `$unwind` |
| notes | `{ owner: 1, _id: -1 }` | `GET /notes` (own notes, newest first, paginated) | equality on owner + `_id` desc sort with no in-memory sort |
| posts | `{ author: 1, _id: -1 }` | `$lookup` in `GET /users/:id/posts` | equality on `author` + `_id` desc sort inside the lookup |

**Why nothing else:** the default `_id` index covers get-by-id, profile fetch, the admin all-notes list and the admin users list. Every list sorts by `_id` descending (ObjectIds are time-ordered), so no `createdAt` index is needed. The unfiltered group-by-interest must read every user (a full grouping), so no index can help it. A test asserts the exact index set.

## Aggregations

### Scenario 1: users grouped by interest (`User.aggregate()` is the only DB call in the handler)

```js
[
  { $match: { interests: interest } },      // only when ?interest= is given (uses { interests: 1 })
  { $unwind: '$interests' },
  { $match: { interests: interest } },      // only when filtered: keep just the requested group
  { $group: { _id: '$interests',
              users: { $push: { _id: '$_id', name: '$name', email: '$email' } },
              count: { $sum: 1 } } },
  { $sort: { count: -1, _id: 1 } },
  { $facet: {                                // pagination of groups, same single call
      data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      meta: [{ $count: 'total' }] } },
]
```

### Scenario 2: all posts of a user (`$lookup`, single pipeline, single `$lookup`)

```js
[
  { $match: { _id: userId } },                                  // _id index
  { $lookup: { from: 'posts', let: { uid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$author', '$$uid'] } } },   // { author: 1, _id: -1 }
        { $sort: { _id: -1 } },                                 // same index, no in-memory sort
        { $facet: {                                             // page + total in one pass
            data: [ { $skip: (page - 1) * limit }, { $limit: limit },
                    { $project: { _id: 1, author: 1, title: 1, body: 1, createdAt: 1, updatedAt: 1 } } ],
            meta: [ { $count: 'total' } ] } },
      ],
      as: 'result' } },
  { $project: { _id: 1, name: 1, interests: 1, result: { $first: '$result' } } },  // strips email/password/role
]
```

The `$expr`/`$eq` form is used because the explain output below confirms it hits `author_1__id_-1`. `$facet` reads all of one author's posts to compute the total, which is fine at per-user scale.

## `npm run explain` output

`explain('executionStats')` against the seeded data (3 users / 10 notes / 6 posts):

```
┌─────────┬───────────────────────────────────────────────────────┬──────────────────────────────────────────────┬───────────────────┬─────────────────────┬──────────┐
│ (index) │ query                                                 │ stages                                       │ index             │ examined            │ returned │
├─────────┼───────────────────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────┼─────────────────────┼──────────┤
│ 0       │ 'login lookup (users by email)'                       │ 'LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN' │ 'email_1'         │ '1 docs / 1 keys'   │ 1        │
│ 1       │ 'own notes list (owner, _id desc, limit 10)'          │ 'LIMIT > FETCH > IXSCAN'                     │ 'owner_1__id_-1'  │ '4 docs / 4 keys'   │ 4        │
│ 2       │ 'admin notes list (all, _id desc, limit 10)'          │ 'LIMIT > FETCH > IXSCAN'                     │ '_id_'            │ '10 docs / 10 keys' │ 10       │
│ 3       │ 'admin users list (all, _id desc, limit 10)'          │ 'LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN' │ '_id_'            │ '3 docs / 3 keys'   │ 3        │
│ 4       │ 'get note by id'                                      │ 'EXPRESS_IXSCAN'                             │ '_id_'            │ '1 docs / 1 keys'   │ 1        │
│ 5       │ 'grouped-by-interest (no filter)'                     │ 'PROJECTION_SIMPLE > COLLSCAN'               │ '(none)'          │ '3 docs / 0 keys'   │ 3        │
│ 6       │ 'grouped-by-interest ?interest=chess'                 │ 'PROJECTION_SIMPLE > FETCH > IXSCAN'         │ 'interests_1'     │ '2 docs / 2 keys'   │ 2        │
│ 7       │ 'user posts: users $match _id (aggregate root)'       │ 'EXPRESS_IXSCAN'                             │ '_id_'            │ '1 docs / 1 keys'   │ 1        │
│ 8       │ 'user posts: $lookup sub-pipeline ($expr $eq author)' │ 'LIMIT > FETCH > IXSCAN'                     │ 'author_1__id_-1' │ '3 docs / 3 keys'   │ 3        │
│ 9       │ 'user posts: $lookup inner query (author, _id desc)'  │ 'LIMIT > FETCH > IXSCAN'                     │ 'author_1__id_-1' │ '3 docs / 3 keys'   │ 3        │
└─────────┴───────────────────────────────────────────────────────┴──────────────────────────────────────────────┴───────────────────┴─────────────────────┴──────────┘
```

Every query is an index scan (`IXSCAN` / `EXPRESS_IXSCAN`) with docs examined equal to docs returned, except the unfiltered grouping, which is an intentional full scan because it must group every user.

## CI/CD

`.github/workflows/ci-cd.yml`: every PR/push runs the Jest suite (Node 20 and 22). Pushes to `main` that pass then sync indexes on Atlas, trigger a Render deploy via its API, wait until it is live and smoke-test `/api/health`. `render.yaml` turns Render's own auto-deploy off so the pipeline is the only deploy path. Setup and required secrets are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).
