import { app } from './app.js';
import { connectDB } from './db.js';
import { env } from './config/env.js';

await connectDB();
app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
