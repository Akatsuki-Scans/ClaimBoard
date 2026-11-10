import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  Message,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import { UserModel, OrganizationModel, DiscordLogChannelModel } from '@claimboard/database';
import { BotModule, BotCommand, CommandContext } from '../../core/types';
import { BotLogger } from '../../core/botLogger';

/**
 * Checks if the Discord user ID is configured as a Bot Admin in .env, is an Admin/Owner/Manager in MongoDB,
 * or holds Discord Administrator / ManageGuild permissions in the current server.
 */
export async function checkIsAdmin(
  userId: string,
  memberPermissions?: Readonly<PermissionsBitField> | null
): Promise<boolean> {
  const envAdminIds = (process.env.BOT_ADMIN_DISCORD_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (envAdminIds.includes(userId)) {
    return true;
  }

  if (
    memberPermissions &&
    (memberPermissions.has(PermissionFlagsBits.Administrator) ||
      memberPermissions.has(PermissionFlagsBits.ManageGuild))
  ) {
    return true;
  }

  try {
    const dbUser = await UserModel.findOne({ discordId: userId });
    if (
      dbUser &&
      (dbUser.role === 'Administrator' || dbUser.role === 'Owner' || dbUser.role === 'Manager')
    ) {
      return true;
    }
  } catch (err) {
    console.error('[AdminCheck] Error querying UserModel:', err);
  }

  return false;
}

export interface ApproveResult {
  success: boolean;
  message?: string;
  embed?: EmbedBuilder;
}

export async function processApprove(
  target: string,
  assignedRole: string | null | undefined,
  executorId: string,
  executorTag: string,
  client?: any,
  guildId?: string | null
): Promise<ApproveResult> {
  const isAdmin = await checkIsAdmin(executorId);
  if (!isAdmin) {
    return {
      success: false,
      message: '❌ **Permission Denied**: You must be configured as `BOT_ADMIN_DISCORD_ID` in `.env` or hold the Administrator role to approve users.',
    };
  }

  const cleanedTarget = target.replace(/<@!?(\d+)>/g, '$1').trim();
  const isDiscordId = /^\d{17,20}$/.test(cleanedTarget);

  let org = await OrganizationModel.findOne();
  if (!org) {
    org = await OrganizationModel.create({
      name: 'Scanlation Workspace',
      slug: 'scanlation',
    });
  }

  let user = await UserModel.findOne({
    $or: [
      { discordId: cleanedTarget },
      { discordUsername: cleanedTarget },
      { username: cleanedTarget },
      { username: cleanedTarget.toLowerCase() },
    ],
  });

  if (user) {
    user.isApproved = true;
    user.approvedBy = executorTag;
    user.approvedAt = new Date();
    if (assignedRole) {
      user.role = assignedRole;
    }
    await user.save();

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ User Approved for ClaimBoard')
      .setDescription(`Successfully granted access to **${user.displayName || user.username}**!`)
      .addFields(
        { name: 'Username', value: `\`${user.username}\``, inline: true },
        { name: 'Discord Tag', value: user.discordUsername || 'Not connected', inline: true },
        { name: 'Assigned Role', value: `\`${user.role}\``, inline: true },
        { name: 'Approved By', value: `<@${executorId}>`, inline: true },
        { name: 'Status', value: '🟢 **Approved to Login**', inline: true }
      )
      .setFooter({ text: 'The user can now log into ClaimBoard with Discord.' })
      .setTimestamp();

    if (client) {
      await BotLogger.userApproved({
        client,
        guildId: guildId || null,
        targetName: user.displayName || user.username,
        targetDiscordId: user.discordId,
        assignedRole: user.role,
        adminTag: executorTag,
        adminId: executorId,
      });
    }

    return { success: true, embed };
  }

  const sanitizedUsername = cleanedTarget.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const newUser = await UserModel.create({
    organizationId: org._id,
    username: sanitizedUsername,
    displayName: cleanedTarget,
    discordUsername: isDiscordId ? undefined : cleanedTarget,
    discordId: isDiscordId ? cleanedTarget : undefined,
    email: `${sanitizedUsername}@discord.claimboard.dev`,
    role: assignedRole || 'Worker',
    isApproved: true,
    approvedBy: executorTag,
    approvedAt: new Date(),
    availability: 'Available',
    workload: 'Normal',
  });

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ User Pre-Approved for ClaimBoard')
    .setDescription(
      `Pre-approval recorded for **${cleanedTarget}**. When this Discord account logs into ClaimBoard, they will have immediate access!`
    )
    .addFields(
      { name: 'Reserved Username', value: `\`${newUser.username}\``, inline: true },
      { name: 'Assigned Role', value: `\`${newUser.role}\``, inline: true },
      { name: 'Approved By', value: `<@${executorId}>`, inline: true }
    )
    .setFooter({ text: 'ClaimBoard Security & Access Control' })
    .setTimestamp();

    if (client) {
      await BotLogger.userApproved({
        client,
        guildId: guildId || null,
        targetName: cleanedTarget,
        targetDiscordId: isDiscordId ? cleanedTarget : undefined,
        assignedRole: newUser.role,
        adminTag: executorTag,
        adminId: executorId,
      });
    }

  return { success: true, embed };
}

export async function processPending(executorId: string): Promise<ApproveResult> {
  const isAdmin = await checkIsAdmin(executorId);
  if (!isAdmin) {
    return {
      success: false,
      message: '❌ **Permission Denied**: Only Bot Administrators can view pending users.',
    };
  }

  const unapprovedUsers = await UserModel.find({ isApproved: false })
    .sort({ createdAt: -1 })
    .limit(15);

  if (unapprovedUsers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 No Pending Approvals')
      .setDescription('All users have been approved! No one is currently blocked from logging in.')
      .setTimestamp();
    return { success: true, embed };
  }

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`⏳ Pending Login Approvals (${unapprovedUsers.length})`)
    .setDescription(
      'These Discord users attempted to log in but are blocked pending administrator approval. Run `/approve-user username:<name>` to grant them access.'
    )
    .setTimestamp();

  for (const u of unapprovedUsers) {
    embed.addFields({
      name: `👤 ${u.displayName || u.username}`,
      value: `**Discord Tag**: ${u.discordUsername || 'N/A'}\n**Requested**: <t:${Math.floor(
        u.createdAt.getTime() / 1000
      )}:R>\n**Command**: \`/approve-user username:${u.username}\``,
      inline: true,
    });
  }

  return { success: true, embed };
}

