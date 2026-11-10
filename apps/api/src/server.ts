import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Automatically locate and load root .env
let curDir = process.cwd();
for (let i = 0; i < 5; i++) {
  const envCandidate = path.join(curDir, '.env');
  if (fs.existsSync(envCandidate)) {
    dotenv.config({ path: envCandidate });
  }
  const parent = path.dirname(curDir);
  if (parent === curDir) break;
  curDir = parent;
}

import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { connectDatabase, OrganizationModel, ProductionService } from '@claimboard/database';
import { authPlugin } from './plugins/authPlugin';
import { websocketPlugin } from './plugins/websocketPlugin';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/scheduler';

// Routes
import { authRoutes } from './modules/auth/authRoutes';
import { mangaRoutes } from './modules/manga/mangaRoutes';
import { chapterRoutes } from './modules/chapters/chapterRoutes';
import { workTypeRoutes } from './modules/work-types/workTypeRoutes';
import { templateRoutes } from './modules/templates/templateRoutes';
import { assignmentRoutes } from './modules/assignments/assignmentRoutes';
import { claimRoutes } from './modules/claims/claimRoutes';
import { deliverableRoutes } from './modules/deliverables/deliverableRoutes';
import { reviewRoutes } from './modules/reviews/reviewRoutes';
import { pipelineRoutes } from './modules/pipeline/pipelineRoutes';
import { analyticsRoutes } from './modules/analytics/analyticsRoutes';
import { teamRoutes } from './modules/team/teamRoutes';
import { discordRoutes } from './modules/discord/discordRoutes';
import { notificationRoutes } from './modules/notifications/notificationRoutes';
import { auditRoutes } from './modules/audit/auditRoutes';
import { settingsRoutes } from './modules/settings/settingsRoutes';
import { deadlineRoutes } from './modules/deadlines/deadlineRoutes';

export async function buildServer() {
  const app = fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
    },
  });

  // Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // Let frontend dev server manage CSP
    crossOriginEmbedderPolicy: false,
  });

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Cookies
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'claimboard_cookie_secret_key_12345678',
  });

  // WebSockets
  await app.register(websocket);
  await app.register(websocketPlugin);

  // Authentication Decorators
  await app.register(authPlugin);

  // Health and Readiness Check Endpoints (Specification #56)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/ready', async () => ({ status: 'ready', uptime: process.uptime() }));

  // Register API Modules
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(mangaRoutes, { prefix: '/api/manga' });
  await app.register(chapterRoutes, { prefix: '/api/chapters' });
  await app.register(workTypeRoutes, { prefix: '/api/work-types' });
  await app.register(templateRoutes, { prefix: '/api/templates' });
  await app.register(assignmentRoutes, { prefix: '/api/assignments' });
  await app.register(claimRoutes, { prefix: '/api/claims' });
  await app.register(deliverableRoutes, { prefix: '/api/deliverables' });
  await app.register(reviewRoutes, { prefix: '/api/reviews' });
  await app.register(pipelineRoutes, { prefix: '/api/pipeline' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(teamRoutes, { prefix: '/api/team' });
  await app.register(discordRoutes, { prefix: '/api/discord' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(deadlineRoutes, { prefix: '/api/deadlines' });

  return app;
}

export async function start() {
  try {
    // 1. Connect to Database & remove legacy roles/duplicate assignments
    await connectDatabase();
    await ProductionService.cleanupLegacyRolesAndDuplicates().catch((e) =>
      console.warn('[Server] Non-fatal startup cleanup warning:', e?.message || e)
    );

    // 2. Build Fastify instance

    // 3. Build Fastify instance
    const app = await buildServer();

    // 4. Start Background Jobs
    startBackgroundJobs();

    // 5. Listen
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = '0.0.0.0';
    await app.listen({ port, host });

    console.log(`=======================================================`);
    console.log(`  🚀 ClaimBoard Production API running on: http://localhost:${port}`);
    console.log(`  📡 WebSocket Gateway: ws://localhost:${port}/ws`);
    console.log(`  🔍 Health Checks: http://localhost:${port}/health`);
    console.log(`=======================================================`);

    // 6. Launch integrated Discord Bot worker if token is configured
    let botClient: any = null;
    const discordToken = process.env.DISCORD_BOT_TOKEN;
    if (discordToken && discordToken !== 'mock_discord_bot_token' && process.env.DISABLE_BOT !== 'true') {
      try {
        console.log('[Server] Starting integrated Discord Bot worker...');
        const { setupSapphireBot } = await import('@claimboard/discord-bot');
        botClient = await setupSapphireBot();
      } catch (botErr: any) {
        console.error('[Server] Failed to launch integrated Discord Bot:', botErr?.message || botErr);
      }
    }

    // Graceful Shutdown
    const closeGracefully = async (signal: string) => {
      console.log(`[Server] Received signal: ${signal}. Closing gracefully...`);
      stopBackgroundJobs();
      if (botClient && typeof botClient.destroy === 'function') {
        try {
          await botClient.destroy();
          console.log('[Server] Discord Bot gateway connection closed.');
        } catch {}
      }
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', () => closeGracefully('SIGINT'));
    process.on('SIGTERM', () => closeGracefully('SIGTERM'));
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  start();
}
