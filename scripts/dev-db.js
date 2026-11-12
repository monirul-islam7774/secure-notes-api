// Dev helper for machines without a local MongoDB: runs an in-memory mongod on 127.0.0.1:27017.
import { MongoMemoryServer } from 'mongodb-memory-server';

const server = await MongoMemoryServer.create({ instance: { port: 27017, ip: '127.0.0.1' } });
console.log(`In-memory MongoDB ready at ${server.getUri()}secure-notes`);
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
