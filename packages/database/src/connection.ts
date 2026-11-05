
import dns from 'dns';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Automatically locate and load root .env
let searchDir = process.cwd();
for (let i = 0; i < 5; i++) {
  const envCandidate = path.join(searchDir, '.env');
  if (fs.existsSync(envCandidate)) {
    dotenv.config({ path: envCandidate });
  }
  const parent = path.dirname(searchDir);
  if (parent === searchDir) break;
  searchDir = parent;
}

// Configure Cloudflare 1.1.1.1 DNS for reliable MongoDB Atlas SRV lookup
try {
  dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']);
  if ((dns as any).setDefaultResultOrder) {
    (dns as any).setDefaultResultOrder('ipv4first');
  }
  console.log('[Database] Configured Cloudflare 1.1.1.1 DNS servers for MongoDB connection.');
} catch (dnsErr) {
  console.warn('[Database] Notice on setting DNS servers:', dnsErr);
}

export interface ConnectOptions {
  uri?: string;
  dbName?: string;
}

export async function connectDatabase(options: ConnectOptions = {}): Promise<typeof mongoose> {
  const uri = options.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/claimboard';
  const dbName =
    options.dbName ||
    process.env.MONGODB_DB_NAME ||
    process.env.MONGODB_DATABASE ||
    process.env.MONGO_DATABASE ||
    process.env.MONGO_INITDB_DATABASE ||
    undefined;

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
    console.log(`[Database] Connecting to MongoDB: ${maskedUri}${dbName ? ` [Database: ${dbName}]` : ''}`);

    await mongoose.connect(uri, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 8000,
    } as any);

    console.log(`[Database] Connected to MongoDB successfully.${dbName ? ` (database: ${dbName})` : ''}`);
    return mongoose;
  } catch (err: any) {
    console.error(`[Database] Failed to connect to MongoDB (${err.message}).`);
    console.error('[Database] Please verify your MONGODB_URI and MONGODB_DB_NAME in .env or ensure MongoDB is reachable.');
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] Disconnected from MongoDB.');
  }
}
