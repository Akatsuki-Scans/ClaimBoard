import { Client, EmbedBuilder } from 'discord.js';
import { DiscordLogChannelModel } from '@claimboard/database';

function isValidHttpUrl(val?: string | null): boolean {
  if (!val) return false;
  try {
    const u = new URL(val);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Dispatch an audit/completion log embed to all registered log channels (or for a specific guild)
 */
export async function broadcastBotLog(
  client: Client,
  embed: EmbedBuilder,
  guildId?: string | null
): Promise<void> {
  try {
    if (!client || !client.isReady()) return;

    let logChannels = guildId
      ? await DiscordLogChannelModel.find({ guildId }).lean()
      : await DiscordLogChannelModel.find({}).lean();

    // If a specific guildId had no direct log channels (e.g. manga wasn't mapped to a guildId), broadcast to org log channels
    if (guildId && logChannels.length === 0) {
      logChannels = await DiscordLogChannelModel.find({}).lean();
    }

    if (logChannels.length === 0) return;

    const sentChannelIds = new Set<string>();
    for (const record of logChannels) {
      if (sentChannelIds.has(record.channelId)) continue;
      sentChannelIds.add(record.channelId);

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
    mangaCoverUrl?: string;
    chapterNumber: string | number;
    workTypeName: string;
    workTypeCode?: string;
    workerName: string;
    workerDiscordId?: string | null;
    deadline?: Date | string | null;
  }) => {
    const workerRef = params.workerDiscordId
      ? `<@${params.workerDiscordId}> (${params.workerName})`
      : `**${params.workerName}**`;

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle('📌 Task Claimed')
      .setDescription(
        `${workerRef} claimed **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${params.workTypeName} (\`${params.workTypeCode || 'Task'}\`)`, inline: true },
        { name: '👤 Claimed By', value: workerRef, inline: true },
        {
          name: '⏰ Deadline',
          value: params.deadline ? `<t:${Math.floor(new Date(params.deadline).getTime() / 1000)}:R>` : 'None set',
          inline: true,
        }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Claimed' })
      .setTimestamp();

    if (isValidHttpUrl(params.mangaCoverUrl)) {
      embed.setThumbnail(params.mangaCoverUrl!);
    }

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
      .setDescription(
        `**${params.workerName}** released claim on **${params.workTypeName}** for **${params.mangaTitle}${
          params.chapterNumber ? ` — Chapter ${params.chapterNumber}` : ''
        }**`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        ...(params.chapterNumber ? [{ name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true }] : []),
        { name: '🎯 Task', value: params.workTypeName, inline: true },
        { name: '👤 Worker', value: params.workerName, inline: true },
        { name: '📝 Reason', value: params.reason ? `>>> ${params.reason}` : '*No reason specified*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Released' })
      .setTimestamp();

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Task Deliverable Submitted
  taskSubmitted: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    mangaCoverUrl?: string;
    chapterNumber: string | number;
    workTypeName: string;
    workTypeCode?: string;
    workerName: string;
    workerDiscordId?: string | null;
    deliverableUrl: string;
    notes?: string;
    revision?: number;
  }) => {
    const workerRef = params.workerDiscordId
      ? `<@${params.workerDiscordId}> (${params.workerName})`
      : `**${params.workerName}**`;

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle('📥 Task Deliverable Submitted')
      .setDescription(
        `${workerRef} submitted **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${params.workTypeName} (\`${params.workTypeCode || 'Task'}\`)`, inline: true },
        { name: '👤 Submitted By', value: workerRef, inline: true },
        { name: '📦 Revision', value: `#${params.revision || 1}`, inline: true },
        {
          name: '🔗 Deliverable',
          value: isValidHttpUrl(params.deliverableUrl) ? `[Open Deliverable Link](${params.deliverableUrl})` : params.deliverableUrl,
          inline: false,
        }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Submission' })
      .setTimestamp();

    if (params.notes) {
      embed.addFields({ name: '📝 Notes', value: `>>> ${params.notes}`, inline: false });
    }
    if (isValidHttpUrl(params.mangaCoverUrl)) {
      embed.setThumbnail(params.mangaCoverUrl!);
    }

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Completed Task (e.g., Translation of <Manga> Ch. <Number> completed by <Worker>)
  taskCompleted: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    mangaCoverUrl?: string;
    chapterNumber: string | number;
    chapterTitle?: string;
    workTypeName: string;
    workTypeCode?: string;
    workerName: string;
    workerDiscordId?: string | null;
    reviewerName?: string;
    reviewerDiscordId?: string | null;
    deliverableUrl?: string;
    comment?: string;
    completedAt?: Date | string;
    deadline?: Date | string | null;
  }) => {
    const workerRef = params.workerDiscordId
      ? `<@${params.workerDiscordId}> (${params.workerName})`
      : `**${params.workerName}**`;

    const reviewerRef = params.reviewerDiscordId
      ? `<@${params.reviewerDiscordId}> (${params.reviewerName || 'Reviewer'})`
      : params.reviewerName
      ? `**${params.reviewerName}**`
      : 'Verified';

    const completedDate = params.completedAt ? new Date(params.completedAt) : new Date();
    const completedUnix = Math.floor(completedDate.getTime() / 1000);

    let deadlineNote = 'No deadline set';
    if (params.deadline) {
      const deadlineDate = new Date(params.deadline);
      const onTime = completedDate.getTime() <= deadlineDate.getTime();
      deadlineNote = onTime ? '✅ On Schedule' : '⚠️ After Deadline';
    }

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle(`✅ Task Completed • ${params.workTypeName}`)
      .setDescription(
        `**${params.workTypeName}**${params.workTypeCode ? ` (\`${params.workTypeCode}\`)` : ''} of **${params.mangaTitle} — Chapter ${params.chapterNumber}** was completed by ${workerRef}.`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Completed Task', value: `${params.workTypeName}${params.workTypeCode ? ` (\`${params.workTypeCode}\`)` : ''}`, inline: true },
        { name: '👤 Completed By', value: workerRef, inline: true },
        { name: '👑 Approved By', value: reviewerRef, inline: true },
        { name: '⏱️ Schedule', value: `${deadlineNote} • <t:${completedUnix}:R>`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Task Completed' })
      .setTimestamp(completedDate);

    if (isValidHttpUrl(params.deliverableUrl)) {
      embed.addFields({
        name: '🔗 Deliverable',
        value: `[View Deliverable](${params.deliverableUrl})`,
        inline: false,
      });
    }
    if (params.comment) {
      embed.addFields({ name: '💬 Notes', value: `>>> ${params.comment}`, inline: false });
    }
    if (isValidHttpUrl(params.mangaCoverUrl)) {
      embed.setThumbnail(params.mangaCoverUrl!);
    }

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Backward-compatible alias for taskCompleted / taskApproved
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
    await BotLogger.taskCompleted({
      client: params.client,
      guildId: params.guildId,
      mangaTitle: params.mangaTitle,
      chapterNumber: params.chapterNumber,
      workTypeName: params.workTypeName,
      workerName: params.workerName,
      reviewerName: params.reviewerName,
      reviewerDiscordId: params.reviewerId,
      comment: params.comment,
    });
  },

  // Log: Entire Chapter Completed (all tasks done, listing every stage & contributor)
  chapterCompleted: async (params: {
    client: Client;
    guildId?: string | null;
    mangaTitle: string;
    mangaCoverUrl?: string;
    chapterNumber: string | number;
    chapterTitle?: string;
    deadline?: Date | string | null;
    completedAt?: Date | string;
    tasks: Array<{
      workTypeName: string;
      workTypeCode?: string;
      workerName: string;
      workerDiscordId?: string | null;
    }>;
  }) => {
    const completedDate = params.completedAt ? new Date(params.completedAt) : new Date();
    const completedUnix = Math.floor(completedDate.getTime() / 1000);

    const creditsList =
      params.tasks.length > 0
        ? params.tasks
            .map((t) => {
              const who = t.workerDiscordId ? `<@${t.workerDiscordId}> (${t.workerName})` : `**${t.workerName}**`;
              return `• **${t.workTypeName}**${t.workTypeCode ? ` (\`${t.workTypeCode}\`)` : ''} — ${who}`;
            })
            .join('\n')
        : '*All tasks verified*';

    let targetStatus = 'All stages verified';
    if (params.deadline) {
      const onTime = completedDate.getTime() <= new Date(params.deadline).getTime();
      targetStatus = onTime ? '✅ Completed on schedule' : '⚠️ Completed past target deadline';
    }

    const embed = new EmbedBuilder()
      .setColor(0x059669)
      .setTitle(`🏁 Chapter Completed • ${params.mangaTitle} Ch. ${params.chapterNumber}`)
      .setDescription(
        `All production stages for **${params.mangaTitle} — Chapter ${params.chapterNumber}**${
          params.chapterTitle ? ` (*${params.chapterTitle}*)` : ''
        } have been completed!`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '📊 Status', value: `${params.tasks.length}/${params.tasks.length} Stages Done`, inline: true },
        { name: '👥 Completed Tasks & Contributors', value: creditsList.slice(0, 1020), inline: false },
        { name: '⏱️ Completed', value: `<t:${completedUnix}:F> (<t:${completedUnix}:R>) • ${targetStatus}`, inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Chapter Release Ready' })
      .setTimestamp(completedDate);

    if (isValidHttpUrl(params.mangaCoverUrl)) {
      embed.setThumbnail(params.mangaCoverUrl!);
    }

    await broadcastBotLog(params.client, embed, params.guildId);
  },

  // Log: Deadline Set / Updated / Cleared
  deadlineUpdated: async (params: {
    client: Client;
    guildId?: string | null;
    kind: 'assignment' | 'chapter';
    mangaTitle: string;
    chapterNumber: string | number;
    workTypeName?: string;
    workTypeCode?: string;
    workerName?: string;
    deadline?: Date | string | null;
    actorName: string;
  }) => {
    const targetDesc =
      params.kind === 'chapter'
        ? `Target deadline for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`
        : `Deadline for **${params.workTypeName || 'Task'}** on **${params.mangaTitle} — Chapter ${params.chapterNumber}**`;

    const dueValue = params.deadline
      ? `<t:${Math.floor(new Date(params.deadline).getTime() / 1000)}:F> (<t:${Math.floor(
          new Date(params.deadline).getTime() / 1000
        )}:R>)`
      : '*Cleared (No deadline)*';

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(params.deadline ? '📅 Deadline Scheduled' : '🗑️ Deadline Cleared')
      .setDescription(`${targetDesc} was ${params.deadline ? 'updated' : 'cleared'} by **${params.actorName}**.`)
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        ...(params.workTypeName
          ? [{ name: '🎯 Task', value: `${params.workTypeName}${params.workTypeCode ? ` (\`${params.workTypeCode}\`)` : ''}`, inline: true }]
          : []),
        { name: '⏰ Due Date', value: dueValue, inline: false }
      )
      .setFooter({ text: 'ClaimBoard Bot Logger • Schedule Monitor' })
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
    workerDiscordId?: string | null;
    reviewerName: string;
    reviewerId?: string;
    comment?: string;
  }) => {
    const reviewerRef = params.reviewerId ? `<@${params.reviewerId}> (${params.reviewerName})` : `**${params.reviewerName}**`;
    const workerRef = params.workerDiscordId ? `<@${params.workerDiscordId}> (${params.workerName})` : `**${params.workerName}**`;

    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle('⚠️ Task Changes Requested')
      .setDescription(
        `${reviewerRef} requested changes on **${params.workTypeName}** for **${params.mangaTitle} — Chapter ${params.chapterNumber}**`
      )
      .addFields(
        { name: '📖 Manga', value: params.mangaTitle, inline: true },
        { name: '📑 Chapter', value: `Chapter ${params.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: params.workTypeName, inline: true },
        { name: '👤 Worker', value: workerRef, inline: true },
        { name: '👑 Reviewed By', value: reviewerRef, inline: true },
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

    if (isValidHttpUrl(params.coverUrl)) {
      embed.setThumbnail(params.coverUrl!);
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
      .setDescription(
        `This channel (<#${params.channelId}>) is now an active ClaimBoard bot log channel, configured by **${params.adminTag}** (<@${params.adminId}>).\n\n` +
          `Logs streamed here include:\n` +
          `• **Completed Tasks** (which task, manga, chapter, and by whom)\n` +
          `• **Completed Chapters** (full contributor credits)\n` +
          `• **Claims, Releases & Submissions**\n` +
          `• **Deadline Updates & Series Imports**`
      )
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
