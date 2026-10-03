import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
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
  ProductionService,
} from '@claimboard/database';
import { checkIsAdmin } from '../admin';

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

// 8. /manga command
const mangaCommand: BotCommand = {
  name: 'manga',
  description: 'View manga production details and stats',
  data: new SlashCommandBuilder()
    .setName('manga')
    .setDescription('View manga production details and stats')
    .setDMPermission(true)
    .addStringOption((opt) => opt.setName('title').setDescription('Manga title (optional)')),
  execute: async ({ interaction, webUrl }: CommandContext) => {
    const titleOpt = interaction.options.getString('title');
    const manga = titleOpt
      ? await MangaModel.findOne({ title: new RegExp(titleOpt, 'i') })
      : await MangaModel.findOne();

    if (!manga) {
      await interaction.reply({ content: 'No matching manga series found in database.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(manga.title)
      .setDescription(manga.description || 'No description provided.')
      .addFields(
        { name: 'Status', value: manga.status, inline: true },
        { name: 'Total Chapters', value: `${manga.totalChapters || 0}`, inline: true },
        { name: 'Tagged Role', value: manga.discordRoleId ? `<@&${manga.discordRoleId}>` : 'None', inline: true }
      );

    if (manga.coverUrl) {
      embed.setThumbnail(manga.coverUrl);
    }

    embed.addFields({
      name: 'Catalog Link',
      value: `[Open Series in Web App](${webUrl}/manga/${manga._id})`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};

// 9. /progress command
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

export const claimboardModule: BotModule = {
  id: 'claimboard',
  name: 'ClaimBoard Production Module',
  description: 'Discord-first work management, claiming, task tracking, and pipeline progression for scanlation teams',
  version: '1.1.0',
  enabled: true,
  commands: [
    assignCommand,
    setroleCommand,
    claimCommand,
    unclaimCommand,
    myclaimsCommand,
    seeclaimsCommand,
    boardCommand,
    mangaCommand,
    progressCommand,
  ],
  onLoad: () => {
    console.log('[ClaimBoardModule] ClaimBoard production module loaded with interactive /assign and /setrole commands.');
  },
};
