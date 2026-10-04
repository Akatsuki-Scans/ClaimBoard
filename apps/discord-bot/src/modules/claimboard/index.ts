import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { BotModule, BotCommand, CommandContext } from '../../core/types';
import {
  MangaModel,
  ChapterModel,
  WorkTypeModel,
  DiscordChannelModel,
  WorkAssignmentModel,
  ClaimModel,
  UserModel,
  OrganizationModel,
  ProductionService,
} from '@claimboard/database';
import { checkIsAdmin } from '../admin';
import { BotLogger } from '../../core/botLogger';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ensure standard scanlation work types exist in the database
 */
async function ensureWorkTypes(orgId: any) {
  const defaults = [
    { code: 'TL', name: 'Translation', color: '#3b82f6', defaultDeadlineHours: 48, sortOrder: 1 },
    { code: 'PR', name: 'Proofreading', color: '#ec4899', defaultDeadlineHours: 24, sortOrder: 2 },
    { code: 'CL', name: 'Cleaning', color: '#10b981', defaultDeadlineHours: 48, sortOrder: 3 },
    { code: 'RD', name: 'Redrawing', color: '#f59e0b', defaultDeadlineHours: 48, sortOrder: 4 },
    { code: 'TS', name: 'Typesetting', color: '#8b5cf6', defaultDeadlineHours: 48, sortOrder: 5 },
    { code: 'QC', name: 'Quality Check', color: '#14b8a6', defaultDeadlineHours: 24, sortOrder: 6 },
  ];

  const types = [];
  for (const d of defaults) {
    let wt = await WorkTypeModel.findOne({ organizationId: orgId, code: d.code });
    if (!wt) {
      wt = await WorkTypeModel.create({
        organizationId: orgId,
        code: d.code,
        name: d.name,
        color: d.color,
        defaultDeadlineHours: d.defaultDeadlineHours,
        sortOrder: d.sortOrder,
        priority: 'Normal',
        requiresReview: d.code !== 'QC',
        allowMultipleWorkers: false,
        estimatedWorkloadHours: 2,
      });
    }
    types.push(wt);
  }
  return types;
}

