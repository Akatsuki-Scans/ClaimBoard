import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import {
  MangaModel,
  ChapterModel,
  WorkTypeModel,
  WorkAssignmentModel,
  UserModel,
  ProductionService,
} from '@claimboard/database';
import { BotCommand, CommandContext } from '../../core/types';
import { checkIsAdmin } from '../admin';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function isValidTimeZone(tz?: string | null): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve friendly timezone shorthand or IANA name into a valid IANA timezone.
 */
export function normalizeTimeZone(input: string): string | null {
  const trimmed = input.trim();
  if (isValidTimeZone(trimmed)) return trimmed;

  const aliases: Record<string, string> = {
    bdt: 'Asia/Dhaka',
    ist: 'Asia/Kolkata',
    jst: 'Asia/Tokyo',
    kst: 'Asia/Seoul',
    pht: 'Asia/Manila',
    sgt: 'Asia/Singapore',
    wib: 'Asia/Jakarta',
    gmt: 'UTC',
    est: 'America/New_York',
    edt: 'America/New_York',
    cst: 'America/Chicago',
    mst: 'America/Denver',
    pst: 'America/Los_Angeles',
    pdt: 'America/Los_Angeles',
    cet: 'Europe/Paris',
    bst: 'Europe/London',
  };
  const lower = trimmed.toLowerCase();
  if (aliases[lower]) return aliases[lower];

  // UTC+6 / GMT-5 -> Etc/GMT-6 / Etc/GMT+5 (note POSIX Etc/GMT sign inversion!)
  const offsetMatch = trimmed.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::00)?$/i);
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? '-' : '+';
    const hours = parseInt(offsetMatch[2], 10);
    if (hours >= 0 && hours <= 12) {
      const candidate = hours === 0 ? 'UTC' : `Etc/GMT${sign}${hours}`;
      if (isValidTimeZone(candidate)) return candidate;
    }
  }

  // Case-insensitive match against common timezones
  const matched = COMMON_TIMEZONES.find((z) => z.toLowerCase() === lower || z.toLowerCase().includes(lower));
  return matched || null;
}

export async function getUserTimeZone(discordId: string): Promise<{ timeZone: string; isConfigured: boolean }> {
  const user = await UserModel.findOne({ discordId }).select('timezone').lean();
  if (user?.timezone && isValidTimeZone(user.timezone)) {
    return { timeZone: user.timezone, isConfigured: true };
  }
  return { timeZone: 'UTC', isConfigured: false };
}

/**
 * Extract wall-clock parts of a UTC Date in a specific IANA timezone.
 */
export function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  const year = get('year');
  const month = get('month'); // 1-12
  const day = get('day');
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  return { year, month, monthIdx: month - 1, day, hour, minute, second };
}

/**
 * Convert a wall-clock date/time in an arbitrary IANA timezone to a UTC Date.
 */
export function zonedWallClockToUtc(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guessUtcMs = Date.UTC(year, month1to12 - 1, day, hour, minute, second, 0);

  const calcOffsetMs = (utcMs: number) => {
    const p = getZonedParts(new Date(utcMs), timeZone);
    const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    return asUtcMs - utcMs;
  };

  const firstPassMs = guessUtcMs - calcOffsetMs(guessUtcMs);
  // Second pass ensures exact accuracy across DST boundaries
  const secondPassMs = guessUtcMs - calcOffsetMs(firstPassMs);
  return new Date(secondPassMs);
}

/**
 * Format short timezone offset label e.g. "GMT+6" or "EST"
 */
