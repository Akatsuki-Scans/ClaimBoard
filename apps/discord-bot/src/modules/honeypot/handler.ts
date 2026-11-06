import {
  Message,
  GuildMember,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  NewsChannel,
  Guild,
  DMChannel,
  NonThreadGuildBasedChannel,
} from 'discord.js';
import {
  HoneypotConfigModel,
  logHoneypotEvent,
  getHoneypotModeratedCount,
  updateHoneypotMsgId,
  unsetHoneypotChannel,
  unsetHoneypotLogChannel,
  deleteHoneypotConfig,
  IHoneypotConfig,
} from '@claimboard/database';
import {
  honeypotWarningMessage,
  honeypotUserDMMessage,
  logActionMessage,
} from './messages';
import { HONEYPOT_EMOJI } from './constants';

const moderatingUsers = new Set<string>();

export async function handleHoneypotMessage(message: Message): Promise<boolean> {
  const guild = message.guild;
  if (!guild || !message.guildId) return false;

  // Query config for this guild and honeypot channel
  const config = await HoneypotConfigModel.findOne({
    guildId: message.guildId,
    'channels.channelId': message.channelId,
  });

  if (!config) return false;

  const channelEntry = config.channels.find((c) => c.channelId === message.channelId);
  if (!channelEntry) return false;

  const userId = message.author.id;
  const userKey = `${guild.id}:${userId}`;

  // Prevent duplicate concurrent handling of the same user
  if (moderatingUsers.has(userKey)) {
    return true;
  }
  moderatingUsers.add(userKey);

  try {
    // Immediate acknowledgement / cleanup
    if (config.experiments.includes('ensure-msg-delete') && config.action !== 'disabled') {
      await message.delete().catch(() => null);
    } else {
      await message.react(HONEYPOT_EMOJI).catch(() => null);
    }

    if (config.action === 'disabled') {
      return true;
    }

    // Check permissions: Never ban/kick the server owner or admins/moderators with ManageGuild
    let member: GuildMember | null = message.member;
    if (!member) {
      member = await guild.members.fetch(userId).catch(() => null);
    }

    const isOwner = guild.ownerId === userId;
    const isAdmin =
      isOwner ||
      Boolean(
        member?.permissions.has(PermissionFlagsBits.Administrator) ||
        member?.permissions.has(PermissionFlagsBits.ManageGuild)
      );

    if (isAdmin) {
      const skipReason = isOwner ? 'the **server owner**' : 'a **server admin**';
      const warningText = `⚠️ User <@${userId}> triggered the honeypot in <#${message.channelId}>, but they are ${skipReason} so I won't ${config.action} them.\n-# Please ensure my bot role is higher than members and has Ban Members permission.`;

      if (config.logChannelId) {
        const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          await (logChannel as TextChannel).send({ content: warningText }).catch(() => null);
        }
      } else if (message.channel.isTextBased()) {
        await (message.channel as TextChannel).send({ content: warningText }).catch(() => null);
      }
      return true;
    }

    // Optional forward-message experiment
    if (config.experiments.includes('forward-message') && config.logChannelId) {
      try {
        const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const contentPreview = message.content ? `\`\`\`\n${message.content.slice(0, 1800)}\n\`\`\`` : '*(empty or attachment)*';
          await (logChannel as TextChannel).send({
            content: `📨 **Forwarded Message from <#${message.channelId}> by <@${userId}>:**\n${contentPreview}`,
          });
        }
      } catch (err) {
        console.warn('[Honeypot] Error forwarding message:', err);
      }
    }

    // Optional timeout-first experiment
    if (config.experiments.includes('timeout-first') && member) {
      await member
        .timeout(3600_000, `Triggered honeypot -> timeout for 1hr before ${config.action}`)
        .catch(() => null);
    }

    // DM Member before removal
    if (!config.experiments.includes('no-dm')) {
      try {
        const reinviteCode = config.experiments.includes('reinvite') ? config.reinviteInvite : null;
        const channelLink = `https://discord.com/channels/${guild.id}/${message.channelId}/${message.id}`;
        const dmPayload = honeypotUserDMMessage(
          userId,
          config.action,
          guild.name,
          undefined,
          channelLink,
          reinviteCode ? `https://discord.gg/${reinviteCode}` : null,
          false,
          config.dmMessage
        );
        await message.author.send(dmPayload).catch(() => null);
      } catch (dmErr) {
        console.warn(`[Honeypot] Could not DM user ${userId}:`, dmErr);
      }
    }

    // Execute ban/softban
    const deleteMessageSeconds = config.experiments.includes('only-recent-delete') ? 900 : 3600;
    let failed: false | 'permissions' | 'unban' | true = false;

    try {
      if (config.action === 'ban') {
        await guild.members.ban(userId, {
          deleteMessageSeconds,
          reason: 'Triggered honeypot -> permanent ban',
        });
      } else if (config.action === 'softban') {
        await guild.members.ban(userId, {
          deleteMessageSeconds,
          reason: 'Triggered honeypot -> softban (kick) 1/2',
        });
        // Wait briefly then unban to complete softban
        await new Promise((res) => setTimeout(res, 300));
        try {
          await guild.members.unban(userId, 'Triggered honeypot -> softban (kick) 2/2');
        } catch (unbanErr) {
          console.warn('[Honeypot] Failed to unban after softban:', unbanErr);
          failed = 'unban';
        }
      }
    } catch (actErr: any) {
      console.error(`[Honeypot] Failed to ${config.action} user ${userId}:`, actErr);
      if (actErr?.code === 50013) {
        failed = 'permissions';
      } else {
        failed = true;
      }
    }

    // Record moderation event if action succeeded
    if (!failed) {
      await logHoneypotEvent(guild.id, userId, message.channelId, config.action);
    }

    const moderatedCount = await getHoneypotModeratedCount(guild.id, channelEntry.channelId);

    // Send mod log
    if (config.logChannelId) {
      try {
        const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const logPayload = logActionMessage(
            message.author,
            member,
            message.channelId,
            config.action,
            config.logMessage,
            moderatedCount
          );

          if (failed === 'permissions') {
            await (logChannel as TextChannel).send({
              content: `⚠️ User <@${userId}> triggered the honeypot in <#${message.channelId}>, but I **failed** to ${config.action} them due to **missing permissions**.\nPlease ensure my bot role is higher than their highest role and that I have the **Ban Members** permission.`,
            });
          } else if (failed === 'unban') {
            await (logChannel as TextChannel).send({
              content: `⚠️ User <@${userId}> was banned for honeypot trigger, but the unban step of the softban failed. They remain banned.`,
            });
          } else if (failed) {
            await (logChannel as TextChannel).send({
              content: `⚠️ User <@${userId}> triggered honeypot in <#${message.channelId}>, but the ${config.action} operation encountered an error.`,
            });
          } else {
            await (logChannel as TextChannel).send(logPayload);
          }
        }
      } catch (logErr) {
        console.warn('[Honeypot] Failed to send mod log:', logErr);
      }
    }

    // Update warning embed in honeypot channel
    if (!config.experiments.includes('no-warning-msg')) {
      await updateChannelWarningMessage(guild, channelEntry.channelId, channelEntry.msgId, moderatedCount, config.action, config.warningMessage);
    }

    return true;
  } finally {
    moderatingUsers.delete(userKey);
  }
}

