import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Automatically locate and load root .env
let curDir = process.cwd();
let loadedEnvPath: string | null = null;
for (let i = 0; i < 5; i++) {
  const envCandidate = path.join(curDir, '.env');
  if (fs.existsSync(envCandidate)) {
    dotenv.config({ path: envCandidate });
    loadedEnvPath = envCandidate;
    break;
  }
  const parent = path.dirname(curDir);
  if (parent === curDir) break;
  curDir = parent;
}


import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, ActivityType, Partials } from 'discord.js';
import { connectDatabase } from '@claimboard/database';
import { moduleManager } from './core/moduleManager';
import { CommandRouter } from './core/commandRouter';
import { installedModules } from './modules';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';


export class ClaimBoardClient extends SapphireClient {
  public constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
      ],
      partials: [
        Partials.Channel, // Crucial for receiving DMs in discord.js
        Partials.Message,
        Partials.User,
        Partials.Reaction,
      ],
      defaultPrefix: '!',
      loadMessageCommandListeners: true,
      presence: {
        status: 'online',
        activities: [
          {
            name: 'ClaimBoard • Modular Scanlation Engine',
            type: ActivityType.Watching,
          },
        ],
      },
    });
  }
}

export const client = new ClaimBoardClient();
export const commandRouter = new CommandRouter(client, WEB_URL);

let isBotInitialized = false;

export async function setupSapphireBot() {
  if (isBotInitialized) {
    return client;
  }
  isBotInitialized = true;

  console.log('=======================================================');
  console.log('  🤖 Booting ClaimBoard Modular Discord Bot System...');
  console.log('=======================================================');
  if (loadedEnvPath) {
    console.log(`[ModularBot] Environment loaded from: ${loadedEnvPath}`);
  }

  const activeWebUrl = process.env.FRONTEND_URL || process.env.WEB_URL || WEB_URL;
  commandRouter.setWebUrl(activeWebUrl);

  // 1. Connect to MongoDB Atlas (if not already connected)
  await connectDatabase();

  // 2. Initialize Module Manager and register installed modules
  moduleManager.setClient(client);
  for (const mod of installedModules) {
    moduleManager.registerModule(mod);
  }

  const allCmds = moduleManager.getAllCommands();
  console.log(`[ModularBot] Loaded ${moduleManager.getAllModules().length} modules with ${allCmds.length} total commands.`);

  // 3. Set up event hooks
  client.once('ready', async () => {
    console.log(`[ModularBot] 🟢 Connected to Discord Gateway! Logged in as ${client.user?.tag || 'Bot'}`);

    // Auto Command Module: automatically syncs all slash commands across all active modules
    await commandRouter.syncSlashCommands();
  });

  // Handle slash commands, buttons, autocompletes
  client.on('interactionCreate', async (interaction) => {
    await commandRouter.handleInteraction(interaction);
  });

  // Handle text messages in Server Channels and Direct Messages (DMs)
  client.on('messageCreate', async (message) => {
    await commandRouter.handleMessage(message);
  });

  // Handle channel deletions (cleanup honeypot trap and log channels)
  client.on('channelDelete', async (channel) => {
    const { handleChannelDelete } = await import('./modules/honeypot');
    await handleChannelDelete(channel as any);
  });

  // Handle guild deletions / bot removed from guild
  client.on('guildDelete', async (guild) => {
    const { handleGuildDelete } = await import('./modules/honeypot');
    await handleGuildDelete(guild);
  });

  // 4. Connect to Discord Gateway
  const token = process.env.DISCORD_BOT_TOKEN || BOT_TOKEN;
  if (!token || token === 'mock_discord_bot_token') {
    console.log('[ModularBot] ⚠️ Notice: DISCORD_BOT_TOKEN is set to "mock_discord_bot_token" in root .env.');
    console.log('[ModularBot] To bring the bot Online on Discord, replace DISCORD_BOT_TOKEN in root .env with your real token.');
    console.log('[ModularBot] Active registered modules:');
    for (const mod of moduleManager.getEnabledModules()) {
      console.log(`   • [${mod.id}] ${mod.name}: ${mod.commands?.map((c) => `/${c.name}`).join(', ')}`);
    }
    return client;
  }

  try {
    await client.login(token);
  } catch (error: any) {
    console.error('[ModularBot] 🔴 Could not login to Discord Gateway:', error.message || error);
  }

  return client;
}


export * from './core/types';
export * from './core/moduleManager';
export * from './core/commandRouter';
export * from './modules';

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  setupSapphireBot();
}
