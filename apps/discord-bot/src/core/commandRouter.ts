import { Client, Interaction, Message, EmbedBuilder } from 'discord.js';
import { moduleManager } from './moduleManager';
import { processApprove, processPending, processRevoke } from '../modules/admin';

export class CommandRouter {
  private client: Client;
  private webUrl: string;

  constructor(client: Client, webUrl: string) {
    this.client = client;
    this.webUrl = webUrl;
  }

  // Auto-registers all slash commands from registered modules with Discord API (enabling DM access)
  public async syncSlashCommands(): Promise<void> {
    try {
      if (!this.client.application) {
        console.warn('[CommandRouter] client.application is not ready yet. Skipping slash command registration.');
        return;
      }

      const activeCommands = moduleManager.getAllCommands();
      const slashData = activeCommands.map(({ command }) => {
        const data = command.data;
        if (data && 'setDMPermission' in data && typeof data.setDMPermission === 'function') {
          data.setDMPermission(true);
        }
        return data;
      });

      console.log(`[CommandRouter] Auto-registering ${slashData.length} slash commands across ${moduleManager.getEnabledModules().length} modules (with DM support enabled)...`);
      await this.client.application.commands.set(slashData);
      console.log(`[CommandRouter] Successfully registered ${slashData.length} slash commands with Discord.`);
    } catch (err) {
      console.warn('[CommandRouter] Notice on registering slash commands with Discord API:', err);
    }
  }

