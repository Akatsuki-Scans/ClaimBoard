import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { BotModule, BotCommand, CommandContext } from '../../core/types';
import { moduleManager } from '../../core/moduleManager';

// /ping command
const pingCommand: BotCommand = {
  name: 'ping',
  description: 'Check bot latency and gateway connection health',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and gateway connection health'),
  execute: async ({ client, interaction }: CommandContext) => {
    const wsPing = client.ws.ping;
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: 'Gateway WebSocket Latency', value: `${wsPing}ms`, inline: true },
        { name: 'Roundtrip API Latency', value: `${roundtrip}ms`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};

// /modules command
const modulesCommand: BotCommand = {
  name: 'modules',
  description: 'View loaded bot modules and their status',
  data: new SlashCommandBuilder()
    .setName('modules')
    .setDescription('View loaded bot modules and their status'),
  execute: async ({ interaction }: CommandContext) => {
    const modules = moduleManager.getAllModules();

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('📦 Bot Modules System')
      .setDescription(`There are currently **${modules.length}** module(s) loaded in ClaimBoard Discord Bot.`)
      .setTimestamp();

    for (const mod of modules) {
      const statusIcon = mod.enabled !== false ? '🟢 Active' : '🔴 Disabled';
      const cmdCount = mod.commands?.length || 0;
      embed.addFields({
        name: `${mod.name} (ID: \`${mod.id}\`)`,
        value: `**Status**: ${statusIcon}\n**Description**: ${mod.description}\n**Commands**: ${cmdCount} command(s)`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

// /help command
const helpCommand: BotCommand = {
  name: 'help',
  description: 'Display all available commands categorized by module',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display all available commands categorized by module'),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const modules = moduleManager.getEnabledModules();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('ClaimBoard Bot Command Directory')
      .setDescription('Explore available commands grouped by module below:')
      .setFooter({ text: 'ClaimBoard • Modular Discord Architecture' })
      .setTimestamp();

    for (const mod of modules) {
      if (!mod.commands || mod.commands.length === 0) continue;
      const cmdList = mod.commands
        .map((c) => `• \`/${c.name}\` — ${c.description}`)
        .join('\n');

      embed.addFields({
        name: `📂 ${mod.name}`,
        value: cmdList || 'No commands registered.',
        inline: false,
      });
    }

    embed.addFields({
      name: '🌐 Web Platform',
      value: `[Open ClaimBoard Web App](${webUrl})`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

export const systemModule: BotModule = {
  id: 'system',
  name: 'System & Utility Module',
  description: 'Core bot management, module inspection, and diagnostic commands',
  version: '1.0.0',
  enabled: true,
  commands: [pingCommand, modulesCommand, helpCommand],
  onLoad: () => {
    console.log('[SystemModule] System & Utility module initialized.');
  },
};