export async function processRevoke(target: string, executorId: string): Promise<ApproveResult> {
  const isAdmin = await checkIsAdmin(executorId);
  if (!isAdmin) {
    return {
      success: false,
      message: '❌ **Permission Denied**: Only Bot Administrators can revoke access.',
    };
  }

  const cleaned = target.replace(/<@!?(\d+)>/g, '$1').trim();
  const user = await UserModel.findOne({
    $or: [
      { discordId: cleaned },
      { discordUsername: cleaned },
      { username: cleaned },
      { username: cleaned.toLowerCase() },
    ],
  });

  if (!user) {
    return {
      success: false,
      message: `❌ Could not find user matching \`${target}\`.`,
    };
  }

  user.isApproved = false;
  user.approvedBy = undefined;
  user.approvedAt = undefined;
  await user.save();

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🚫 User Login Access Revoked')
    .setDescription(`**${user.displayName || user.username}** has been unapproved and blocked from logging in.`)
    .addFields(
      { name: 'Username', value: `\`${user.username}\``, inline: true },
      { name: 'Revoked By', value: `<@${executorId}>`, inline: true }
    )
    .setTimestamp();

  return { success: true, embed };
}

// /approve-user slash command
const approveUserCommand: BotCommand = {
  name: 'approve-user',
  description: 'Approve a Discord user so they can log into ClaimBoard',
  data: new SlashCommandBuilder()
    .setName('approve-user')
    .setDescription('Approve a Discord user to log into the ClaimBoard web application')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('username')
        .setDescription('Discord username, tag, ID, or mention of the user to approve')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('role')
        .setDescription('Role to assign upon approval (default: Worker)')
        .setRequired(false)
        .addChoices(
          { name: 'Worker (Default)', value: 'Worker' },
          { name: 'Cleaner', value: 'Cleaner' },
          { name: 'Typesetter', value: 'Typesetter' },
          { name: 'Translator', value: 'Translator' },
          { name: 'Proofreader', value: 'Proofreader' },
          { name: 'Redrawer', value: 'Redrawer' },
          { name: 'Quality Checker', value: 'QualityChecker' },
          { name: 'Manager', value: 'Manager' },
          { name: 'Administrator', value: 'Administrator' }
        )
    ),
  autocomplete: async (interaction) => {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const pendingUsers = await UserModel.find({ isApproved: false })
        .limit(20)
        .lean();

      const filtered = pendingUsers
        .filter(
          (u) =>
            u.username.toLowerCase().includes(focusedValue) ||
            (u.discordUsername && u.discordUsername.toLowerCase().includes(focusedValue)) ||
            (u.displayName && u.displayName.toLowerCase().includes(focusedValue))
        )
        .slice(0, 25);

      await interaction.respond(
        filtered.map((u) => ({
          name: `${u.discordUsername || u.username} (${u.displayName || 'Pending'})`,
          value: u.username,
        }))
      );
    } catch {
      await interaction.respond([]);
    }
  },
  execute: async ({ interaction }: CommandContext) => {
    const rawTarget = interaction.options.getString('username', true).trim();
    const assignedRole = interaction.options.getString('role');

    const result = await processApprove(
      rawTarget,
      assignedRole,
      interaction.user.id,
      interaction.user.tag || interaction.user.username,
      interaction.client,
      interaction.guildId
    );

    if (!result.success) {
      await interaction.reply({ content: result.message || 'Error executing approve.', ephemeral: true });
      return;
    }

    if (result.embed) {
      await interaction.reply({ embeds: [result.embed] });
    }
  },
};