// 1. /assign series: <title> chapter: <number>
const assignCommand: BotCommand = {
  name: 'assign',
  description: 'Assign production tasks for a chapter and dispatch interactive claim buttons',
  data: new SlashCommandBuilder()
    .setName('assign')
    .setDescription('Assign chapter tasks and dispatch interactive claim buttons in a single message')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('series')
        .setDescription('Manga or Manhwa series title')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('chapter')
        .setDescription('Chapter number (e.g. 03, 1150, 1.5)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('roles')
        .setDescription('Specific work types comma-separated (e.g. TL,CL,TS,PR,QC) - defaults to all')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('priority')
        .setDescription('Chapter priority level')
        .setRequired(false)
        .addChoices(
          { name: 'Normal (Default)', value: 'Normal' },
          { name: 'High', value: 'High' },
          { name: 'Urgent', value: 'Urgent' },
          { name: 'Low', value: 'Low' }
        )
    ),

  autocomplete: async (interaction: AutocompleteInteraction) => {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const mangas = await MangaModel.find({
        $or: [
          { title: { $regex: focusedValue, $options: 'i' } },
          { altTitles: { $regex: focusedValue, $options: 'i' } },
        ],
      })
        .limit(20)
        .lean();

      await interaction.respond(
        mangas.map((m) => ({
          name: `${m.title} (${m.status})`,
          value: m.title,
        }))
      );
    } catch {
      await interaction.respond([]);
    }
  },

  execute: async ({ interaction, webUrl }: CommandContext) => {
    const seriesTitle = interaction.options.getString('series', true).trim();
    const chapterNum = interaction.options.getString('chapter', true).trim();
    const rolesOpt = interaction.options.getString('roles');
    const priority = (interaction.options.getString('priority') as any) || 'Normal';

    // 1. Locate Manga
    let manga = await MangaModel.findOne({
      $or: [
        { title: { $regex: `^${seriesTitle}$`, $options: 'i' } },
        { title: { $regex: seriesTitle, $options: 'i' } },
        { altTitles: { $regex: seriesTitle, $options: 'i' } },
      ],
    });

    if (!manga) {
      await interaction.reply({
        content: `❌ Could not find series **"${seriesTitle}"** in the database. Please add it on ClaimBoard or check spelling.`,
        ephemeral: true,
      });
      return;
    }

    // 2. Find or create Chapter
    let chapter = await ChapterModel.findOne({
      mangaId: manga._id,
      chapterNumber: chapterNum,
    });

    if (!chapter) {
      chapter = await ChapterModel.create({
        organizationId: manga.organizationId,
        mangaId: manga._id,
        chapterNumber: chapterNum,
        title: `Chapter ${chapterNum}`,
        status: 'In_Production',
        priority,
      });
    }

    // 3. Work types setup
    let workTypes: any[] = [];
    if (rolesOpt) {
      const typeCodes = rolesOpt.split(',').map((s) => s.trim().toUpperCase());
      workTypes = await WorkTypeModel.find({
        organizationId: manga.organizationId,
        code: { $in: typeCodes },
      });
    }

    if (workTypes.length === 0) {
      workTypes = await ensureWorkTypes(manga.organizationId);
    }

    // 4. Create or retrieve assignments
    const assignments = [];
    for (const wt of workTypes) {
      let a = await WorkAssignmentModel.findOne({
        chapterId: chapter._id,
        workTypeId: wt._id,
      });

      if (!a) {
        a = await WorkAssignmentModel.create({
          organizationId: manga.organizationId,
          mangaId: manga._id,
          chapterId: chapter._id,
          workTypeId: wt._id,
          status: 'OPEN',
          priority,
          isBlocked: false,
        });
      }
      assignments.push({ assignment: a, workType: wt });
    }

    await ChapterModel.updateOne({ _id: chapter._id }, { $set: { updatedAt: new Date() } });

    // 5. Construct Single Message Embed & Buttons
    const roleTagContent = manga.discordRoleId ? `🔔 <@&${manga.discordRoleId}>` : '';

    const embed = new EmbedBuilder()
      .setColor(priority === 'Urgent' ? 0xef4444 : priority === 'High' ? 0xf59e0b : 0x6366f1)
      .setTitle(`📋 ${manga.title} — Chapter ${chapterNum}`)
      .setDescription(
        `New production tasks are open for claiming! Click the buttons below to claim your task.`
      )
      .addFields(
        assignments.map(({ assignment, workType }) => {
          const isClaimed = assignment.status !== 'OPEN' && assignment.assignedWorkerId;
          const statusText = isClaimed
            ? `✅ Claimed by <@${assignment.assignedWorkerId}>`
            : `⏳ **Open**`;
          return {
            name: `${workType.name} (${workType.code})`,
            value: statusText,
            inline: true,
          };
        })
      )
      .addFields(
        { name: 'Priority', value: `\`${priority}\``, inline: true },
        { name: 'Dashboard', value: `[Open in ClaimBoard](${webUrl}/board?mangaId=${manga._id})`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard • Click a button below to claim a role' })
      .setTimestamp();

    if (manga.coverUrl) {
      embed.setThumbnail(manga.coverUrl);
    }

    // Build interactive buttons (max 5 per ActionRow)
    const actionRows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < assignments.length; i++) {
      const { assignment, workType } = assignments[i];
      const isClaimed = Boolean(assignment.status !== 'OPEN' && assignment.assignedWorkerId);

      const btn = new ButtonBuilder()
        .setCustomId(`cb_claim:${assignment._id.toString()}`)
        .setLabel(isClaimed ? `${workType.code}: Claimed` : `Claim ${workType.code}`)
        .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(isClaimed);

      // Add icons based on role code
      if (workType.code === 'TL') btn.setEmoji('🌐');
      else if (workType.code === 'CL') btn.setEmoji('🧹');
      else if (workType.code === 'TS') btn.setEmoji('✍️');
      else if (workType.code === 'PR') btn.setEmoji('🔍');
      else if (workType.code === 'QC') btn.setEmoji('✅');
      else if (workType.code === 'RD') btn.setEmoji('🎨');

      currentRow.addComponents(btn);

      if (currentRow.components.length === 5 || i === assignments.length - 1) {
        actionRows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }

    await interaction.reply({
      content: roleTagContent || undefined,
      embeds: [embed],
      components: actionRows,
    });
  },

  // Interactive Button Handler for Claim Buttons
  handleButton: async (interaction: ButtonInteraction) => {
    if (!interaction.customId.startsWith('cb_claim:')) return;

    const assignmentId = interaction.customId.replace('cb_claim:', '').trim();
    const assignment = await WorkAssignmentModel.findById(assignmentId);

    if (!assignment) {
      await interaction.reply({
        content: '❌ Task not found or already deleted.',
        ephemeral: true,
      });
      return;
    }

    if (assignment.status !== 'OPEN' || assignment.assignedWorkerId) {
      await interaction.reply({
        content: '⚠️ This role has already been claimed by someone else!',
        ephemeral: true,
      });
      return;
    }

    const manga = await MangaModel.findById(assignment.mangaId);
    const chapter = await ChapterModel.findById(assignment.chapterId);
    const workType = await WorkTypeModel.findById(assignment.workTypeId);

    if (!manga || !chapter || !workType) {
      await interaction.reply({ content: '❌ Error retrieving task metadata.', ephemeral: true });
      return;
    }

    // Find or create ClaimBoard user record for this Discord user
    let user = await UserModel.findOne({
      $or: [
        { discordId: interaction.user.id },
        { discordUsername: interaction.user.tag },
        { discordUsername: interaction.user.username },
      ],
    });

    if (!user) {
      const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      user = await UserModel.create({
        organizationId: assignment.organizationId,
        username: cleanName,
        displayName: interaction.user.globalName || interaction.user.username,
        discordId: interaction.user.id,
        discordUsername: interaction.user.tag || interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
        role: 'Worker',
        isApproved: true,
        approvedBy: 'Auto Discord Claim',
        approvedAt: new Date(),
        availability: 'Available',
        workload: 'Normal',
      });
    }

    // Execute Claim via ProductionService
    const claimResult = await ProductionService.claimWork({
      organizationId: assignment.organizationId.toString(),
      assignmentId: assignment._id.toString(),
      workerId: user._id.toString(),
      workerName: user.displayName || interaction.user.username,
      workerAvatarUrl: interaction.user.displayAvatarURL(),
    });

    // Re-fetch all assignments for this chapter to update the SAME single message in-place
    const allAssignments = await WorkAssignmentModel.find({ chapterId: chapter._id });
    const allWorkTypes = await WorkTypeModel.find({
      _id: { $in: allAssignments.map((a) => a.workTypeId) },
    });

    const workTypeMap = new Map(allWorkTypes.map((wt) => [wt._id.toString(), wt]));

    // Rebuild the Embed
    const updatedEmbed = new EmbedBuilder()
      .setColor(chapter.priority === 'Urgent' ? 0xef4444 : chapter.priority === 'High' ? 0xf59e0b : 0x6366f1)
      .setTitle(`📋 ${manga.title} — Chapter ${chapter.chapterNumber}`)
      .setDescription('New production tasks are open for claiming! Click the buttons below to claim your task.')
      .addFields(
        allAssignments.map((a) => {
          const wt = workTypeMap.get(a.workTypeId.toString());
          const isClaimed = a.status !== 'OPEN' && a.assignedWorkerId;
          const statusText = isClaimed
            ? `✅ Claimed by **${a.assignedWorkerName || 'Worker'}**`
            : `⏳ **Open**`;
          return {
            name: `${wt?.name || 'Task'} (${wt?.code || 'ROLE'})`,
            value: statusText,
            inline: true,
          };
        })
      )
      .addFields(
        { name: 'Priority', value: `\`${chapter.priority}\``, inline: true },
        { name: 'Dashboard', value: `[Open in ClaimBoard](${process.env.WEB_URL || 'http://localhost:5173'}/board?mangaId=${manga._id})`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard • Click a button below to claim a role' })
      .setTimestamp();

    if (manga.coverUrl) {
      updatedEmbed.setThumbnail(manga.coverUrl);
    }

    // Rebuild the Buttons
    const updatedActionRows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    for (let i = 0; i < allAssignments.length; i++) {
      const a = allAssignments[i];
      const wt = workTypeMap.get(a.workTypeId.toString());
      const isClaimed = Boolean(a.status !== 'OPEN' && a.assignedWorkerId);

      const btn = new ButtonBuilder()
        .setCustomId(`cb_claim:${a._id.toString()}`)
        .setLabel(isClaimed ? `${wt?.code || 'Task'}: ${a.assignedWorkerName || 'Claimed'}` : `Claim ${wt?.code || 'Role'}`)
        .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(isClaimed);

      if (wt?.code === 'TL') btn.setEmoji('🌐');
      else if (wt?.code === 'CL') btn.setEmoji('🧹');
      else if (wt?.code === 'TS') btn.setEmoji('✍️');
      else if (wt?.code === 'PR') btn.setEmoji('🔍');
      else if (wt?.code === 'QC') btn.setEmoji('✅');
      else if (wt?.code === 'RD') btn.setEmoji('🎨');

      currentRow.addComponents(btn);

      if (currentRow.components.length === 5 || i === allAssignments.length - 1) {
        updatedActionRows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
      }
    }

    // 1. Update the original message
    await interaction.update({
      embeds: [updatedEmbed],
      components: updatedActionRows,
    });

    // 2. Send Private / Ephemeral Confirmation Message to the user
    const deadlineStr = claimResult.claim?.deadline
      ? new Date(claimResult.claim.deadline).toLocaleString()
      : '48 hours from claim';

    const privateEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 You Claimed a Task!')
      .setDescription(
        `You have successfully claimed **${workType.name}** for **${manga.title} — Chapter ${chapter.chapterNumber}**.`
      )
      .addFields(
        { name: '📖 Series', value: manga.title, inline: true },
        { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
        { name: '⏰ Deadline', value: deadlineStr, inline: true },
        {
          name: '🚀 Task Workspace',
          value: `[Open My Claims on ClaimBoard](${process.env.WEB_URL || 'http://localhost:5173'}/my-claims)`,
          inline: false,
        }
      )
      .setFooter({ text: 'ClaimBoard • Scanlation Management System' })
      .setTimestamp();

    await interaction.followUp({
      embeds: [privateEmbed],
      ephemeral: true,
    });

    // Also attempt sending a DM directly to their inbox
    await interaction.user.send({ embeds: [privateEmbed] }).catch(() => null);
  },
};

// 2. /setrole series: <title> role: <@role>
const setroleCommand: BotCommand = {
  name: 'setrole',
  description: 'Set a specific Discord role to tag when assigning new chapters of a manga',
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Set a specific Discord role to tag when assigning new chapters of a manga')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('series')
        .setDescription('Manga or Manhwa series title')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addRoleOption((opt) =>
      opt
        .setName('role')
        .setDescription('Discord role to tag when /assign is used')
        .setRequired(true)
    ),

  autocomplete: async (interaction: AutocompleteInteraction) => {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const mangas = await MangaModel.find({
        $or: [
          { title: { $regex: focusedValue, $options: 'i' } },
          { altTitles: { $regex: focusedValue, $options: 'i' } },
        ],
      })
        .limit(20)
        .lean();

      await interaction.respond(
        mangas.map((m) => ({
          name: `${m.title} (${m.status})`,
          value: m.title,
        }))
      );
    } catch {
      await interaction.respond([]);
    }
  },

  execute: async ({ interaction }: CommandContext) => {
    // Check permission: Must be Admin, Manager, or configured BOT_ADMIN_DISCORD_ID
    const isAdmin = await checkIsAdmin(interaction.user.id);
    if (!isAdmin) {
      await interaction.reply({
        content: '❌ **Permission Denied**: Only administrators and managers can configure manga role tagging.',
        ephemeral: true,
      });
      return;
    }

    const seriesTitle = interaction.options.getString('series', true).trim();
    const role = interaction.options.getRole('role', true);

    const manga = await MangaModel.findOne({
      $or: [
        { title: { $regex: `^${seriesTitle}$`, $options: 'i' } },
        { title: { $regex: seriesTitle, $options: 'i' } },
        { altTitles: { $regex: seriesTitle, $options: 'i' } },
      ],
    });

    if (!manga) {
      await interaction.reply({
        content: `❌ Could not find series **"${seriesTitle}"** in the database.`,
        ephemeral: true,
      });
      return;
    }

    manga.discordRoleId = role.id;
    manga.discordRoleName = role.name;
    manga.discordGuildId = interaction.guildId || undefined;
    await manga.save();

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🏷️ Manga Notification Role Configured')
      .setDescription(
        `Members with <@&${role.id}> will now be automatically tagged whenever new chapters of **${manga.title}** are assigned using \`/assign\`!`
      )
      .addFields(
        { name: 'Series', value: `**${manga.title}**`, inline: true },
        { name: 'Tagged Role', value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
        { name: 'Role ID', value: `\`${role.id}\``, inline: true }
      )
      .setFooter({ text: 'ClaimBoard • Synced with web platform' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// 3. /claim command (legacy text/slash fallback)
const claimCommand: BotCommand = {
  name: 'claim',
  description: 'Claim an open task by work type code',
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim an open task for a manga by role code (e.g. TL, CL, TS)')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt.setName('work_type').setDescription('Code of work type (e.g. CL, TS, TL, QC)').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('series').setDescription('Series title (optional if in mapped channel)')
    ),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const workTypeCode = interaction.options.getString('work_type', true).toUpperCase();
    const seriesTitle = interaction.options.getString('series');
    const channelId = interaction.channelId;
    const user = interaction.user;

    let manga = null;
    if (seriesTitle) {
      manga = await MangaModel.findOne({ title: new RegExp(seriesTitle, 'i') });
    } else {
      const mapping = await DiscordChannelModel.findOne({ channelId });
      manga = mapping ? await MangaModel.findById(mapping.mangaId) : await MangaModel.findOne();
    }

    if (!manga) {
      await interaction.reply({ content: 'No series found. Specify `series: <title>`.', ephemeral: true });
      return;
    }

    const workType = await WorkTypeModel.findOne({
      organizationId: manga.organizationId,
      code: workTypeCode,
    });

    if (!workType) {
      await interaction.reply({ content: `Work type \`${workTypeCode}\` not found.`, ephemeral: true });
      return;
    }

    const assignment = await WorkAssignmentModel.findOne({
      mangaId: manga._id,
      workTypeId: workType._id,
      status: 'OPEN',
      isBlocked: false,
    });

    if (!assignment) {
      await interaction.reply({
        content: `No open task found for **${manga.title}** (${workType.name}). It might already be claimed.`,
        ephemeral: true,
      });
      return;
    }

    let dbUser = await UserModel.findOne({ discordId: user.id });
    if (!dbUser) {
      dbUser = await UserModel.findOne();
    }

    if (!dbUser) {
      await interaction.reply({ content: 'No worker account found in database.', ephemeral: true });
      return;
    }

    const result = await ProductionService.claimWork({
      organizationId: assignment.organizationId.toString(),
      assignmentId: assignment._id.toString(),
      workerId: dbUser._id.toString(),
      workerName: dbUser.displayName || user.username,
      workerAvatarUrl: user.displayAvatarURL(),
    });

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('Task Claimed Successfully!')
      .setDescription(`**${user.username}** claimed **${manga.title}** — **${workType.name}**`)
      .addFields(
        { name: 'Claim ID', value: `\`${result.claim._id}\``, inline: true },
        { name: 'Deadline', value: new Date(result.claim.deadline).toLocaleString(), inline: true },
        { name: 'Workspace', value: `[Submit Deliverable](${webUrl}/my-claims)`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });

    const chapter = await ChapterModel.findById(assignment.chapterId);
    await BotLogger.taskClaimed({
      client: interaction.client,
      guildId: interaction.guildId,
      mangaTitle: manga.title,
      chapterNumber: chapter?.chapterNumber || 'Latest',
      workTypeName: workType.name,
      workTypeCode: workType.code,
      workerName: user.username,
      workerId: user.id,
      deadline: result.claim?.deadline,
    });
  },
};

// 4. /unclaim command
const unclaimCommand: BotCommand = {
  name: 'unclaim',
  description: 'Release an active claim',
  data: new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Release an active claim')
    .setDMPermission(true)
    .addStringOption((opt) => opt.setName('task_id').setDescription('Assignment or task ID to release').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason for unclaiming')),
  execute: async ({ interaction }: CommandContext) => {
    const taskId = interaction.options.getString('task_id', true);
    const reason = interaction.options.getString('reason') || 'Released by worker';
    const user = interaction.user;

    const dbUser = await UserModel.findOne({ discordId: user.id });
    const claim = await ClaimModel.findOne({
      assignmentId: taskId,
      status: 'ACTIVE',
    });

    if (!claim) {
      await interaction.reply({
        content: `Could not find an active claim matching task ID \`${taskId}\`.`,
        ephemeral: true,
      });
      return;
    }

    await ProductionService.unclaimWork({
      organizationId: claim.organizationId.toString(),
      assignmentId: claim.assignmentId.toString(),
      workerId: dbUser ? dbUser._id.toString() : claim.workerId.toString(),
      workerName: user.username,
      reason,
    });

    await interaction.reply({
      content: `Claim \`${taskId}\` has been successfully released and placed back in open work.`,
    });

    await BotLogger.taskUnclaimed({
      client: interaction.client,
      guildId: interaction.guildId,
      mangaTitle: 'Assignment',
      workTypeName: taskId,
      workerName: user.username,
      reason,
    });
  },
};

// 5. /myclaims command
const myclaimsCommand: BotCommand = {
  name: 'myclaims',
  description: 'View your active claims and deadlines (Private)',
  data: new SlashCommandBuilder()
    .setName('myclaims')
    .setDescription('View your active claims and deadlines (Private)')
    .setDMPermission(true),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const user = interaction.user;
    const dbUser = await UserModel.findOne({ discordId: user.id });
    const claims = dbUser
      ? await ClaimModel.find({ workerId: dbUser._id, status: 'ACTIVE' }).limit(5)
      : [];

    const embed = new EmbedBuilder()
      .setColor(0x0ea5e9)
      .setTitle(`Your Active Production Claims (${claims.length})`)
      .setDescription(
        claims.length === 0
          ? 'You have no active claims currently. Browse open tasks using `/board` or check the Open Work board!'
          : claims.map((c) => `• Task ID: \`${c.assignmentId}\` — Claimed: ${new Date(c.claimedAt).toLocaleDateString()}`).join('\n')
      )
      .addFields({ name: 'Web Access', value: `[Open My Claims in Browser](${webUrl}/my-claims)` })
      .setFooter({ text: 'ClaimBoard • Scanlation Management System' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// 6. /seeclaims command
const seeclaimsCommand: BotCommand = {
  name: 'seeclaims',
  description: 'View claim status for the latest chapter',
  data: new SlashCommandBuilder()
    .setName('seeclaims')
    .setDescription('View claim status for the latest chapter')
    .setDMPermission(true)
    .addStringOption((opt) => opt.setName('series').setDescription('Manga series title (optional)')),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const seriesOpt = interaction.options.getString('series');
    const channelId = interaction.channelId;

    let manga = null;
    if (seriesOpt) {
      manga = await MangaModel.findOne({ title: new RegExp(seriesOpt, 'i') });
    } else {
      const mapping = await DiscordChannelModel.findOne({ channelId });
      manga = mapping ? await MangaModel.findById(mapping.mangaId) : await MangaModel.findOne();
    }

    if (!manga) {
      await interaction.reply({ content: 'No manga found.', ephemeral: true });
      return;
    }

    const chapter = await ChapterModel.findOne({ mangaId: manga._id }).sort({ createdAt: -1 });
    const assignments = chapter ? await WorkAssignmentModel.find({ chapterId: chapter._id }) : [];

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`${manga.title} — Chapter ${chapter?.chapterNumber || 'Latest'}`)
      .setDescription(`Status: **${chapter?.status || 'Active'}**`)
      .addFields(
        assignments.map((a) => ({
          name: `Assignment #${a._id.toString().slice(-4)}`,
          value: `Status: **${a.status}** | Assigned: ${a.assignedWorkerName || 'Open'}`,
          inline: true,
        }))
      )
      .addFields({ name: 'Visual Pipeline', value: `[View Full Pipeline](${webUrl}/pipeline)` });

    await interaction.reply({ embeds: [embed] });
  },
};

// 7. /board command
const boardCommand: BotCommand = {
  name: 'board',
  description: 'Get a private direct link to your personal ClaimBoard dashboard',
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('Get a private direct link to your personal ClaimBoard dashboard')
    .setDMPermission(true),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const user = interaction.user;

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('ClaimBoard Production Dashboard')
      .setDescription(`Welcome back, **${user.username}**!\nAccess your live workspace, claims, and active pipeline below:`)
      .addFields(
        { name: 'Dashboard', value: `[Open Dashboard](${webUrl}/dashboard)`, inline: true },
        { name: 'My Claims', value: `[View My Claims](${webUrl}/my-claims)`, inline: true },
        { name: 'Open Work', value: `[Browse Work Board](${webUrl}/open-work)`, inline: true }
      )
      .setFooter({ text: 'ClaimBoard • Scanlation Management System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// 8. /progress command
const progressCommand: BotCommand = {
  name: 'progress',
  description: 'View visual pipeline progress for active chapters',
  data: new SlashCommandBuilder()
    .setName('progress')
    .setDescription('View visual pipeline progress for active chapters')
    .setDMPermission(true),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const manga = await MangaModel.findOne();
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`Production Pipeline: ${manga?.title || 'Scanlation'}`)
      .setDescription('Raw ➔ Translation ➔ Cleaning ➔ Redrawing ➔ Typesetting ➔ QC ➔ Upload')
      .addFields({ name: 'Live Web Stepper', value: `[Open Realtime Pipeline View](${webUrl}/pipeline)` });

    await interaction.reply({ embeds: [embed] });
  },
};

// 10. /submit command
const submitCommand: BotCommand = {
  name: 'submit',
  description: 'View your active tasks and submit your deliverable work for admin approval',
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('View your active tasks and submit deliverable work for admin approval')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('task')
        .setDescription('Select one of your active tasks (leave empty to view your task list)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('url')
        .setDescription('Deliverable link (leave empty to open submission popup)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('note')
        .setDescription('Optional note or comments for the reviewer')
        .setRequired(false)
    ),

  autocomplete: async (interaction: AutocompleteInteraction) => {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();

      // Find this worker in ClaimBoard
      const dbUser = await UserModel.findOne({
        $or: [
          { discordId: interaction.user.id },
          { discordUsername: interaction.user.tag },
          { discordUsername: interaction.user.username },
        ],
      });

      if (!dbUser) {
        await interaction.respond([]);
        return;
      }

      // Query this worker's active assignments
      const activeAssignments = await WorkAssignmentModel.find({
        assignedWorkerId: dbUser._id,
        status: { $in: ['CLAIMED', 'CHANGES_REQUESTED', 'IN_PROGRESS'] },
      }).populate('workTypeId');

      const choices: Array<{ name: string; value: string }> = [];
      for (const a of activeAssignments) {
        const manga = await MangaModel.findById(a.mangaId);
        const chapter = await ChapterModel.findById(a.chapterId);
        const wt = a.workTypeId as any;
        if (manga && chapter && wt) {
          choices.push({
            name: `${manga.title} — Ch. ${chapter.chapterNumber} (${wt.name})`.slice(0, 100),
            value: a._id.toString(),
          });
        }
      }

      const filtered = choices
        .filter((c) => c.name.toLowerCase().includes(focusedValue))
        .slice(0, 25);

      await interaction.respond(filtered);
    } catch {
      await interaction.respond([]);
    }
  },

  execute: async ({ interaction, client, webUrl }: CommandContext) => {
    const taskInput = interaction.options.getString('task')?.trim();
    let deliverableUrl = interaction.options.getString('url')?.trim();
    const note = interaction.options.getString('note')?.trim();

    // 1. Locate user in ClaimBoard
    const dbUser = await UserModel.findOne({
      $or: [
        { discordId: interaction.user.id },
        { discordUsername: interaction.user.tag },
        { discordUsername: interaction.user.username },
      ],
    });

    // 2. Fetch all active assignments for this worker
    const activeAssignments = dbUser
      ? await WorkAssignmentModel.find({
          assignedWorkerId: dbUser._id,
          status: { $in: ['CLAIMED', 'CHANGES_REQUESTED', 'IN_PROGRESS'] },
        }).populate('workTypeId')
      : [];

    const assignmentsWithMeta: Array<{ assignment: any; manga: any; chapter: any; workType: any }> = [];
    if (activeAssignments.length > 0) {
      for (const a of activeAssignments) {
        const manga = await MangaModel.findById(a.mangaId);
        const chapter = await ChapterModel.findById(a.chapterId);
        const workType = a.workTypeId as any;
        if (manga && chapter && workType) {
          assignmentsWithMeta.push({ assignment: a, manga, chapter, workType });
        }
      }
    }

    // If user has NO active tasks
    if (assignmentsWithMeta.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('📋 No Active Claimed Tasks')
        .setDescription(
          `Hey **${interaction.user.username}**, you don't have any active claimed tasks right now!\n\n` +
          `• Claim tasks for a chapter using \`/assign\` or the claim buttons\n` +
          `• Browse open tasks on the web: [ClaimBoard Open Work](${webUrl}/open-work)\n` +
          `• Check your personal dashboard: \`/board\``
        )
        .setFooter({ text: 'ClaimBoard • Scanlation Management' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // CASE 1: If user provided BOTH task and url (direct inline submission)
    if (taskInput && deliverableUrl) {
      await interaction.deferReply();
      let matched = assignmentsWithMeta.find((item) => item.assignment._id.toString() === taskInput);
      if (!matched) {
        const lower = taskInput.toLowerCase();
        matched = assignmentsWithMeta.find(
          (item) =>
            item.manga.title.toLowerCase().includes(lower) ||
            item.workType.name.toLowerCase().includes(lower) ||
            item.workType.code.toLowerCase() === lower
        );
      }

      if (!matched && assignmentsWithMeta.length === 1) {
        matched = assignmentsWithMeta[0];
      }

      if (!matched) {
        await interaction.editReply({
          content: `❌ Could not match task \`${taskInput}\` to one of your active claims. Please run \`/submit\` without arguments to choose from your active tasks.`,
        });
        return;
      }

      await processTaskSubmission({
        interaction,
        client,
        webUrl,
        assignment: matched.assignment,
        manga: matched.manga,
        chapter: matched.chapter,
        workType: matched.workType,
        user: dbUser,
        deliverableUrl,
        notes: note,
      });
      return;
    }

    // CASE 2: If user provided ONLY url and has exactly 1 active task
    if (deliverableUrl && assignmentsWithMeta.length === 1) {
      await interaction.deferReply();
      const item = assignmentsWithMeta[0];
      await processTaskSubmission({
        interaction,
        client,
        webUrl,
        assignment: item.assignment,
        manga: item.manga,
        chapter: item.chapter,
        workType: item.workType,
        user: dbUser,
        deliverableUrl,
        notes: note,
      });
      return;
    }

    // CASE 3: Display active tasks with interactive "Submit Deliverable" buttons!
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`📋 Your Active Tasks (${assignmentsWithMeta.length})`)
      .setDescription(
        `Click **Submit** below on the task you finished to submit your deliverable link for admin review:`
      )
      .setFooter({ text: 'ClaimBoard • Click Submit to open the deliverable submission popup' })
      .setTimestamp();

    const actionRows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    // Add fields for each task
    for (let i = 0; i < assignmentsWithMeta.length; i++) {
      const { assignment, manga, chapter, workType } = assignmentsWithMeta[i];
      const deadlineStr = assignment.deadline
        ? `<t:${Math.floor(new Date(assignment.deadline).getTime() / 1000)}:R>`
        : 'None set';

      embed.addFields({
        name: `${i + 1}. ${manga.title} — Ch. ${chapter.chapterNumber}`,
        value: `**Task**: ${workType.name} (\`${workType.code}\`)\n**Status**: \`${assignment.status}\` | **Deadline**: ${deadlineStr}`,
        inline: false,
      });
    }

    // If <= 5 tasks, render quick buttons
    if (assignmentsWithMeta.length <= 5) {
      const buttonRow = new ActionRowBuilder<ButtonBuilder>();
      for (const { assignment, manga, chapter, workType } of assignmentsWithMeta) {
        const shortTitle = manga.title.length > 12 ? `${manga.title.slice(0, 11)}…` : manga.title;
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`cb_btn_submit:${assignment._id.toString()}`)
            .setLabel(`Submit: ${shortTitle} Ch. ${chapter.chapterNumber} (${workType.code})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📤')
        );
      }
      actionRows.push(buttonRow);
    } else {
      // If > 5 tasks, use a StringSelectMenu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('cb_select_submit')
        .setPlaceholder('👉 Choose a task to submit deliverable...')
        .addOptions(
          assignmentsWithMeta.slice(0, 25).map(({ assignment, manga, chapter, workType }) => ({
            label: `${manga.title} — Ch. ${chapter.chapterNumber}`.slice(0, 100),
            description: `Role: ${workType.name} (${workType.code}) • Status: ${assignment.status}`.slice(0, 100),
            value: assignment._id.toString(),
            emoji: '📤',
          }))
        );
      actionRows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
    }

    await interaction.reply({
      embeds: [embed],
      components: actionRows,
      ephemeral: true,
    });
  },

  handleButton: async (interaction: ButtonInteraction) => {
    // 1. Submit Button clicked on a worker's active task
    if (interaction.customId.startsWith('cb_btn_submit:')) {
      const assignmentId = interaction.customId.replace('cb_btn_submit:', '').trim();
      const assignment = await WorkAssignmentModel.findById(assignmentId).populate('workTypeId');
      if (!assignment) {
        await interaction.reply({ content: '❌ Task not found.', ephemeral: true });
        return;
      }
      const manga = await MangaModel.findById(assignment.mangaId);
      const chapter = await ChapterModel.findById(assignment.chapterId);
      const modalTitle = `Submit: ${(manga?.title || 'Task').slice(0, 25)} Ch. ${chapter?.chapterNumber || ''}`.slice(0, 45);

      const modal = new ModalBuilder()
        .setCustomId(`cb_modal_submit:${assignmentId}`)
        .setTitle(modalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('deliverable_url')
              .setLabel('Deliverable Link / URL')
              .setPlaceholder('https://drive.google.com/... (Google Drive, Mega, etc.)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('notes')
              .setLabel('Notes for Reviewer (Optional)')
              .setPlaceholder('e.g. Page 12 redraw was tricky, please verify')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);
      return;
    }

    // 2. Admin Review buttons (Approve / Request Changes)
    await handleTaskReviewButton(interaction);
  },

  handleSelect: async (interaction: StringSelectMenuInteraction) => {
    if (interaction.customId === 'cb_select_submit') {
      const assignmentId = interaction.values[0];
      const assignment = await WorkAssignmentModel.findById(assignmentId).populate('workTypeId');
      if (!assignment) {
        await interaction.reply({ content: '❌ Task not found.', ephemeral: true });
        return;
      }
      const manga = await MangaModel.findById(assignment.mangaId);
      const chapter = await ChapterModel.findById(assignment.chapterId);
      const modalTitle = `Submit: ${(manga?.title || 'Task').slice(0, 25)} Ch. ${chapter?.chapterNumber || ''}`.slice(0, 45);

      const modal = new ModalBuilder()
        .setCustomId(`cb_modal_submit:${assignmentId}`)
        .setTitle(modalTitle)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('deliverable_url')
              .setLabel('Deliverable Link / URL')
              .setPlaceholder('https://drive.google.com/... (Google Drive, Mega, etc.)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('notes')
              .setLabel('Notes for Reviewer (Optional)')
              .setPlaceholder('e.g. Page 12 redraw was tricky, please verify')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);
      return;
    }
  },

  handleModal: async (interaction: ModalSubmitInteraction) => {
    if (interaction.customId.startsWith('cb_modal_submit:')) {
      await interaction.deferReply({ ephemeral: false });
      const assignmentId = interaction.customId.replace('cb_modal_submit:', '').trim();
      const deliverableUrl = interaction.fields.getTextInputValue('deliverable_url').trim();
      const notes = interaction.fields.getTextInputValue('notes')?.trim();

      const assignment = await WorkAssignmentModel.findById(assignmentId).populate('workTypeId');
      if (!assignment) {
        await interaction.editReply({ content: '❌ Work assignment not found.' });
        return;
      }
      const manga = await MangaModel.findById(assignment.mangaId);
      const chapter = await ChapterModel.findById(assignment.chapterId);
      const workType = assignment.workTypeId as any;

      let dbUser = await UserModel.findOne({
        $or: [
          { discordId: interaction.user.id },
          { discordUsername: interaction.user.tag },
          { discordUsername: interaction.user.username },
        ],
      });

      await processTaskSubmission({
        interaction,
        client: interaction.client,
        webUrl: process.env.WEB_URL || 'http://localhost:5173',
        assignment,
        manga,
        chapter,
        workType,
        user: dbUser,
        deliverableUrl,
        notes,
      });
      return;
    }
  },
};

// Core submission pipeline: submits work, updates metrics, logs activity, and DMs admins
async function processTaskSubmission(params: {
  interaction: any;
  client: any;
  webUrl: string;
  assignment: any;
  manga: any;
  chapter: any;
  workType: any;
  user: any;
  deliverableUrl: string;
  notes?: string;
}) {
  let { interaction, client, webUrl, assignment, manga, chapter, workType, user, deliverableUrl, notes } = params;

  if (!/^https?:\/\//i.test(deliverableUrl)) {
    deliverableUrl = `https://${deliverableUrl}`;
  }

  // Ensure user record exists
  if (!user) {
    let candidateUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existing = await UserModel.findOne({ organizationId: assignment.organizationId, username: candidateUsername });
    if (existing && !existing.discordId) {
      existing.discordId = interaction.user.id;
      existing.discordUsername = interaction.user.tag || interaction.user.username;
      await existing.save();
      user = existing;
    } else {
      user = await UserModel.create({
        organizationId: assignment.organizationId,
        username: existing ? `${candidateUsername}_${interaction.user.id.slice(-4)}` : candidateUsername,
        displayName: interaction.user.globalName || interaction.user.username,
        discordId: interaction.user.id,
        discordUsername: interaction.user.tag || interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
        role: 'Worker',
        isApproved: true,
        approvedBy: 'Auto Discord Submission',
        approvedAt: new Date(),
        availability: 'Available',
        workload: 'Normal',
      });
    }
  }

  // Ensure active claim exists for this assignment
  let claim = assignment.activeClaimId
    ? await ClaimModel.findById(assignment.activeClaimId)
    : null;

  if (!claim) {
    claim = await ClaimModel.findOne({
      assignmentId: assignment._id,
      status: { $in: ['ACTIVE', 'SUBMITTED', 'CHANGES_REQUESTED'] },
    });
  }

  if (!claim) {
    claim = await ClaimModel.create({
      organizationId: assignment.organizationId,
      assignmentId: assignment._id,
      workerId: user._id,
      workerName: user.displayName || interaction.user.username,
      workerAvatarUrl: interaction.user.displayAvatarURL(),
      status: 'ACTIVE',
      claimedAt: new Date(),
      deadline: assignment.deadline,
      revisions: [],
    });
  }

  assignment.activeClaimId = claim._id;
  assignment.assignedWorkerId = user._id;
  assignment.assignedWorkerName = user.displayName || interaction.user.username;
  await assignment.save();

  // Submit deliverable via ProductionService
  const result = await ProductionService.submitWork({
    organizationId: assignment.organizationId.toString(),
    assignmentId: assignment._id.toString(),
    workerId: user._id.toString(),
    workerName: user.displayName || interaction.user.username,
    deliverableUrl,
    label: `Submission via /submit`,
    notes,
  });

  const revisionNum = result.claim?.revisions?.length || 1;

  // Confirmation to the worker
  const confirmationEmbed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🚀 Deliverable Submitted Successfully!')
    .setDescription(
      `Great work! Your submission for **${manga.title} — Chapter ${chapter.chapterNumber}** (${workType.name}) has been submitted and queued for administrator review.`
    )
    .addFields(
      { name: '📖 Series', value: manga.title, inline: true },
      { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
      { name: '🎯 Task', value: `${workType.name} (\`${workType.code}\`)`, inline: true },
      { name: '🔗 Deliverable', value: `[Open Deliverable Link](${deliverableUrl})`, inline: false },
      { name: '📝 Note', value: notes ? `>>> ${notes}` : '*No notes attached*', inline: false },
      { name: '📦 Revision', value: `#${revisionNum}`, inline: true },
      { name: '⏳ Status', value: '`Pending Admin Approval`', inline: true },
      { name: '📋 Canvas Board', value: `[Open Pipeline View](${webUrl}/pipeline/${manga._id}/${chapter._id})`, inline: true }
    )
    .setFooter({ text: 'ClaimBoard • Scanlation Management System' })
    .setTimestamp();

  if (manga.coverUrl) {
    confirmationEmbed.setThumbnail(manga.coverUrl);
  }

  let claimerDmMsg: any = null;
  try {
    const claimerDiscord = await client.users.fetch(interaction.user.id);
    if (claimerDiscord) {
      claimerDmMsg = await claimerDiscord.send({ embeds: [confirmationEmbed] }).catch(() => null);
    }
  } catch (dmErr: any) {
    console.warn('[Submit] Could not dispatch confirmation to claimer DM:', dmErr?.message);
  }

  let replyMsg: any = null;
  if (interaction.deferred || interaction.replied) {
    replyMsg = await interaction.editReply({ embeds: [confirmationEmbed] });
  } else {
    replyMsg = await interaction.reply({ embeds: [confirmationEmbed], fetchReply: true });
  }

  // Save the submission message ID and channel ID (prioritizing claimer DM receipt)
  if (claimerDmMsg) {
    assignment.discordSubmissionMessageId = claimerDmMsg.id;
    assignment.discordSubmissionChannelId = claimerDmMsg.channelId;
    await assignment.save();
  } else if (replyMsg && replyMsg.id) {
    assignment.discordSubmissionMessageId = replyMsg.id;
    assignment.discordSubmissionChannelId = replyMsg.channelId || interaction.channelId;
    await assignment.save();
  }

  // Audit log to bot log channels
  await BotLogger.taskSubmitted({
    client,
    guildId: interaction.guildId,
    mangaTitle: manga.title,
    chapterNumber: chapter.chapterNumber,
    workTypeName: workType.name,
    workTypeCode: workType.code,
    workerName: user.displayName || interaction.user.username,
    workerId: interaction.user.id,
    deliverableUrl,
    notes,
    revision: revisionNum,
  });

  // Dispatch DM to Admins with Interactive Approve & Request Changes buttons
  try {
    const adminUsers = await UserModel.find({
      organizationId: assignment.organizationId,
      role: { $in: ['Owner', 'Administrator', 'Manager'] },
      discordId: { $exists: true, $ne: '' },
    }).lean();

    const envAdmins = (process.env.BOT_ADMIN_DISCORD_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const targetDiscordIds: string[] = Array.from(
      new Set([
        ...adminUsers.map((u) => u.discordId).filter((id): id is string => Boolean(id)),
        ...envAdmins,
      ])
    );

    const adminEmbed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`📥 New Submission: ${manga.title} Ch. ${chapter.chapterNumber}`)
      .setDescription(
        `**${user.displayName || interaction.user.username}** (<@${interaction.user.id}>) has submitted their deliverable for **${workType.name}** and is awaiting your review!`
      )
      .addFields(
        { name: '📖 Series', value: manga.title, inline: true },
        { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${workType.name} (\`${workType.code}\`)`, inline: true },
        { name: '👤 Worker', value: `<@${interaction.user.id}> (${user.displayName || interaction.user.username})`, inline: true },
        { name: '📦 Revision', value: `#${revisionNum}`, inline: true },
        { name: '⏱️ Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { name: '🔗 Deliverable URL', value: `[Click to Open Deliverable](${deliverableUrl})`, inline: false },
        { name: '📝 Worker Note', value: notes ? `>>> ${notes}` : '*No notes attached*', inline: false }
      )
      .setFooter({ text: 'ClaimBoard Review System • Click Approve or Request Changes below' })
      .setTimestamp();

    if (manga.coverUrl) {
      adminEmbed.setThumbnail(manga.coverUrl);
    }

    const reviewRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`cb_task_approve:${assignment._id.toString()}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`cb_task_reject:${assignment._id.toString()}`)
        .setLabel('Request Changes')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔁')
    );

    try {
      new URL(deliverableUrl);
      reviewRow.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open Deliverable')
          .setURL(deliverableUrl)
          .setEmoji('🔗')
      );
    } catch {
      // Skip invalid URL button
    }

    reviewRow.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('View Pipeline')
        .setURL(`${webUrl}/pipeline/${manga._id}/${chapter._id}`)
        .setEmoji('📋')
    );

    for (const adminId of targetDiscordIds) {
      try {
        const discordAdmin = await client.users.fetch(adminId);
        if (discordAdmin) {
          await discordAdmin.send({
            embeds: [adminEmbed],
            components: [reviewRow],
          });
        }
      } catch (dmErr: any) {
        console.warn(`[Submit] Could not dispatch DM to admin (${adminId}):`, dmErr?.message);
      }
    }
  } catch (adminErr: any) {
    console.error('[Submit] Error finding and notifying admins:', adminErr);
  }
}

// Helper: Notify worker on DM and edit their original submission message in place
async function notifyClaimerAndEditSubmissionMessage(params: {
  client: any;
  assignment: any;
  manga: any;
  chapter: any;
  workType: any;
  reviewerName: string;
  reviewerId: string;
  isApprove: boolean;
  comment?: string;
  webUrl: string;
}) {
  const { client, assignment, manga, chapter, workType, reviewerName, reviewerId, isApprove, comment, webUrl } = params;

  // 1. Edit the submission receipt message in-place where it previously showed "Pending Admin Approval"
  if (assignment.discordSubmissionChannelId && assignment.discordSubmissionMessageId) {
    try {
      const channel = await client.channels.fetch(assignment.discordSubmissionChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const originalMsg = await channel.messages.fetch(assignment.discordSubmissionMessageId).catch(() => null);
        if (originalMsg && originalMsg.embeds.length > 0) {
          const oldEmbed = originalMsg.embeds[0];
          const editedEmbed = EmbedBuilder.from(oldEmbed);

          if (isApprove) {
            editedEmbed.setColor(0x10b981);
            editedEmbed.setTitle('✅ Deliverable Approved!');
          } else {
            editedEmbed.setColor(0xef4444);
            editedEmbed.setTitle('⚠️ Changes Requested on Deliverable');
          }

          const existingFields = oldEmbed.fields || [];
          const updatedFields = existingFields.map((f: any) => {
            if (f.name.includes('Status')) {
              return {
                name: isApprove ? '✅ Status' : '⚠️ Status',
                value: isApprove
                  ? `\`Approved by ${reviewerName}\``
                  : `\`Changes Requested by ${reviewerName}\``,
                inline: f.inline ?? true,
              };
            }
            return f;
          });

          if (!updatedFields.some((f: any) => f.name.includes('Status'))) {
            updatedFields.push({
              name: isApprove ? '✅ Status' : '⚠️ Status',
              value: isApprove
                ? `\`Approved by ${reviewerName}\``
                : `\`Changes Requested by ${reviewerName}\``,
              inline: true,
            });
          }

          updatedFields.push({
            name: isApprove ? '👑 Approved By' : '👤 Reviewed By',
            value: `<@${reviewerId}> (${reviewerName})`,
            inline: true,
          });

          if (comment) {
            updatedFields.push({
              name: '💬 Review Feedback',
              value: `>>> ${comment}`,
              inline: false,
            });
          }

          editedEmbed.setFields(updatedFields);
          editedEmbed.setTimestamp(new Date());

          await originalMsg.edit({ embeds: [editedEmbed] }).catch((editErr: any) => {
            console.warn('[EditSubmissionMessage] Could not edit submission message:', editErr?.message);
          });
        }
      }
    } catch (err: any) {
      console.warn('[EditSubmissionMessage] Error fetching or editing message:', err?.message);
    }
  }

  // 2. Dispatch DM to Claimer stating their task has been approved
  let claimerDiscordId: string | null = null;
  if (assignment.assignedWorkerId) {
    const worker = await UserModel.findById(assignment.assignedWorkerId);
    if (worker?.discordId) {
      claimerDiscordId = worker.discordId;
    }
  }

  if (claimerDiscordId) {
    try {
      const claimerUser = await client.users.fetch(claimerDiscordId).catch(() => null);
      if (claimerUser) {
        const notifyEmbed = new EmbedBuilder()
          .setColor(isApprove ? 0x10b981 : 0xef4444)
          .setTitle(isApprove ? '🎉 Your Task Has Been Approved!' : '⚠️ Changes Requested On Your Submission')
          .setDescription(
            isApprove
              ? `Great news! Your task submission for **${manga?.title || 'Series'} — Chapter ${chapter?.chapterNumber || ''}** (${workType?.name || 'Task'}) was reviewed and **APPROVED** by **${reviewerName}**!`
              : `**${reviewerName}** reviewed your task submission for **${manga?.title || 'Series'} — Chapter ${chapter?.chapterNumber || ''}** (${workType?.name || 'Task'}) and requested changes.`
          )
          .addFields(
            { name: '📖 Series', value: manga?.title || 'Series', inline: true },
            { name: '📑 Chapter', value: `Chapter ${chapter?.chapterNumber || ''}`, inline: true },
            { name: '🎯 Task', value: `${workType?.name || 'Task'} (\`${workType?.code || ''}\`)`, inline: true },
            { name: '👤 Reviewed By', value: `<@${reviewerId}> (${reviewerName})`, inline: true },
            {
              name: '💬 Review Feedback',
              value: comment ? `>>> ${comment}` : isApprove ? '*Looks great! Thank you for your work.*' : '*Please review the changes requested.*',
              inline: false,
            },
            {
              name: isApprove ? '🚀 Pipeline Status' : '📝 What To Do',
              value: isApprove
                ? `[Open Pipeline View](${webUrl}/pipeline/${manga?._id}/${chapter?._id}) — Downstream stages unblocked!`
                : 'Please make the required changes and resubmit using `/submit`.',
              inline: false,
            }
          )
          .setFooter({ text: 'ClaimBoard • Scanlation Management' })
          .setTimestamp();

        if (manga?.coverUrl) {
          notifyEmbed.setThumbnail(manga.coverUrl);
        }

        await claimerUser.send({ embeds: [notifyEmbed] }).catch(() => null);
      }
    } catch (dmErr: any) {
      console.warn('[NotifyClaimer] Could not send DM notification to claimer:', dmErr?.message);
    }
  }

  // Audit log to bot log channels
  if (isApprove) {
    await BotLogger.taskApproved({
      client,
      guildId: null,
      mangaTitle: manga?.title || 'Series',
      chapterNumber: chapter?.chapterNumber || '',
      workTypeName: workType?.name || 'Task',
      workerName: assignment.assignedWorkerName || 'Worker',
      reviewerName,
      reviewerId,
      comment,
    });
  } else {
    await BotLogger.taskChangesRequested({
      client,
      guildId: null,
      mangaTitle: manga?.title || 'Series',
      chapterNumber: chapter?.chapterNumber || '',
      workTypeName: workType?.name || 'Task',
      workerName: assignment.assignedWorkerName || 'Worker',
      reviewerName,
      reviewerId,
      comment,
    });
  }
}

// Interactive Button Handler for Task Approval and Changes Requested
async function handleTaskReviewButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('cb_task_approve:') && !interaction.customId.startsWith('cb_task_reject:')) {
    return;
  }

  const isApprove = interaction.customId.startsWith('cb_task_approve:');
  const assignmentId = isApprove
    ? interaction.customId.replace('cb_task_approve:', '').trim()
    : interaction.customId.replace('cb_task_reject:', '').trim();

  const isAdmin = await checkIsAdmin(interaction.user.id);
  if (!isAdmin) {
    await interaction.reply({
      content: '❌ **Permission Denied**: Only administrators and managers can review deliverables.',
      ephemeral: true,
    });
    return;
  }

  const assignment = await WorkAssignmentModel.findById(assignmentId).populate('workTypeId');
  if (!assignment) {
    await interaction.reply({ content: '❌ Work assignment not found or was removed.', ephemeral: true });
    return;
  }

  const manga = await MangaModel.findById(assignment.mangaId);
  const chapter = await ChapterModel.findById(assignment.chapterId);
  const workType = assignment.workTypeId as any;

  if (isApprove && assignment.status === 'COMPLETED') {
    await interaction.reply({
      content: 'ℹ️ This deliverable is already approved and marked as completed.',
      ephemeral: true,
    });
    return;
  }

  let reviewerUser = await UserModel.findOne({ discordId: interaction.user.id });
  if (!reviewerUser) {
    const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    reviewerUser = await UserModel.create({
      organizationId: assignment.organizationId,
      username: cleanName,
      displayName: interaction.user.globalName || interaction.user.username,
      discordId: interaction.user.id,
      discordUsername: interaction.user.tag || interaction.user.username,
      avatarUrl: interaction.user.displayAvatarURL(),
      role: 'Administrator',
      isApproved: true,
      approvedBy: 'Discord Admin',
      approvedAt: new Date(),
      availability: 'Available',
      workload: 'Normal',
    });
  }

  // Ensure active claim exists if needed
  if (!assignment.activeClaimId) {
    const claim = await ClaimModel.findOne({ assignmentId: assignment._id }).sort({ createdAt: -1 });
    if (claim) {
      assignment.activeClaimId = claim._id;
      await assignment.save();
    } else {
      const newClaim = await ClaimModel.create({
        organizationId: assignment.organizationId,
        assignmentId: assignment._id,
        workerId: assignment.assignedWorkerId || reviewerUser._id,
        workerName: assignment.assignedWorkerName || 'Worker',
        status: isApprove ? 'COMPLETED' : 'CHANGES_REQUESTED',
        claimedAt: new Date(),
        deadline: assignment.deadline,
        revisions: [
          {
            revisionNumber: 1,
            deliverableUrl: 'Reviewed via Discord DM',
            submittedAt: new Date(),
            submittedById: assignment.assignedWorkerId || reviewerUser._id,
            submittedByName: assignment.assignedWorkerName || 'Worker',
          } as any,
        ],
      });
      assignment.activeClaimId = newClaim._id;
      await assignment.save();
    }
  }

  if (isApprove) {
    await ProductionService.reviewWork({
      organizationId: assignment.organizationId.toString(),
      assignmentId: assignment._id.toString(),
      reviewerId: reviewerUser._id.toString(),
      reviewerName: reviewerUser.displayName || interaction.user.username,
      status: 'Approved',
      comment: 'Approved via Admin DM',
    });
  } else {
    await ProductionService.reviewWork({
      organizationId: assignment.organizationId.toString(),
      assignmentId: assignment._id.toString(),
      reviewerId: reviewerUser._id.toString(),
      reviewerName: reviewerUser.displayName || interaction.user.username,
      status: 'Changes_Requested',
      comment: 'Changes requested via Admin DM',
    });
  }

  // Update the Admin DM Embed in place
  const oldEmbed = interaction.message.embeds[0];
  const updatedEmbed = oldEmbed ? EmbedBuilder.from(oldEmbed) : new EmbedBuilder();

  if (isApprove) {
    updatedEmbed
      .setColor(0x10b981)
      .setTitle(`✅ Approved: ${manga?.title || 'Manga'} Ch. ${chapter?.chapterNumber || ''}`)
      .addFields({
        name: '✅ Review Status',
        value: `**Approved** by **${reviewerUser.displayName || interaction.user.username}** (<@${interaction.user.id}>) on <t:${Math.floor(Date.now() / 1000)}:f>`,
        inline: false,
      });
  } else {
    updatedEmbed
      .setColor(0xef4444)
      .setTitle(`🔁 Changes Requested: ${manga?.title || 'Manga'} Ch. ${chapter?.chapterNumber || ''}`)
      .addFields({
        name: '⚠️ Review Status',
        value: `**Changes Requested** by **${reviewerUser.displayName || interaction.user.username}** (<@${interaction.user.id}>) on <t:${Math.floor(Date.now() / 1000)}:f>`,
        inline: false,
      });
  }

  // Rebuild buttons row keeping the link buttons but showing the outcome
  const updatedRow = new ActionRowBuilder<ButtonBuilder>();

  // Extract link buttons (Open Deliverable, View Pipeline)
  const existingComponents = (interaction.message.components[0] as any)?.components || [];
  for (const comp of existingComponents) {
    if (comp.data?.style === ButtonStyle.Link || comp.style === ButtonStyle.Link || comp.url || comp.data?.url) {
      updatedRow.addComponents(ButtonBuilder.from(comp));
    }
  }

  // Add disabled status button
  updatedRow.addComponents(
    new ButtonBuilder()
      .setCustomId(isApprove ? 'cb_status_approved' : 'cb_status_rejected')
      .setLabel(isApprove ? 'Approved' : 'Changes Requested')
      .setStyle(isApprove ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(isApprove ? '✅' : '🔁')
      .setDisabled(true)
  );

  await interaction.update({
    embeds: [updatedEmbed],
    components: [updatedRow],
  });

  // Notify worker via DM and edit their original submission message in place
  await notifyClaimerAndEditSubmissionMessage({
    client: interaction.client,
    assignment,
    manga,
    chapter,
    workType,
    reviewerName: reviewerUser.displayName || interaction.user.username,
    reviewerId: interaction.user.id,
    isApprove,
    comment: isApprove ? undefined : 'Changes requested via Admin review',
    webUrl: process.env.WEB_URL || 'http://localhost:5173',
  });
}

// 11. /approve command
const approveCommand: BotCommand = {
  name: 'approve',
  description: 'Approve a submitted chapter task deliverable and unblock downstream stages',
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve a submitted deliverable for a chapter task directly from Discord')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('series')
        .setDescription('Manga or Manhwa series title')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('chapter')
        .setDescription('Chapter number (e.g. 01, 15, 120.5)')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('task')
        .setDescription('Task name or role code (e.g. Translation / TL, Cleaning / CL)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('comment')
        .setDescription('Optional feedback or approval comment')
        .setRequired(false)
    ),

  autocomplete: async (interaction: AutocompleteInteraction) => {
    try {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'series') {
        const focusedValue = focusedOption.value.toLowerCase();
        const mangas = await MangaModel.find({
          $or: [
            { title: { $regex: focusedValue, $options: 'i' } },
            { altTitles: { $regex: focusedValue, $options: 'i' } },
          ],
        })
          .limit(20)
          .lean();

        await interaction.respond(
          mangas.map((m) => ({
            name: `${m.title} (${m.status})`,
            value: m.title,
          }))
        );
      } else if (focusedOption.name === 'task') {
        const focusedValue = focusedOption.value.toLowerCase();
        const types = await WorkTypeModel.find({
          $or: [
            { name: { $regex: focusedValue, $options: 'i' } },
            { code: { $regex: focusedValue, $options: 'i' } },
          ],
        })
          .limit(15)
          .lean();

        const defaultChoices = [
          { name: 'Translation (TL)', value: 'TL' },
          { name: 'Proofreading (PR)', value: 'PR' },
          { name: 'Cleaning (CL)', value: 'CL' },
          { name: 'Redrawing (RD)', value: 'RD' },
          { name: 'Typesetting (TS)', value: 'TS' },
          { name: 'Quality Check (QC)', value: 'QC' },
        ];

        const mappedDb = types.map((t) => ({
          name: `${t.name} (${t.code})`,
          value: t.code,
        }));

        const combined = [...mappedDb];
        for (const def of defaultChoices) {
          if (!combined.some((c) => c.value.toLowerCase() === def.value.toLowerCase())) {
            combined.push(def);
          }
        }

        const filtered = combined
          .filter(
            (c) =>
              c.name.toLowerCase().includes(focusedValue) ||
              c.value.toLowerCase().includes(focusedValue)
          )
          .slice(0, 25);

        await interaction.respond(filtered);
      }
    } catch {
      await interaction.respond([]);
    }
  },

  execute: async ({ interaction, client, webUrl }: CommandContext) => {
    await interaction.deferReply();

    const isAdmin = await checkIsAdmin(interaction.user.id);
    if (!isAdmin) {
      await interaction.editReply({
        content: '❌ **Permission Denied**: You must be an Administrator or Manager to approve task deliverables.',
      });
      return;
    }

    const seriesTitle = interaction.options.getString('series', true).trim();
    const chapterNum = interaction.options.getString('chapter', true).trim();
    const taskInput = interaction.options.getString('task', true).trim();
    const comment = interaction.options.getString('comment')?.trim();

    const escSeries = escapeRegex(seriesTitle);
    const manga = await MangaModel.findOne({
      $or: [
        { title: { $regex: `^${escSeries}$`, $options: 'i' } },
        { title: { $regex: escSeries, $options: 'i' } },
        { altTitles: { $regex: escSeries, $options: 'i' } },
      ],
    });

    if (!manga) {
      const allManga = await MangaModel.find().select('title').limit(10).lean();
      const availableList = allManga.length > 0
        ? allManga.map((m) => `• \`${m.title}\``).join('\n')
        : 'No series found in database.';
      await interaction.editReply({
        content: `❌ Could not find series **"${seriesTitle}"**.\n\n**Registered Series:**\n${availableList}`,
      });
      return;
    }

    const chapter = await ChapterModel.findOne({
      mangaId: manga._id,
      $or: [
        { chapterNumber: chapterNum },
        { chapterNumber: chapterNum.replace(/^0+/, '') },
        { chapterNumber: chapterNum.padStart(2, '0') },
      ],
    });

    if (!chapter) {
      await interaction.editReply({
        content: `❌ Chapter **${chapterNum}** not found for **${manga.title}**.`,
      });
      return;
    }

    const cleanTask = taskInput.trim().toUpperCase();
    const cleanWord = taskInput.trim().toLowerCase();

    let aliasCode: string | null = null;
    if (['TL', 'TRANSLATION', 'TRANSLATOR'].includes(cleanTask)) aliasCode = 'TL';
    else if (['PR', 'PROOFREAD', 'PROOFREADING', 'PROOFREADER'].includes(cleanTask)) aliasCode = 'PR';
    else if (['CL', 'CLEAN', 'CLEANING', 'CLEANER'].includes(cleanTask)) aliasCode = 'CL';
    else if (['RD', 'REDRAW', 'REDRAWING', 'REDRAWER'].includes(cleanTask)) aliasCode = 'RD';
    else if (['TS', 'TYPESET', 'TYPESETTING', 'TYPESETTER'].includes(cleanTask)) aliasCode = 'TS';
    else if (['QC', 'QUALITY CHECK', 'QUALITY CHECKER', 'QUALITYCHECK'].includes(cleanTask)) aliasCode = 'QC';

    let workType = await WorkTypeModel.findOne({
      organizationId: manga.organizationId,
      $or: [
        ...(aliasCode ? [{ code: aliasCode }] : []),
        { code: cleanTask },
        { name: { $regex: `^${escapeRegex(taskInput)}$`, $options: 'i' } },
        { name: { $regex: escapeRegex(cleanWord), $options: 'i' } },
      ],
    });

    if (!workType) {
      const fallbackDefaults = await ensureWorkTypes(manga.organizationId);
      workType = fallbackDefaults.find((wt) => {
        if (aliasCode && wt.code === aliasCode) return true;
        if (wt.code.toUpperCase() === cleanTask) return true;
        if (wt.name.toLowerCase().includes(cleanWord)) return true;
        return false;
      }) || null;
    }

    if (!workType) {
      await interaction.editReply({
        content: `❌ Could not find work type matching **"${taskInput}"**.`,
      });
      return;
    }

    const assignment = await WorkAssignmentModel.findOne({
      chapterId: chapter._id,
      workTypeId: workType._id,
    });

    if (!assignment) {
      await interaction.editReply({
        content: `❌ No assignment found for **${workType.name}** in Chapter ${chapter.chapterNumber}.`,
      });
      return;
    }

    if (assignment.status === 'COMPLETED') {
      await interaction.editReply({
        content: `ℹ️ **${workType.name}** for Chapter ${chapter.chapterNumber} is already marked as Approved / Completed.`,
      });
      return;
    }

    let reviewerUser = await UserModel.findOne({ discordId: interaction.user.id });
    if (!reviewerUser) {
      const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      reviewerUser = await UserModel.create({
        organizationId: manga.organizationId,
        username: cleanName,
        displayName: interaction.user.globalName || interaction.user.username,
        discordId: interaction.user.id,
        discordUsername: interaction.user.tag || interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL(),
        role: 'Administrator',
        isApproved: true,
        approvedBy: 'Discord Admin',
        approvedAt: new Date(),
        availability: 'Available',
        workload: 'Normal',
      });
    }

    // Ensure active claim exists if needed
    if (!assignment.activeClaimId) {
      const claim = await ClaimModel.findOne({ assignmentId: assignment._id }).sort({ createdAt: -1 });
      if (claim) {
        assignment.activeClaimId = claim._id;
        await assignment.save();
      } else {
        const newClaim = await ClaimModel.create({
          organizationId: assignment.organizationId,
          assignmentId: assignment._id,
          workerId: assignment.assignedWorkerId || reviewerUser._id,
          workerName: assignment.assignedWorkerName || 'Worker',
          status: 'SUBMITTED',
          claimedAt: new Date(),
          deadline: assignment.deadline,
          revisions: [
            {
              revisionNumber: 1,
              deliverableUrl: 'Approved via /approve command',
              submittedAt: new Date(),
              submittedById: assignment.assignedWorkerId || reviewerUser._id,
              submittedByName: assignment.assignedWorkerName || 'Worker',
            } as any,
          ],
        });
        assignment.activeClaimId = newClaim._id;
        await assignment.save();
      }
    }

    await ProductionService.reviewWork({
      organizationId: manga.organizationId.toString(),
      assignmentId: assignment._id.toString(),
      reviewerId: reviewerUser._id.toString(),
      reviewerName: reviewerUser.displayName || interaction.user.username,
      status: 'Approved',
      comment: comment || 'Approved via /approve command',
    });

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ Task Approved Successfully')
      .setDescription(
        `**${workType.name}** for **${manga.title} — Chapter ${chapter.chapterNumber}** has been approved!`
      )
      .addFields(
        { name: '📖 Series', value: manga.title, inline: true },
        { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
        { name: '🎯 Task', value: `${workType.name} (\`${workType.code}\`)`, inline: true },
        { name: '👤 Worker', value: assignment.assignedWorkerName ? `**${assignment.assignedWorkerName}**` : 'Unassigned', inline: true },
        { name: '👑 Approved By', value: `<@${interaction.user.id}>`, inline: true },
        { name: '💬 Comment', value: comment ? `>>> ${comment}` : '*Approved without comment*', inline: false },
        { name: '📋 Canvas View', value: `[Open Pipeline Canvas](${webUrl}/pipeline/${manga._id}/${chapter._id})`, inline: false }
      )
      .setFooter({ text: 'ClaimBoard • Downstream stages unblocked' })
      .setTimestamp();

    if (manga.coverUrl) {
      embed.setThumbnail(manga.coverUrl);
    }

    await interaction.editReply({ embeds: [embed] });

    // Notify worker via DM and edit their original submission message in place
    await notifyClaimerAndEditSubmissionMessage({
      client,
      assignment,
      manga,
      chapter,
      workType,
      reviewerName: reviewerUser.displayName || interaction.user.username,
      reviewerId: interaction.user.id,
      isApprove: true,
      comment,
      webUrl,
    });
  },

  handleButton: async (interaction: ButtonInteraction) => {
    await handleTaskReviewButton(interaction);
  },
};

export const claimboardModule: BotModule = {
  id: 'claimboard',
  name: 'ClaimBoard Production Module',
  description: 'Discord-first work management, claiming, task tracking, and pipeline progression for scanlation teams',
  version: '1.2.0',
  enabled: true,
  commands: [
    assignCommand,
    setroleCommand,
    claimCommand,
    unclaimCommand,
    myclaimsCommand,
    seeclaimsCommand,
    boardCommand,
    progressCommand,
    submitCommand,
    approveCommand,
  ],
  onLoad: () => {
    console.log('[ClaimBoardModule] ClaimBoard production module loaded with interactive /assign, /setrole, /submit, and /approve commands.');
  },
};