  // Handle incoming Discord interaction (Slash commands, buttons, autocompletes, select menus)
  public async handleInteraction(interaction: Interaction): Promise<void> {
    // 1. Handle Slash Command
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;
      const match = moduleManager.findCommand(commandName);

      if (!match) {
        await interaction.reply({
          content: `Command \`/${commandName}\` is not recognized or its module is currently disabled.`,
          ephemeral: true,
        });
        return;
      }

      const { command, module } = match;

      try {
        await command.execute({
          client: this.client,
          interaction,
          webUrl: this.webUrl,
        });
      } catch (err: any) {
        console.error(`[CommandRouter] Error executing /${commandName} (Module: ${module.id}):`, err);
        const errorMessage = `Command Error: ${err.message || 'An unexpected error occurred.'}`;

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => null);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => null);
        }
      }
      return;
    }

    // 2. Handle Autocomplete
    if (interaction.isAutocomplete()) {
      const match = moduleManager.findCommand(interaction.commandName);
      if (match && match.command.autocomplete) {
        try {
          await match.command.autocomplete(interaction);
        } catch (err) {
          console.error(`[CommandRouter] Error in autocomplete for /${interaction.commandName}:`, err);
        }
      }
      return;
    }

    // 3. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;
      for (const { command } of moduleManager.getAllCommands()) {
        if (command.handleButton) {
          try {
            await command.handleButton(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (err) {
            console.error(`[CommandRouter] Error handling button ${customId}:`, err);
          }
        }
      }
      return;
    }

    // 4. Handle String Select Menus
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      for (const { command } of moduleManager.getAllCommands()) {
        if (command.handleSelect) {
          try {
            await command.handleSelect(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (err) {
            console.error(`[CommandRouter] Error handling select menu ${customId}:`, err);
          }
        }
      }
      return;
    }
  }

  // Handle incoming text message in Server Channels or Direct Messages (DMs)
  public async handleMessage(message: Message): Promise<void> {
    // Ignore bots
    if (message.author.bot) return;

    const isDM = !message.guild;
    const content = message.content.trim();
    const botMention = this.client.user ? `<@${this.client.user.id}>` : '';
    const botNickMention = this.client.user ? `<@!${this.client.user.id}>` : '';

    let commandText = '';

    if (content.startsWith('!')) {
      commandText = content.slice(1).trim();
    } else if (botMention && content.startsWith(botMention)) {
      commandText = content.slice(botMention.length).trim();
    } else if (botNickMention && content.startsWith(botNickMention)) {
      commandText = content.slice(botNickMention.length).trim();
    } else if (isDM) {
      // In DMs, allow running commands directly without prefix
      commandText = content;
    } else {
      return;
    }

    if (!commandText) {
      if (isDM) {
        await message.reply(
          `👋 Hello **${message.author.username}**! I am the ClaimBoard Bot. Type \`!help\` or use slash commands like \`/help\` to see what I can do.`
        );
      }
      return;
    }

    const parts = commandText.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'ping': {
        const wsPing = this.client.ws.ping;
        const reply = await message.reply('🏓 Pinging...');
        const roundtrip = reply.createdTimestamp - message.createdTimestamp;
        const embed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Gateway Latency', value: `${wsPing}ms`, inline: true },
            { name: 'Roundtrip API Latency', value: `${roundtrip}ms`, inline: true }
          )
          .setTimestamp();
        await reply.edit({ content: '', embeds: [embed] });
        break;
      }

      case 'help': {
        const modules = moduleManager.getEnabledModules();
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🤖 ClaimBoard Bot Command Directory')
          .setDescription(
            `Commands can be used via slash commands (e.g. \`/help\`) or with prefix \`!\` (e.g. \`!help\`) in servers and DMs.`
          )
          .setFooter({ text: 'ClaimBoard • Modular Scanlation Engine' })
          .setTimestamp();

        for (const mod of modules) {
          if (!mod.commands || mod.commands.length === 0) continue;
          const cmdList = mod.commands
            .map((c) => `• \`/${c.name}\` or \`!${c.name}\` — ${c.description}`)
            .join('\n');
          embed.addFields({
            name: `📂 ${mod.name}`,
            value: cmdList,
            inline: false,
          });
        }

        embed.addFields({
          name: '🌐 Web Platform',
          value: `[Open ClaimBoard Web App](${this.webUrl})`,
        });

        await message.reply({ embeds: [embed] });
        break;
      }

      case 'approve': {
        if (args.length === 0) {
          await message.reply('⚠️ **Usage**: `!approve <username or @user> [role]`');
          return;
        }
        const target = args[0];
        const role = args[1] || undefined;
        const result = await processApprove(
          target,
          role,
          message.author.id,
          message.author.tag || message.author.username
        );
        if (!result.success) {
          await message.reply(result.message || '❌ Approval failed.');
          return;
        }
        if (result.embed) {
          await message.reply({ embeds: [result.embed] });
        }
        break;
      }

      case 'pending': {
        const result = await processPending(message.author.id);
        if (!result.success) {
          await message.reply(result.message || '❌ Could not retrieve pending list.');
          return;
        }
        if (result.embed) {
          await message.reply({ embeds: [result.embed] });
        }
        break;
      }

      case 'revoke': {
        if (args.length === 0) {
          await message.reply('⚠️ **Usage**: `!revoke <username or @user>`');
          return;
        }
        const target = args[0];
        const result = await processRevoke(target, message.author.id);
        if (!result.success) {
          await message.reply(result.message || '❌ Revoke failed.');
          return;
        }
        if (result.embed) {
          await message.reply({ embeds: [result.embed] });
        }
        break;
      }

      case 'board': {
        await message.reply(`📋 **ClaimBoard Kanban Workspace**: ${this.webUrl}/board`);
        break;
      }

      case 'modules': {
        const modules = moduleManager.getAllModules();
        const embed = new EmbedBuilder()
          .setColor(0x6366f1)
          .setTitle('📦 Bot Modules System')
          .setDescription(`Loaded **${modules.length}** module(s).`)
          .setTimestamp();
        for (const mod of modules) {
          embed.addFields({
            name: `${mod.name} (\`${mod.id}\`)`,
            value: `Status: ${mod.enabled !== false ? '🟢 Active' : '🔴 Disabled'}\n${mod.description}`,
            inline: false,
          });
        }
        await message.reply({ embeds: [embed] });
        break;
      }

      default: {
        if (isDM) {
          await message.reply(
            `❓ Unknown command \`${cmd}\`. Type \`!help\` to see the list of available commands or run \`!approve <username>\` if you are an administrator.`
          );
        }
        break;
      }
    }
  }
}
