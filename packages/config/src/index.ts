import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. Load from current working directory
dotenv.config();

// 2. Search upward to find workspace root .env if running from apps/api, apps/web, etc.
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

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000').transform((v) => parseInt(v, 10)),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().optional().default(''),
  BETTER_AUTH_SECRET: z.string().default('claimboard_super_secret_production_key_change_me'),
  DISCORD_CLIENT_ID: z.string().optional().default('123456789012345678'),
  DISCORD_CLIENT_SECRET: z.string().optional().default('mock_discord_client_secret'),
  DISCORD_BOT_TOKEN: z.string().optional().default('mock_discord_bot_token'),
  DISCORD_PUBLIC_KEY: z.string().optional().default('mock_discord_public_key'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function loadEnvConfig(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error('Environment configuration validation failed');
  }
  return result.data;
}

export const env = loadEnvConfig();