export function getTimeZoneShortLabel(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * Parse natural deadlines like "48h", "3d", "1w", "tomorrow", "2026-11-20", "Nov 20 18:00"
 * strictly in the caller's timezone.
 */
export function parseDeadlineInput(rawInput: string, timeZone: string = 'UTC'): Date | null {
  const input = rawInput.trim().toLowerCase();
  if (!input) return null;

  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const now = new Date();
  const nowZoned = getZonedParts(now, tz);

  // Relative hours/days/weeks: e.g. 24h, 3d, 2w
  const relMatch = input.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)$/i);
  if (relMatch) {
    const val = parseFloat(relMatch[1]);
    const unit = relMatch[2].charAt(0).toLowerCase();
    const msPerUnit =
      unit === 'h'
        ? 3600 * 1000
        : unit === 'd'
        ? 24 * 3600 * 1000
        : 7 * 24 * 3600 * 1000;
    return new Date(now.getTime() + val * msPerUnit);
  }

  if (input === 'today' || input === 'tonight') {
    return zonedWallClockToUtc(nowZoned.year, nowZoned.month, nowZoned.day, 23, 59, 0, tz);
  }
  if (input === 'tomorrow') {
    const d = new Date(Date.UTC(nowZoned.year, nowZoned.month - 1, nowZoned.day + 1));
    return zonedWallClockToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59, 0, tz);
  }
  if (input === 'next week') {
    const d = new Date(Date.UTC(nowZoned.year, nowZoned.month - 1, nowZoned.day + 7));
    return zonedWallClockToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59, 0, tz);
  }

  // YYYY-MM-DD HH:mm
  const isoDateTimeMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s]+(\d{1,2}):(\d{2}))?$/);
  if (isoDateTimeMatch) {
    const y = Number(isoDateTimeMatch[1]);
    const m = Number(isoDateTimeMatch[2]);
    const d = Number(isoDateTimeMatch[3]);
    const hh = isoDateTimeMatch[4] !== undefined ? Number(isoDateTimeMatch[4]) : 23;
    const mm = isoDateTimeMatch[5] !== undefined ? Number(isoDateTimeMatch[5]) : 59;
    return zonedWallClockToUtc(y, m, d, hh, mm, 0, tz);
  }

  // Fallback parse (e.g. "Nov 20", "Nov 20 2026 18:00") interpreted in caller's tz
  const cleaned = rawInput.trim();
  const naive = new Date(cleaned);
  if (!isNaN(naive.getTime())) {
    const hasExplicitTz = /([zZ]|[+-]\d{2}:?\d{2}|GMT|UTC)$/.test(cleaned);
    if (hasExplicitTz) return naive;

    const hasExplicitYear = /\b\d{4}\b/.test(cleaned);
    const year = hasExplicitYear ? naive.getFullYear() : nowZoned.year;
    const hh = cleaned.includes(':') ? naive.getHours() : 23;
    const mm = cleaned.includes(':') ? naive.getMinutes() : 59;
    return zonedWallClockToUtc(year, naive.getMonth() + 1, naive.getDate(), hh, mm, 0, tz);
  }

  return null;
}

async function resolveMangaByTitle(seriesTitle: string) {
  const esc = escapeRegex(seriesTitle.trim());
  return MangaModel.findOne({
    $or: [
      { title: { $regex: `^${esc}$`, $options: 'i' } },
      { title: { $regex: esc, $options: 'i' } },
      { altTitles: { $regex: esc, $options: 'i' } },
    ],
  });
}

async function resolveWorkType(organizationId: any, taskInput: string) {
  const cleanTask = taskInput.trim().toUpperCase();
  const cleanWord = taskInput.trim().toLowerCase();

  let aliasCode: string | null = null;
  if (['TL', 'TRANSLATION', 'TRANSLATOR'].includes(cleanTask)) aliasCode = 'TL';
  else if (['PR', 'PROOFREAD', 'PROOFREADING', 'PROOFREADER'].includes(cleanTask)) aliasCode = 'PR';
  else if (['CL', 'CLEAN', 'CLEANING', 'CLEANER'].includes(cleanTask)) aliasCode = 'CL';
  else if (['RD', 'REDRAW', 'REDRAWING', 'REDRAWER'].includes(cleanTask)) aliasCode = 'RD';
  else if (['TS', 'TYPESET', 'TYPESETTING', 'TYPESETTER'].includes(cleanTask)) aliasCode = 'TS';
  else if (['QC', 'QUALITY CHECK', 'QUALITY CHECKER', 'QUALITYCHECK'].includes(cleanTask)) aliasCode = 'QC';

  return WorkTypeModel.findOne({
    organizationId,
    $or: [
      ...(aliasCode ? [{ code: aliasCode }] : []),
      { code: cleanTask },
      { name: { $regex: `^${escapeRegex(taskInput.trim())}$`, $options: 'i' } },
      { name: { $regex: escapeRegex(cleanWord), $options: 'i' } },
    ],
  });
}

