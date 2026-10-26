let cache = global.__sonoro || (global.__sonoro = {});

async function getDb() {
  if (global.__SONORO_TEST_DB) return global.__SONORO_TEST_DB;
  if (cache.db) return cache.db;
  const { MongoClient } = require('mongodb');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta MONGODB_URI');
  if (!cache.promise) cache.promise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
  const client = await cache.promise;
  const db = client.db(process.env.MONGODB_DB || 'sonoro');
  await Promise.all([
    db.collection('users').createIndex({ username: 1 }, { unique: true }),
    db.collection('attempts').createIndex({ exp: 1 }, { expireAfterSeconds: 0 }),
  ]);
  cache.db = db;
  return db;
}
module.exports = { getDb };
