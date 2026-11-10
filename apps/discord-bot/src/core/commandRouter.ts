import { Client, Interaction, Message, EmbedBuilder } from 'discord.js';
import { moduleManager } from './moduleManager';
import { processApprove, processPending, processRevoke, checkIsAdmin } from '../modules/admin';
import { handleHoneypotMessage } from '../modules/honeypot';
import { DiscordLogChannelModel, OrganizationModel } from '@claimboard/database';
import { BotLogger } from './botLogger';

export class CommandRouter {
  private client: Client;
  private webUrl: string;

  constructor(client: Client, webUrl: string) {
    this.client = client;
    this.webUrl = webUrl;
  }

  public setWebUrl(url: string): void {
    this.webUrl = url;
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
      console.log(`[CommandRouter] Successfully registered ${slashData.length} global slash commands with Discord.`);

      // Also register directly to all joined guilds so changes appear INSTANTLY with zero cache delay!
      try {
        const oauthGuilds = await this.client.guilds.fetch();
        for (const [guildId, oauthGuild] of oauthGuilds) {
          try {
            const guild = await oauthGuild.fetch();
            await guild.commands.set(slashData);
            console.log(`[CommandRouter] ⚡ Instantly updated ${slashData.length} slash commands in guild: "${guild.name}" (${guildId})`);
          } catch (gErr: any) {
            console.warn(`[CommandRouter] Notice on guild ${guildId} command sync:`, gErr?.message);
          }
        }
      } catch (guildFetchErr: any) {
        console.warn('[CommandRouter] Could not fetch guilds for instant sync:', guildFetchErr?.message);
      }
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
        if (err?.code === 40060) return;
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

    // 4. Handle Select Menus (String, Channel, Role, etc.)
    if (interaction.isAnySelectMenu()) {
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

    // 5. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      for (const { command } of moduleManager.getAllCommands()) {
        if (command.handleModal) {
          try {
            await command.handleModal(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (err) {
            console.error(`[CommandRouter] Error handling modal ${customId}:`, err);
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

    // Check if message is in a registered Honeypot trap channel
    if (message.guild && !message.system) {
      try {
        const handled = await handleHoneypotMessage(message);
        if (handled) return;
      } catch (err) {
        console.error('[CommandRouter] Error checking honeypot message:', err);
      }
    }

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

      case 'submit': {
        await message.reply(
          `🚀 **ClaimBoard Task Submission**\nTo submit your deliverable, use the slash command in any server channel or DM:\n\`/submit series:<title> chapter:<number> task:<role> url:<link> note:[notes]\`\n\nOr submit via the web app: [My Claims](${this.webUrl}/my-claims)`
        );
        break;
      }

      case 'approve': {
        await message.reply(
          `✅ **Task Deliverable Approval**\nAdministrators can approve tasks directly using the interactive **[Approve]** button received in their Admin DM, or by running:\n\`/approve series:<title> chapter:<number> task:<role> comment:[optional feedback]\`\n\nTo approve a user to log into the web app, run \`!approve-user <username>\` or \`/approve-user\`.`
        );
        break;
      }

      case 'manga': {
        await message.reply(
          `📖 **AniList Manga Search & ClaimBoard Import**\nTo search AniList metadata and import series into ClaimBoard, use:\n\`/manga title:<search query>\``
        );
        break;
      }

      case 'approve-user': {
        if (args.length === 0) {
          await message.reply('⚠️ **Usage**: `!approve-user <username or @user> [role]`');
          return;
        }
        const target = args[0];
        const role = args[1] || undefined;
        const result = await processApprove(
          target,
          role,
          message.author.id,
          message.author.tag || message.author.username,
          this.client,
          message.guildId
        );
        if (!result.success) {
          await message.reply(result.message || '❌ User approval failed.');
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

      case 'addlog':
      case 'add-log-channel': {
        const isAdmin = await checkIsAdmin(message.author.id, message.member?.permissions);
        if (!isAdmin) {
          await message.reply('❌ **Permission Denied**: Only administrators can configure bot log channels.');
          return;
        }
        if (!message.guildId) {
          await message.reply('❌ This command can only be used within a server channel.');
          return;
        }
        const targetChannel = message.mentions.channels.first() || message.channel;
        const existing = await DiscordLogChannelModel.findOne({ guildId: message.guildId, channelId: targetChannel.id });
        if (existing) {
          await message.reply(`ℹ️ <#${targetChannel.id}> is already registered as an active log channel.`);
          return;
        }
        const org = await OrganizationModel.findOne();
        await DiscordLogChannelModel.create({
          organizationId: org?._id,
          guildId: message.guildId,
          channelId: targetChannel.id,
          channelName: ('name' in targetChannel ? targetChannel.name : 'log-channel') as string,
          addedById: message.author.id,
          addedByName: message.author.tag || message.author.username,
        });
        await message.reply(`✅ Designated <#${targetChannel.id}> as the ClaimBoard bot log channel! Use \`/remove-log-channel\` or \`!dellog\` to remove it.`);
        await BotLogger.logChannelAdded({
          client: this.client,
          guildId: message.guildId,
          channelId: targetChannel.id,
          adminTag: message.author.tag || message.author.username,
          adminId: message.author.id,
        });
        break;
      }

      case 'dellog':
      case 'removelog':
      case 'remove-log-channel': {
        const isAdmin = await checkIsAdmin(message.author.id, message.member?.permissions);
        if (!isAdmin) {
          await message.reply('❌ **Permission Denied**: Only administrators can manage bot log channels.');
          return;
        }
        if (!message.guildId) {
          await message.reply('❌ This command can only be used within a server channel.');
          return;
        }
        const targetChannel = message.mentions.channels.first() || message.channel;
        let removed = await DiscordLogChannelModel.deleteOne({ guildId: message.guildId, channelId: targetChannel.id });
        let removedId = targetChannel.id;
        if (!removed.deletedCount) {
          const anyLog = await DiscordLogChannelModel.findOne({ guildId: message.guildId });
          if (anyLog) {
            removedId = anyLog.channelId;
            await anyLog.deleteOne();
            removed = { deletedCount: 1 } as any;
          }
        }
        if (!removed.deletedCount) {
          await message.reply('ℹ️ No active bot log channel found for this server. Use `/add-log-channel` to set one.');
          return;
        }
        await message.reply(`🗑️ Removed <#${removedId}> from bot log channels.`);
        await BotLogger.logChannelRemoved({
          client: this.client,
          guildId: message.guildId,
          channelId: removedId,
          adminTag: message.author.tag || message.author.username,
          adminId: message.author.id,
        });
        break;
      }

      case 'calendar':
      case 'deadline': {
        await message.reply(
          `📅 **ClaimBoard Deadlines & Calendar**\nUse slash commands in Discord:\n• \`/calendar\` — View interactive monthly deadline calendar\n• \`/deadline list\` — List upcoming & overdue tasks\n• \`/deadline set\` — Set or update a task/chapter deadline\n\nWeb Calendar: [Schedule & Deadlines](${this.webUrl}/calendar)`
        );
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