async function sharedSeriesTaskAutocomplete(interaction: AutocompleteInteraction) {
  try {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'series') {
      const q = focused.value.toLowerCase();
      const mangas = await MangaModel.find({
        $or: [
          { title: { $regex: escapeRegex(q), $options: 'i' } },
          { altTitles: { $regex: escapeRegex(q), $options: 'i' } },
        ],
      })
        .limit(20)
        .lean();

      await interaction.respond(
        mangas.map((m) => ({
          name: `${m.title} (${m.status})`.slice(0, 100),
          value: m.title.slice(0, 100),
        }))
      );
      return;
    }

    if (focused.name === 'task') {
      const q = focused.value.toLowerCase();
      const types = await WorkTypeModel.find().limit(20).lean();
      const choices: Array<{ name: string; value: string }> = [
        { name: 'ALL Task Roles (All Work Types)', value: 'ALL' },
        { name: 'Chapter Release Target (CHAPTER)', value: 'CHAPTER' },
        { name: 'ALL Task Roles + Chapter Target', value: 'ALL,CHAPTER' },
      ];
      for (const wt of types) {
        choices.push({ name: `${wt.name} (${wt.code})`, value: wt.code });
      }
      const defaults = [
        { name: 'Translation (TL)', value: 'TL' },
        { name: 'Proofreading (PR)', value: 'PR' },
        { name: 'Cleaning (CL)', value: 'CL' },
        { name: 'Redrawing (RD)', value: 'RD' },
        { name: 'Typesetting (TS)', value: 'TS' },
        { name: 'Quality Check (QC)', value: 'QC' },
      ];
      for (const d of defaults) {
        if (!choices.some((c) => c.value === d.value)) choices.push(d);
      }

      await interaction.respond(
        choices
          .filter((c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q))
          .slice(0, 25)
      );
      return;
    }

    if (focused.name === 'zone') {
      const q = focused.value.toLowerCase();
      const filtered = COMMON_TIMEZONES.filter((z) => z.toLowerCase().includes(q)).slice(0, 25);
      await interaction.respond(
        filtered.map((z) => ({
          name: `${z} (${getTimeZoneShortLabel(new Date(), z)})`,
          value: z,
        }))
      );
    }
  } catch {
    await interaction.respond([]);
  }
}

