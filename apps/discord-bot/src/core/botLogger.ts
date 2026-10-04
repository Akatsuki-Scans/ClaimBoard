import { Client, EmbedBuilder } from 'discord.js';
import { DiscordLogChannelModel } from '@claimboard/database';

/**
 * Dispatch an audit log embed to all registered log channels (or for a specific guild)
 */
export async function broadcastBotLog(client: Client, embed: EmbedBuilder, guildId?: string | null): Promise<void> {
  try {
    const query = guildId ? { guildId } : {};
    const logChannels = await DiscordLogChannelModel.find(query).lean();

    if (logChannels.length === 0) return;

    for (const record of logChannels) {
      try {
        const channel = await client.channels.fetch(record.channelId).catch(() => null);
        if (channel && channel.isTextBased() && 'send' in channel) {
          await (channel as any).send({ embeds: [embed] }).catch((err: any) => {
            console.warn(`[BotLogger] Failed to send log to channel ${record.channelId}:`, err?.message);
          });
        }
      } catch (err: any) {
        console.warn(`[BotLogger] Error accessing channel ${record.channelId}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[BotLogger] Error querying log channels:', err?.message);
  }
}

export const BotLogger = {
  broadcast: broadcastBotLog,

  // Log: Task Claimed
  taskClaimed: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    chapterNumber: string | number;
    workTypeName: string;
    workTypeCode?: string;
    workerName: string;
    workerId: string;
    deadline?: Date | string | null;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle('📌 Task Claimed')
      .setDescription(`**${params.workerName}** (<@${params.workerId}>) claimed **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`)
      .addFields(
        { name: '📖 Series', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${params.workTypeName} (\`${params.workTypeCode || 'Task'}\`)`, inline: true },
        { name: '👤 Claimer', value: `<@${params.workerId}> (${params.workerName})`, inline: true },
        { name: '⏰ Deadline', value: params.deadline ? `<t:${Math.floor(new Date(params.deadline).getTime() / 1000)}:R>` : 'None set', inline: true }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Claim' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Task Claim Released
  taskUnclaimed: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    chapterNumber?: string | number;
    workTypeName: string;
    workerName: string;
    reason?: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle('🔓 Task Claim Released')
      .setDescription(`**${params.workerName}** released claim on **${params.workTypeName}** for **${params.mangaTitle}**`)
      .addFields(
        { name: '📖 Series', value: params.mangaTitle, inline: true },
        { name: '🎯 Task', value: params.workTypeName, inline: true },
        { name: '👤 Worker', value: params.workerName, inline: true },
        { name: '📝 Reason', value: params.reason ? `>>> ${params.reason}` : '*No reason specified*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Release' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Task Deliverable Submitted
  taskSubmitted: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    chapterNumber: string | number;
    workTypeName: string;
    workTypeCode?: string;
    workerName: string;
    workerId: string;
    deliverableUrl: string;
    notes?: string;
    revision?: number;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📥 Task Deliverable Submitted')
      .setDescription(`**${params.workerName}** (<@${params.workerId}>) submitted their deliverable for **${params.mangaTitle} — Chapter ${params.chapterNumber}** (${params.workTypeName})`)
      .addFields(
        { name: '📖 Series', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${params.workTypeName} (\`${params.workTypeCode || 'Task'}\`)`, inline: true },
        { name: '👤 Worker', value: `<@${params.workerId}> (${params.workerName})`, inline: true },
        { name: '📦 Revision', value: `#${params.revision || 1}`, inline: true },
        { name: '🔗 Deliverable', value: `[Open Deliverable Link](${params.deliverableUrl})`, inline: false },
        { name: '📝 Notes', value: params.notes ? `>>> ${params.notes}` : '*No notes attached*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Submission' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Task Approved
  taskApproved: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    chapterNumber: string | number;
    workTypeName: string;
    workerName: string;
    reviewerName: string;
    reviewerId: string;
    comment?: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ Task Deliverable Approved')
      .setDescription(`**${params.reviewerName}** (<@${params.reviewerId}>) approved **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`)
      .addFields(
        { name: '📖 Series', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: params.workTypeName, inline: true },
        { name: '👤 Worker', value: params.workerName, inline: true },
        { name: '👑 Approved By', value: `<@${params.reviewerId}> (${params.reviewerName})`, inline: true },
        { name: '💬 Review Feedback', value: params.comment ? `>>> ${params.comment}` : '*Approved without additional comments*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Approved' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Task Changes Requested
  taskChangesRequested: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    chapterNumber: string | number;
    workTypeName: string;
    workerName: string;
    reviewerName: string;
    reviewerId: string;
    comment?: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('⚠️ Task Changes Requested')
      .setDescription(`**${params.reviewerName}** (<@${params.reviewerId}>) requested changes on **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`)
      .addFields(
        { name: '📖 Series', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: params.workTypeName, inline: true },
        { name: '👤 Worker', value: params.workerName, inline: true },
        { name: '👑 Reviewed By', value: `<@${params.reviewerId}> (${params.reviewerName})`, inline: true },
        { name: '💬 Feedback', value: params.comment ? `>>> ${params.comment}` : '*Changes requested*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Revision Requested' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: User Access Approved
  userApproved: async (params: {
    client: Client;
    guildId?: string | null;
    targetName: string;
    targetDiscordId?: string;
    assignedRole: string;
    adminTag: string;
    adminId: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🟢 User Login Access Approved')
      .setDescription(`**${params.adminTag}** (<@${params.adminId}>) granted ClaimBoard login access to **${params.targetName}**`)
      .addFields(
        { name: '👤 User', value: params.targetDiscordId ? `<@${params.targetDiscordId}> (\`${params.targetName}\`)` : `\`${params.targetName}\``, inline: true },
        { name: '🛡️ Role', value: `\`${params.assignedRole}\``, inline: true },
        { name: '👑 Approved By', value: `<@${params.adminId}> (${params.adminTag})`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Access Control' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Manga Imported from AniList
  mangaAdded: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    anilistId?: number;
    adminTag: string;
    adminId: string;
    coverUrl?: string;
    status?: string;
    totalChapters?: number;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x0284c7)
      .setTitle('📖 New Series Added to ClaimBoard')
      .setDescription(`**${params.adminTag}** (<@${params.adminId}>) added **${params.mangaTitle}** to ClaimBoard from AniList!`)
      .addFields(
        { name: '📖 Title', value: params.mangaTitle, inline: true },
        { name: '📊 Status', value: params.status || 'Active', inline: true },
        { name: '📑 Chapters', value: params.totalChapters ? `${params.totalChapters}` : 'Ongoing', inline: true },
        { name: '👑 Added By', value: `<@${params.adminId}>`, inline: true },
        { name: '🌐 AniList ID', value: params.anilistId ? `[#${params.anilistId}](https://anilist.co/manga/${params.anilistId})` : 'N/A', inline: true }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Series Registration' })
      .setTimestamp();

    if (params.coverUrl) {
      embed.setThumbnail(params.coverUrl);
    }

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Log Channel Configured
  logChannelAdded: async (params: {
    client: Client;
    guildId: string;
    channelId: string;
    adminTag: string;
    adminId: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('📋 Bot Log Channel Configured')
      .setDescription(`This channel (<#${params.channelId}>) was designated as the ClaimBoard bot log channel by **${params.adminTag}** (<@${params.adminId}>).`)
      .addFields(
        { name: 'Channel', value: `<#${params.channelId}> (\`${params.channelId}\`)`, inline: true },
        { name: 'Configured By', value: `<@${params.adminId}>`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Logger Online' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Log Channel Removed
  logChannelRemoved: async (params: {
    client: Client;
    guildId: string;
    channelId: string;
    adminTag: string;
    adminId: string;
  }) => {
    const embed = new EmbedBuilder()
      .setColor(0x64748b)
      .setTitle('🗑️ Bot Log Channel Removed')
      .setDescription(`Channel <#${params.channelId}> was removed from ClaimBoard log channels by **${params.adminTag}** (<@${params.adminId}>).`)
      .setFooter({ text: 'ClaimBoard Bot Logger • Logger Removed' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },
};