export async function updateChannelWarningMessage(
  guild: Guild,
  channelId: string,
  existingMsgId: string | null | undefined,
  count: number,
  action: IHoneypotConfig['action'],
  warningMessageText?: string | null
): Promise<string | null> {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;

    const payload = honeypotWarningMessage(count, action, warningMessageText);

    if (existingMsgId) {
      try {
        const existing = await (channel as TextChannel).messages.fetch(existingMsgId).catch(() => null);
        if (existing) {
          await existing.edit(payload);
          return existingMsgId;
        }
      } catch {
        // message might have been deleted, proceed to post new
      }
    }

    const posted = await (channel as TextChannel).send(payload);
    await updateHoneypotMsgId(guild.id, channelId, posted.id);
    return posted.id;
  } catch (err) {
    console.warn(`[Honeypot] Could not update warning message in channel ${channelId}:`, err);
    return null;
  }
}

export async function handleChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel
): Promise<void> {
  if (!('guild' in channel) || !channel.guild) return;
  const guildId = channel.guild.id;
  const channelId = channel.id;

  try {
    await unsetHoneypotChannel(guildId, channelId);
    await unsetHoneypotLogChannel(guildId, channelId);
  } catch (err) {
    console.error(`[Honeypot] Error handling channel delete:`, err);
  }
}

export async function handleGuildDelete(guild: Guild): Promise<void> {
  try {
    await deleteHoneypotConfig(guild.id);
  } catch (err) {
    console.error(`[Honeypot] Error handling guild delete for ${guild.id}:`, err);
  }
}