// =============================================================
// 1. /deadline Command
// =============================================================
export const deadlineCommand: BotCommand = {
  name: 'deadline',
  description: 'Set, clear, or inspect task and chapter deadlines in your timezone',
  data: new SlashCommandBuilder()
    .setName('deadline')
    .setDescription('Set, clear, or inspect production deadlines in your local timezone')
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set or reschedule a deadline for a task or chapter')
        .addStringOption((opt) =>
          opt.setName('series').setDescription('Manga series title').setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt.setName('chapter').setDescription('Chapter number (e.g. 42 or 1150)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('due')
            .setDescription('Due date or duration in your timezone (e.g. 2026-11-20, 48h, 3d, tomorrow)')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('task')
            .setDescription('Role(s): ALL, TL, CL,TS,PR, or CHAPTER (defaults to ALL roles)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Clear the deadline on task role(s) or chapter')
        .addStringOption((opt) =>
          opt.setName('series').setDescription('Manga series title').setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt.setName('chapter').setDescription('Chapter number').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('task')
            .setDescription('Role(s): ALL, TL,CL,TS, or CHAPTER (defaults to ALL roles)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View upcoming and overdue deadlines')
        .addStringOption((opt) =>
          opt.setName('series').setDescription('Filter by manga series').setRequired(false).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('roles')
            .setDescription('Filter by role(s) comma-separated (e.g. TL,TS) or ALL')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('filter')
            .setDescription('Filter view')
            .setRequired(false)
            .addChoices(
              { name: 'All Upcoming & Overdue', value: 'all' },
              { name: 'Overdue Only', value: 'overdue' },
              { name: 'Due Within 24h', value: 'due_soon' },
              { name: 'My Deadlines', value: 'mine' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('timezone')
        .setDescription('Set your personal timezone for /deadline and /calendar commands')
        .addStringOption((opt) =>
          opt
            .setName('zone')
            .setDescription('Your timezone (e.g. Asia/Dhaka, America/New_York, UTC+6, Europe/London)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  autocomplete: sharedSeriesTaskAutocomplete,

  execute: async ({ interaction, webUrl }: CommandContext) => {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'timezone') {
      const zoneInput = interaction.options.getString('zone', true);
      const resolvedTz = normalizeTimeZone(zoneInput);
      if (!resolvedTz) {
        await interaction.reply({
          content:
            `❌ Invalid timezone **"${zoneInput}"**.\nExamples: \`Asia/Dhaka\`, \`America/New_York\`, \`Europe/London\`, \`Asia/Tokyo\`, \`UTC+6\`, \`UTC-5\`.`,
          ephemeral: true,
        });
        return;
      }

      const dbUser = await UserModel.findOne({ discordId: interaction.user.id });
      if (!dbUser) {
        await interaction.reply({
          content: `❌ No ClaimBoard profile is linked to your Discord yet. Log into the [ClaimBoard Web App](${webUrl}) once (which also auto-syncs your browser timezone!), then try again.`,
          ephemeral: true,
        });
        return;
      }

      dbUser.timezone = resolvedTz;
      await dbUser.save();

      const now = new Date();
      const localNow = new Intl.DateTimeFormat('en-US', {
        timeZone: resolvedTz,
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZoneName: 'short',
      }).format(now);

      const embed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('🌍 Timezone Updated')
        .setDescription(
          `Your personal timezone is now set to **\`${resolvedTz}\`**.\nAll \`/deadline set\` dates and \`/calendar\` day views will render from your timezone perspective.`
        )
        .addFields({ name: 'Current Time in Your Zone', value: localNow, inline: false })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'set' || sub === 'clear') {
      const isAdmin = await checkIsAdmin(interaction.user.id, interaction.memberPermissions);
      if (!isAdmin) {
        await interaction.reply({
          content: '❌ **Permission Denied**: Only administrators and managers can modify deadlines.',
          ephemeral: true,
        });
        return;
      }

      const { timeZone, isConfigured } = await getUserTimeZone(interaction.user.id);
      const seriesTitle = interaction.options.getString('series', true);
      const chapterNum = interaction.options.getString('chapter', true).trim();
      const taskInput = (interaction.options.getString('task') || 'ALL').trim();

      let parsedDeadline: Date | null = null;
      if (sub === 'set') {
        const dueRaw = interaction.options.getString('due', true);
        parsedDeadline = parseDeadlineInput(dueRaw, timeZone);
        if (!parsedDeadline) {
          await interaction.reply({
            content:
              '❌ Could not understand that deadline format.\nExamples: `48h`, `3d`, `1w`, `tomorrow`, `2026-11-20`, or `2026-11-20 18:00`.',
            ephemeral: true,
          });
          return;
        }
      }

      const manga = await resolveMangaByTitle(seriesTitle);
      if (!manga) {
        await interaction.reply({
          content: `❌ Series **"${seriesTitle}"** not found.`,
          ephemeral: true,
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
        await interaction.reply({
          content: `❌ Chapter **${chapterNum}** not found for **${manga.title}**.`,
          ephemeral: true,
        });
        return;
      }

      const actorUser = await UserModel.findOne({ discordId: interaction.user.id });
      const actorId = actorUser?._id?.toString() || manga.organizationId.toString();
      const actorName = actorUser?.displayName || interaction.user.globalName || interaction.user.username;

      const tokens = Array.from(
        new Set(
          taskInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        )
      );
      const upperTokens = tokens.map((t) => t.toUpperCase());
      const includeAllRoles = upperTokens.includes('ALL');
      const includeChapter = upperTokens.includes('CHAPTER');
      const unix = parsedDeadline ? Math.floor(parsedDeadline.getTime() / 1000) : null;

      // Single-target CHAPTER fast path preserves specialized chapter embed
      if (includeChapter && !includeAllRoles && tokens.length === 1) {
        await ProductionService.updateChapterDeadline({
          organizationId: manga.organizationId.toString(),
          chapterId: chapter._id.toString(),
          deadline: parsedDeadline,
          actorId,
          actorName,
        });

        const embed = new EmbedBuilder()
          .setColor(parsedDeadline ? 0x6366f1 : 0x64748b)
          .setTitle(parsedDeadline ? '📅 Chapter Deadline Set' : '🗑️ Chapter Deadline Cleared')
          .setDescription(
            parsedDeadline
              ? `Target deadline for **${manga.title} — Chapter ${chapter.chapterNumber}** has been scheduled.`
              : `Target deadline for **${manga.title} — Chapter ${chapter.chapterNumber}** was cleared.`
          )
          .addFields(
            { name: '📖 Manga', value: manga.title, inline: true },
            { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
            { name: '🌍 Parsed In', value: `\`${timeZone}\``, inline: true },
            {
              name: '⏰ Due Date (shown in each user’s local time)',
              value: unix ? `<t:${unix}:F> (<t:${unix}:R>)` : '*None*',
              inline: false,
            },
            { name: '🗓️ Calendar', value: `[Open Web Calendar](${webUrl}/calendar)`, inline: false }
          )
          .setFooter({
            text: isConfigured
              ? `Parsed in ${timeZone} • Each viewer sees their own local Discord time`
              : 'Parsed in UTC (run /deadline timezone to set your local zone)',
          })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }

      const updatedLabels: string[] = [];

      if (includeChapter) {
        await ProductionService.updateChapterDeadline({
          organizationId: manga.organizationId.toString(),
          chapterId: chapter._id.toString(),
          deadline: parsedDeadline,
          actorId,
          actorName,
        });
        updatedLabels.push('Chapter Target (`CHAPTER`)');
      }

      let assignmentsToUpdate: Array<{ assignment: any; workType: any }> = [];

      if (includeAllRoles) {
        const chapterAssignments: any[] = await WorkAssignmentModel.find({
          chapterId: chapter._id,
        })
          .populate('workTypeId', 'name code')
          .lean();
        assignmentsToUpdate = chapterAssignments.map((a) => ({
          assignment: a,
          workType: a.workTypeId || { name: 'Task', code: 'TSK' },
        }));
      } else {
        const roleTokens = tokens.filter((t) => t.toUpperCase() !== 'CHAPTER');
        for (const token of roleTokens) {
          const workType = await resolveWorkType(manga.organizationId, token);
          if (!workType) {
            await interaction.reply({
              content: `❌ Could not find task type **"${token}"**. Use ` + '`ALL`, `TL`, `PR`, `CL`, `RD`, `TS`, `QC`, or `CHAPTER`.',
              ephemeral: true,
            });
            return;
          }

          const assignment = await WorkAssignmentModel.findOne({
            chapterId: chapter._id,
            workTypeId: workType._id,
          });
          if (!assignment) {
            await interaction.reply({
              content: `❌ No assignment found for **${workType.name}** in **${manga.title} Ch. ${chapter.chapterNumber}**.`,
              ephemeral: true,
            });
            return;
          }
          assignmentsToUpdate.push({ assignment, workType });
        }
      }

      if (assignmentsToUpdate.length === 0 && !includeChapter) {
        await interaction.reply({
          content: `❌ No task slots found on **${manga.title} Ch. ${chapter.chapterNumber}**. Specify \`CHAPTER\` or create task slots first.`,
          ephemeral: true,
        });
        return;
      }

      for (const { assignment, workType } of assignmentsToUpdate) {
        await ProductionService.updateAssignmentDeadline({
          organizationId: manga.organizationId.toString(),
          assignmentId: assignment._id.toString(),
          deadline: parsedDeadline,
          actorId,
          actorName,
        });
        updatedLabels.push(
          `${workType.name} (\`${workType.code}\`) — *${assignment.assignedWorkerName || 'Open Slot'}*`
        );

        if (assignment.assignedWorkerId && parsedDeadline && unix) {
          const worker = await UserModel.findById(assignment.assignedWorkerId).lean();
          if (worker?.discordId) {
            const discordWorker = await interaction.client.users.fetch(worker.discordId).catch(() => null);
            if (discordWorker) {
              const dmEmbed = new EmbedBuilder()
                .setColor(0xf59e0b)
                .setTitle('⏰ Task Deadline Updated')
                .setDescription(
                  `**${actorName}** set the deadline for your **${workType.name}** task on **${manga.title} — Chapter ${chapter.chapterNumber}**.`
                )
                .addFields(
                  { name: '⏰ New Deadline (Your Local Time)', value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
                  { name: '🗓️ Schedule', value: `[View Calendar](${webUrl}/calendar)`, inline: false }
                )
                .setTimestamp();
              await discordWorker.send({ embeds: [dmEmbed] }).catch(() => null);
            }
          }
        }
      }

      const embed = new EmbedBuilder()
        .setColor(parsedDeadline ? 0x6366f1 : 0x64748b)
        .setTitle(
          parsedDeadline
            ? updatedLabels.length > 1
              ? `📅 ${updatedLabels.length} Deadlines Updated`
              : '⏰ Task Deadline Set'
            : '🗑️ Deadlines Cleared'
        )
        .setDescription(
          `Updated deadlines on **${manga.title} — Chapter ${chapter.chapterNumber}**.`
        )
        .addFields(
          { name: '📖 Manga', value: manga.title, inline: true },
          { name: '📑 Chapter', value: `Chapter ${chapter.chapterNumber}`, inline: true },
          { name: '🌍 Parsed In', value: `\`${timeZone}\``, inline: true },
          {
            name: '🎯 Roles / Targets Updated',
            value: updatedLabels.map((l) => `• ${l}`).join('\n').slice(0, 1024),
            inline: false,
          },
          {
            name: '⏰ Due Date (shown in each user’s local time)',
            value: unix ? `<t:${unix}:F> (<t:${unix}:R>)` : '*None*',
            inline: false,
          },
          { name: '🗓️ Calendar', value: `[Open Web Calendar](${webUrl}/calendar)`, inline: false }
        )
        .setFooter({
          text: isConfigured
            ? `Parsed in ${timeZone}`
            : 'Parsed in UTC (run /deadline timezone to set your local zone)',
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // SUBCOMMAND: list
    const seriesFilter = interaction.options.getString('series');
    const rolesFilterRaw = interaction.options.getString('roles')?.trim();
    const filterType = interaction.options.getString('filter') || 'all';
    const now = new Date();

    const query: any = {
      status: { $nin: ['COMPLETED', 'APPROVED', 'CANCELLED'] },
      deadline: { $exists: true, $ne: null },
    };

    if (rolesFilterRaw && rolesFilterRaw.toUpperCase() !== 'ALL') {
      const codes = rolesFilterRaw.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (codes.length > 0) {
        const matchedTypes = await WorkTypeModel.find({ code: { $in: codes } }).select('_id').lean();
        query.workTypeId = { $in: matchedTypes.map((wt: any) => wt._id) };
      }
    }

    if (seriesFilter) {
      const m = await resolveMangaByTitle(seriesFilter);
      if (!m) {
        await interaction.reply({ content: `❌ Series **"${seriesFilter}"** not found.`, ephemeral: true });
        return;
      }
      query.mangaId = m._id;
    }

    if (filterType === 'overdue') {
      query.deadline = { $lt: now };
    } else if (filterType === 'due_soon') {
      query.deadline = { $gte: now, $lte: new Date(now.getTime() + 24 * 3600 * 1000) };
    } else if (filterType === 'mine') {
      const dbUser = await UserModel.findOne({ discordId: interaction.user.id });
      if (!dbUser) {
        await interaction.reply({
          content: 'ℹ️ No ClaimBoard account linked to your Discord yet.',
          ephemeral: true,
        });
        return;
      }
      query.assignedWorkerId = dbUser._id;
    }

    const assignments: any[] = await WorkAssignmentModel.find(query)
      .populate('mangaId', 'title')
      .populate('chapterId', 'chapterNumber')
      .populate('workTypeId', 'name code')
      .sort({ deadline: 1 })
      .limit(15)
      .lean();

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`⏰ Active Deadlines${seriesFilter ? ` — ${seriesFilter}` : ''}`)
      .setDescription(
        assignments.length === 0
          ? 'All caught up! No active deadlines match this filter.'
          : assignments
              .map((a) => {
                const due = new Date(a.deadline);
                const diffMs = due.getTime() - now.getTime();
                const dot = diffMs < 0 ? '🔴' : diffMs <= 24 * 3600 * 1000 ? '🟡' : '🔵';
                const unix = Math.floor(due.getTime() / 1000);
                const worker = a.assignedWorkerName || 'Open';
                return `${dot} **${a.mangaId?.title || 'Manga'} Ch. ${a.chapterId?.chapterNumber || '?'}** \`${
                  a.workTypeId?.code || 'TSK'
                }\` — *${worker}* • <t:${unix}:R> (<t:${unix}:f>)`;
              })
              .join('\n')
      )
      .setFooter({ text: 'Discord timestamps adjust automatically to your local timezone • Use /calendar for month grid' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Open Web Calendar')
        .setURL(`${webUrl}/calendar`)
        .setEmoji('🗓️')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: filterType === 'mine',
    });
  },
};

// =============================================================
// 2. /calendar Command with Per-User Timezone Calendar Grid
// =============================================================
function renderAsciiMonthGrid(
  year: number,
  monthIdx: number,
  markedDays: Map<number, 'overdue' | 'soon' | 'normal' | 'done'>,
  userTimeZone: string
): string {
  const firstDayWeekday = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const startOffset = (firstDayWeekday + 6) % 7;

  const nowZoned = getZonedParts(new Date(), userTimeZone);
  const isCurrentMonth = nowZoned.year === year && nowZoned.monthIdx === monthIdx;
  const todayDate = nowZoned.day;

  const lines: string[] = ['Mon  Tue  Wed  Thu  Fri  Sat  Sun'];
  let currentLine = '     '.repeat(startOffset);

  for (let d = 1; d <= daysInMonth; d++) {
    const marker = markedDays.get(d);
    const numStr = d < 10 ? `0${d}` : `${d}`;
    let cell = ` ${numStr}  `;
    if (marker === 'overdue') {
      cell = `!${numStr}* `;
    } else if (marker === 'soon') {
      cell = `[${numStr}] `;
    } else if (marker === 'normal') {
      cell = `•${numStr}  `;
    } else if (marker === 'done') {
      cell = `✓${numStr}  `;
    } else if (isCurrentMonth && d === todayDate) {
      cell = `>${numStr}< `;
    }

    currentLine += cell;
    if ((startOffset + d) % 7 === 0 || d === daysInMonth) {
      lines.push(currentLine.trimEnd());
      currentLine = '';
    }
  }

  return '```\n' + lines.join('\n') + '\n```';
}

async function buildCalendarPayload(params: {
  year: number;
  monthIdx: number; // 0-11
  mineOnly: boolean;
  mangaId?: string | null;
  discordUserId: string;
  webUrl: string;
}) {
  const { year, monthIdx, mineOnly, mangaId, discordUserId, webUrl } = params;
  const { timeZone: userTz, isConfigured } = await getUserTimeZone(discordUserId);

  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const startOfMonth = zonedWallClockToUtc(year, monthIdx + 1, 1, 0, 0, 0, userTz);
  const endOfMonth = zonedWallClockToUtc(year, monthIdx + 1, daysInMonth, 23, 59, 59, userTz);

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIdx, 15)));

  const now = new Date();

  let dbUserId: any = null;
  if (mineOnly) {
    const u = await UserModel.findOne({ discordId: discordUserId }).lean();
    dbUserId = u?._id || 'none';
  }

  const assignQuery: any = {
    deadline: { $gte: startOfMonth, $lte: endOfMonth },
  };
  if (mangaId && mangaId !== 'all') assignQuery.mangaId = mangaId;
  if (mineOnly) assignQuery.assignedWorkerId = dbUserId === 'none' ? null : dbUserId;

  const assignments: any[] =
    mineOnly && dbUserId === 'none'
      ? []
      : await WorkAssignmentModel.find(assignQuery)
          .populate('mangaId', 'title')
          .populate('chapterId', 'chapterNumber')
          .populate('workTypeId', 'code name')
          .sort({ deadline: 1 })
          .lean();

  const chapterQuery: any = {
    deadline: { $gte: startOfMonth, $lte: endOfMonth },
  };
  if (mangaId && mangaId !== 'all') chapterQuery.mangaId = mangaId;

  const chapters: any[] = mineOnly
    ? []
    : await ChapterModel.find(chapterQuery).populate('mangaId', 'title').sort({ deadline: 1 }).lean();

  const allEntries: Array<{
    date: Date;
    label: string;
    worker: string;
    state: 'overdue' | 'soon' | 'normal' | 'done';
  }> = [];

  for (const a of assignments) {
    const due = new Date(a.deadline);
    const isDone = a.status === 'COMPLETED' || a.status === 'APPROVED';
    const diffMs = due.getTime() - now.getTime();
    const state: 'overdue' | 'soon' | 'normal' | 'done' = isDone
      ? 'done'
      : diffMs < 0
      ? 'overdue'
      : diffMs <= 24 * 3600 * 1000
      ? 'soon'
      : 'normal';

    allEntries.push({
      date: due,
      label: `${a.mangaId?.title || 'Manga'} Ch.${a.chapterId?.chapterNumber || '?'} (\`${
        a.workTypeId?.code || 'TSK'
      }\`)`,
      worker: a.assignedWorkerName || 'Open',
      state,
    });
  }

  for (const ch of chapters) {
    const due = new Date(ch.deadline);
    const isDone = ch.status === 'Completed' || ch.status === 'Published';
    const diffMs = due.getTime() - now.getTime();
    const state: 'overdue' | 'soon' | 'normal' | 'done' = isDone
      ? 'done'
      : diffMs < 0
      ? 'overdue'
      : diffMs <= 24 * 3600 * 1000
      ? 'soon'
      : 'normal';

    allEntries.push({
      date: due,
      label: `${ch.mangaId?.title || 'Manga'} Ch.${ch.chapterNumber} (**Chapter Target**)`,
      worker: 'Release Target',
      state,
    });
  }

  allEntries.sort((a, b) => a.date.getTime() - b.date.getTime());

  const markedDays = new Map<number, 'overdue' | 'soon' | 'normal' | 'done'>();
  const priorityRank = { overdue: 4, soon: 3, normal: 2, done: 1 };
  for (const entry of allEntries) {
    const zonedDay = getZonedParts(entry.date, userTz).day;
    const prev = markedDays.get(zonedDay);
    if (!prev || priorityRank[entry.state] > priorityRank[prev]) {
      markedDays.set(zonedDay, entry.state);
    }
  }

  const grid = renderAsciiMonthGrid(year, monthIdx, markedDays, userTz);
  const tzBadge = `${userTz} (${getTimeZoneShortLabel(now, userTz)})`;
  const legend = '`!DD*` Overdue • `[DD]` Due ≤24h • `•DD` Scheduled • `✓DD` Done';

  const agendaLines =
    allEntries.length === 0
      ? '*No deadlines scheduled for this month.*'
      : allEntries
          .slice(0, 12)
          .map((e) => {
            const icon =
              e.state === 'overdue' ? '🔴' : e.state === 'soon' ? '🟡' : e.state === 'done' ? '🟢' : '🔵';
            const unix = Math.floor(e.date.getTime() / 1000);
            return `${icon} <t:${unix}:f> — ${e.label} (${e.worker})`;
          })
          .join('\n') + (allEntries.length > 12 ? `\n*...and ${allEntries.length - 12} more on Web Calendar*` : '');

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`🗓️ Production Calendar — ${monthLabel}${mineOnly ? ' (My Deadlines)' : ''}`)
    .setDescription(`${grid}\n${legend}\n🌍 **Perspective:** \`${tzBadge}\``)
    .addFields({
      name: `Schedule (${allEntries.length} item${allEntries.length === 1 ? '' : 's'})`,
      value: agendaLines.slice(0, 1020),
      inline: false,
    })
    .setFooter({
      text: isConfigured
        ? `Calendar perspective: ${userTz} • Use /deadline timezone to switch`
        : 'Calendar perspective: UTC • Set your zone with /deadline timezone',
    })
    .setTimestamp();

  const prevDate = new Date(Date.UTC(year, monthIdx - 1, 15));
  const nextDate = new Date(Date.UTC(year, monthIdx + 1, 15));
  const nowZoned = getZonedParts(now, userTz);

  const prevYm = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const currYm = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const nextYm = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const todayYm = `${nowZoned.year}-${String(nowZoned.month).padStart(2, '0')}`;
  const mKey = mangaId || 'all';
  const mineFlag = mineOnly ? '1' : '0';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cb_cal:prev:${prevYm}:${mineFlag}:${mKey}`)
      .setLabel('Prev Month')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️'),
    new ButtonBuilder()
      .setCustomId(`cb_cal:today:${todayYm}:${mineFlag}:${mKey}`)
      .setLabel('This Month')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cb_cal:next:${nextYm}:${mineFlag}:${mKey}`)
      .setLabel('Next Month')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId(`cb_cal:mine:${currYm}:${mineOnly ? '0' : '1'}:${mKey}`)
      .setLabel(mineOnly ? 'All Team' : 'My Deadlines')
      .setStyle(mineOnly ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Web Calendar')
      .setURL(`${webUrl}/calendar`)
      .setEmoji('🌐')
  );

  return { embeds: [embed], components: [row] };
}

export const calendarCommand: BotCommand = {
  name: 'calendar',
  description: 'View an interactive monthly calendar of chapter and task deadlines in your timezone',
  data: new SlashCommandBuilder()
    .setName('calendar')
    .setDescription('View interactive monthly calendar of deadlines and chapter schedules')
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName('month')
        .setDescription('Month to view in YYYY-MM format (defaults to current month)')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName('series')
        .setDescription('Filter by manga series')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addBooleanOption((opt) =>
      opt.setName('mine').setDescription('Show only your assigned task deadlines').setRequired(false)
    ),

  autocomplete: sharedSeriesTaskAutocomplete,

  execute: async ({ interaction, webUrl }: CommandContext) => {
    const monthOpt = interaction.options.getString('month')?.trim();
    const seriesOpt = interaction.options.getString('series')?.trim();
    const mineOnly = interaction.options.getBoolean('mine') ?? false;

    const { timeZone } = await getUserTimeZone(interaction.user.id);
    const nowZoned = getZonedParts(new Date(), timeZone);
    let year = nowZoned.year;
    let monthIdx = nowZoned.monthIdx;

    if (monthOpt && /^\d{4}-\d{2}$/.test(monthOpt)) {
      const [y, m] = monthOpt.split('-').map(Number);
      if (m >= 1 && m <= 12) {
        year = y;
        monthIdx = m - 1;
      }
    }

    let mangaId: string | null = null;
    if (seriesOpt) {
      const manga = await resolveMangaByTitle(seriesOpt);
      if (!manga) {
        await interaction.reply({ content: `❌ Series **"${seriesOpt}"** not found.`, ephemeral: true });
        return;
      }
      mangaId = manga._id.toString();
    }

    const payload = await buildCalendarPayload({
      year,
      monthIdx,
      mineOnly,
      mangaId,
      discordUserId: interaction.user.id,
      webUrl,
    });

    await interaction.reply({ ...payload, ephemeral: true });
  },

  handleButton: async (interaction: ButtonInteraction) => {
    if (!interaction.customId.startsWith('cb_cal:')) return;
    const [, _action, ym, mineFlag, mKey] = interaction.customId.split(':');
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return;

    const [y, m] = ym.split('-').map(Number);
    const webUrl = process.env.FRONTEND_URL || process.env.WEB_URL || 'http://localhost:5173';

    const payload = await buildCalendarPayload({
      year: y,
      monthIdx: m - 1,
      mineOnly: mineFlag === '1',
      mangaId: mKey && mKey !== 'all' ? mKey : null,
      discordUserId: interaction.user.id,
      webUrl,
    });

    await interaction.update(payload);
  },
};