// /pending slash command
const pendingCommand: BotCommand = {
  name: 'pending',
  description: 'View list of Discord users waiting for ClaimBoard login approval',
  data: new SlashCommandBuilder()
    .setName('pending')
    .setDescription('View list of Discord users waiting for login approval')
    .setDMPermission(true),
  execute: async ({ interaction }: CommandContext) => {
    const result = await processPending(interaction.user.id);
    if (!result.success) {
      await interaction.reply({ content: result.message || 'Error checking pending.', ephemeral: true });
      return;
    }
    if (result.embed) {
      await interaction.reply({ embeds: [result.embed] });
    }
  },
};

// /revoke slash command
const revokeCommand: BotCommand = {
  name: 'revoke',
  description: 'Revoke ClaimBoard login access from a user',
  data: new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke login access from a user (blocks Discord login)')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('username')
        .setDescription('Username or Discord tag to revoke access from')
        .setRequired(true)
    ),
  execute: async ({ interaction }: CommandContext) => {
    const target = interaction.options.getString('username', true).trim();
    const result = await processRevoke(target, interaction.user.id);
    if (!result.success) {
      await interaction.reply({ content: result.message || 'Error revoking user.', ephemeral: true });
      return;
    }
    if (result.embed) {
      await interaction.reply({ embeds: [result.embed] });
    }
  },
};

async function handleAddLogChannelInteraction(interaction: ChatInputCommandInteraction) {
  const isAdmin = await checkIsAdmin(interaction.user.id, interaction.memberPermissions);
  if (!isAdmin) {
    await interaction.reply({
      content: '❌ **Permission Denied**: You must be an Administrator, Manager, or Server Admin to configure bot log channels.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: '❌ This command can only be used within a server/guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetChannelOpt = interaction.options.getChannel('channel');
  const rawChannel = targetChannelOpt || interaction.channel;
  if (!rawChannel) {
    await interaction.reply({
      content: '❌ Could not resolve target channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const fetchedChannel = await interaction.guild.channels.fetch(rawChannel.id).catch(() => null);
  if (!fetchedChannel || !fetchedChannel.isTextBased() || !('send' in fetchedChannel)) {
    await interaction.reply({
      content: '❌ Invalid channel selected. Please choose a text or announcement channel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verify bot has ViewChannel, SendMessages, EmbedLinks in target channel
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
  if (botMember) {
    const botPerms = fetchedChannel.permissionsFor(botMember);
    const missing: string[] = [];
    if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
    if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Send Messages');
    if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Embed Links');

    if (missing.length > 0) {
      await interaction.reply({
        content: `❌ I cannot post logs to <#${fetchedChannel.id}> because I am missing the following permission(s): **${missing.join(', ')}**.\nPlease grant those permissions in channel settings and run this command again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const org = await OrganizationModel.findOne();
  let alreadyRegistered = false;
  try {
    const previous = await DiscordLogChannelModel.findOneAndUpdate(
      { guildId: interaction.guildId, channelId: fetchedChannel.id },
      {
        $setOnInsert: {
          organizationId: org?._id,
          guildId: interaction.guildId,
          channelId: fetchedChannel.id,
          channelName: ('name' in fetchedChannel ? fetchedChannel.name : 'log-channel') as string,
          addedById: interaction.user.id,
          addedByName: interaction.user.tag || interaction.user.username,
        },
      },
      { upsert: true, new: false }
    );
    alreadyRegistered = Boolean(previous);
  } catch (err: any) {
    if (err?.code === 11000) {
      alreadyRegistered = true;
    } else {
      throw err;
    }
  }

  if (alreadyRegistered) {
    await interaction.reply({
      content: `ℹ️ Channel <#${fetchedChannel.id}> is already registered as an active log channel for this server!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Bot Log Channel Configured')
    .setDescription(`Successfully added <#${fetchedChannel.id}> as an active ClaimBoard bot log channel!`)
    .addFields(
      { name: 'Channel', value: `<#${fetchedChannel.id}>`, inline: true },
      { name: 'Configured By', value: `<@${interaction.user.id}>`, inline: true },
      {
        name: 'Monitored Events',
        value:
          '• **Completed Tasks** (which task, manga, chapter, and by whom)\n' +
          '• **Completed Chapters** (full contributor credits)\n' +
          '• **Task Claims, Releases & Submissions** (`/claim`, `/submit`)\n' +
          '• **Approvals & Revision Requests** (`/approve`)\n' +
          '• **Deadline Updates & Series Imports** (`/deadline`, `/manga`)',
        inline: false,
      }
    )
    .setFooter({ text: 'Use /remove-log-channel anytime to stop logging here' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  await BotLogger.logChannelAdded({
    client: interaction.client,
    guildId: interaction.guildId,
    channelId: fetchedChannel.id,
    adminTag: interaction.user.tag || interaction.user.username,
    adminId: interaction.user.id,
  });
}

async function handleRemoveLogChannelInteraction(interaction: ChatInputCommandInteraction) {
  const isAdmin = await checkIsAdmin(interaction.user.id, interaction.memberPermissions);
  if (!isAdmin) {
    await interaction.reply({
      content: '❌ **Permission Denied**: You must be an Administrator, Manager, or Server Admin to manage bot log channels.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command can only be used within a server/guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channelOpt = interaction.options.getChannel('channel');
  let removedCount = 0;
  let targetChannelId = channelOpt?.id;

  if (targetChannelId) {
    const res = await DiscordLogChannelModel.deleteOne({
      guildId: interaction.guildId,
      channelId: targetChannelId,
    });
    removedCount = res.deletedCount || 0;
  } else {
    const res = await DiscordLogChannelModel.deleteOne({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });
    if (res.deletedCount && res.deletedCount > 0) {
      removedCount = res.deletedCount;
      targetChannelId = interaction.channelId;
    } else {
      const existing = await DiscordLogChannelModel.findOne({ guildId: interaction.guildId });
      if (existing) {
        targetChannelId = existing.channelId;
        await existing.deleteOne();
        removedCount = 1;
      }
    }
  }

  if (removedCount === 0) {
    await interaction.reply({
      content: 'ℹ️ No active bot log channel found to remove for this server. Use `/add-log-channel` to set one.',
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🗑️ Bot Log Channel Removed')
    .setDescription(
      `Successfully removed ${targetChannelId ? `<#${targetChannelId}>` : 'the log channel'} from ClaimBoard bot logs.`
    )
    .addFields({
      name: 'What Next?',
      value: 'Run `/add-log-channel` in any channel anytime to re-enable logging.',
    })
    .setFooter({ text: 'ClaimBoard Audit & Event Logger' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  if (targetChannelId) {
    await BotLogger.logChannelRemoved({
      client: interaction.client,
      guildId: interaction.guildId,
      channelId: targetChannelId,
      adminTag: interaction.user.tag || interaction.user.username,
      adminId: interaction.user.id,
    });
  }
}

// /add-log-channel (primary) and /addlog (alias)
export const addLogChannelCommand: BotCommand = {
  name: 'add-log-channel',
  description: 'Add the bot to a channel to act as the ClaimBoard activity & completion logs channel',
  data: new SlashCommandBuilder()
    .setName('add-log-channel')
    .setDescription('Add a channel to receive completed tasks, completed chapters, and activity logs')
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Target logs channel (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  execute: async ({ interaction }: CommandContext) => {
    await handleAddLogChannelInteraction(interaction);
  },
};

export const removeLogChannelCommand: BotCommand = {
  name: 'remove-log-channel',
  description: 'Remove a channel from ClaimBoard activity & completion logs',
  data: new SlashCommandBuilder()
    .setName('remove-log-channel')
    .setDescription('Remove a channel from ClaimBoard bot activity & completion logs')
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Log channel to remove (defaults to current or active log channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  execute: async ({ interaction }: CommandContext) => {
    await handleRemoveLogChannelInteraction(interaction);
  },
};

// /addlog command (backwards-compatible alias)
export const addlogCommand: BotCommand = {
  name: 'addlog',
  description: 'Set a channel to receive real-time ClaimBoard bot activity and completion logs',
  data: new SlashCommandBuilder()
    .setName('addlog')
    .setDescription('Set a channel to receive real-time ClaimBoard bot activity logs')
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel to receive bot logs (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  execute: async ({ interaction }: CommandContext) => {
    await handleAddLogChannelInteraction(interaction);
  },
};

// /dellog command (backwards-compatible alias)
export const dellogCommand: BotCommand = {
  name: 'dellog',
  description: 'Remove a channel from ClaimBoard bot activity logs',
  data: new SlashCommandBuilder()
    .setName('dellog')
    .setDescription('Remove a channel from ClaimBoard bot activity logs')
    .setDMPermission(false)
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel to remove from bot logs (defaults to current channel or server log channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),
  execute: async ({ interaction }: CommandContext) => {
    await handleRemoveLogChannelInteraction(interaction);
  },
};

export const adminModule: BotModule = {
  id: 'admin',
  name: 'Admin & Access Control',
  description: 'Manage user access approvals, pending requests, and bot activity log channels',
  version: '1.2.0',
  enabled: true,
  commands: [
    approveUserCommand,
    pendingCommand,
    revokeCommand,
    addLogChannelCommand,
    removeLogChannelCommand,
    addlogCommand,
    dellogCommand,
  ],
  onLoad: () => {
    console.log('[AdminModule] Admin & Access Control module loaded with log channel management commands.');
  },
};
