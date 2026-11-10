import { FastifyInstance } from 'fastify';
import {
  WorkAssignmentModel,
  ChapterModel,
  UserModel,
} from '@claimboard/database';
import { API_ERROR_CODES, BatchUpdateDeadlinesSchema, UpdateDeadlineSchema } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

type UrgencyState = 'completed' | 'overdue' | 'due_soon' | 'upcoming';

function computeUrgency(deadline: Date | undefined | null, status: string, now: Date): UrgencyState {
  const isCompleted = status === 'COMPLETED' || status === 'APPROVED' || status === 'Completed' || status === 'Published';
  if (isCompleted) return 'completed';
  if (!deadline) return 'upcoming';

  const diffMs = new Date(deadline).getTime() - now.getTime();
  if (diffMs < 0) return 'overdue';
  if (diffMs <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'upcoming';
}

export async function deadlineRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/deadlines
   * Unified calendar & deadline feed across WorkAssignments and Chapters.
   */
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const {
      from,
      to,
      todayStart,
      todayEnd,
      mangaId,
      workTypeId,
      workTypeIds,
      urgency = 'all',
      scope = 'all',
      kind = 'all',
      includeActivity = 'false',
    } = (request.query as Record<string, string | undefined>) || {};

    const selectedRoles = Array.from(
      new Set(
        (workTypeIds
          ? workTypeIds.split(',').map((s) => s.trim())
          : workTypeId && workTypeId !== 'All'
          ? [workTypeId.trim()]
          : []
        ).filter(Boolean)
      )
    );
    const hasRoleFilter = selectedRoles.length > 0 && !selectedRoles.includes('ALL');
    const selectedWorkTypeIds = selectedRoles.filter((id) => id !== 'CHAPTER');
    const includesChapterTarget = !hasRoleFilter || selectedRoles.includes('CHAPTER');
    const showActivity = includeActivity === 'true';

    const now = new Date();
    const dateRange: any = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) dateRange.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) dateRange.$lte = toDate;
    }
    const rangeOrExists = Object.keys(dateRange).length > 0 ? dateRange : { $exists: true, $ne: null };

    const items: any[] = [];
    const seenAssignmentIds = new Set<string>();
    const seenAssignmentSlots = new Set<string>();
    const seenChapterIds = new Set<string>();

    const isLegacyUpload = (wt: any) =>
      /^upload(ing|er)?$/i.test(wt?.name || '') || ['UP', 'UPL', 'UPLOAD'].includes((wt?.code || '').toUpperCase());

    const pushAssignmentUnique = (
      a: any,
      eventType: 'deadline' | 'completed_work' | 'submission',
      eventDate: Date
    ) => {
      if (!a.chapterId || !a.workTypeId || isLegacyUpload(a.workTypeId)) return;
      const idStr = a._id.toString();
      const chId = a.chapterId?._id?.toString() || a.chapterId?.toString();
      const wtId = a.workTypeId?._id?.toString() || a.workTypeId?.toString();
      const slotKey = `${chId}:${wtId}`;
      if (seenAssignmentIds.has(idStr) || seenAssignmentSlots.has(slotKey)) return;
      seenAssignmentIds.add(idStr);
      seenAssignmentSlots.add(slotKey);
      items.push(mapAssignmentToCalendarItem(a, eventType, eventDate));
    };

    const mapAssignmentToCalendarItem = (
      a: any,
      eventType: 'deadline' | 'completed_work' | 'submission',
      eventDate: Date
    ) => {
      const idStr = a._id.toString();
      const itemUrgency =
        eventType === 'completed_work' ? 'completed' : computeUrgency(a.deadline || eventDate, a.status, now);
      return {
        id: idStr,
        kind: 'assignment' as const,
        eventType,
        eventDate,
        title: `${a.mangaId?.title || 'Series'} — Ch. ${a.chapterId?.chapterNumber || '?'} (${a.workTypeId?.code || 'Task'})`,
        mangaId: a.mangaId?._id?.toString(),
        mangaTitle: a.mangaId?.title || 'Unknown Series',
        mangaCoverUrl: a.mangaId?.coverUrl,
        chapterId: a.chapterId?._id?.toString(),
        chapterNumber: a.chapterId?.chapterNumber || '?',
        chapterTitle: a.chapterId?.title,
        workTypeId: a.workTypeId?._id?.toString(),
        workTypeName: a.workTypeId?.name || 'Task',
        workTypeCode: a.workTypeId?.code || 'TSK',
        workTypeColor: a.workTypeId?.color || '#6366f1',
        assignedWorkerId: a.assignedWorkerId?._id?.toString() || a.assignedWorkerId?.toString(),
        assignedWorkerName: a.assignedWorkerId?.displayName || a.assignedWorkerName || null,
        assignedWorkerAvatarUrl: a.assignedWorkerId?.avatarUrl || null,
        status: a.status,
        priority: a.priority || 'Normal',
        deadline: a.deadline || null,
        submittedAt: a.submittedAt || null,
        completedAt: a.completedAt || null,
        urgency: itemUrgency,
      };
    };

    const mapChapterToCalendarItem = (
      ch: any,
      eventType: 'deadline' | 'completed_work',
      eventDate: Date
    ) => {
      const idStr = ch._id.toString();
      const itemUrgency =
        eventType === 'completed_work' ? 'completed' : computeUrgency(ch.deadline || eventDate, ch.status, now);
      return {
        id: idStr,
        kind: 'chapter' as const,
        eventType,
        eventDate,
        title: `${ch.mangaId?.title || 'Series'} — Chapter ${ch.chapterNumber} ${
          eventType === 'completed_work' ? 'Completed' : 'Release Target'
        }`,
        mangaId: ch.mangaId?._id?.toString(),
        mangaTitle: ch.mangaId?.title || 'Unknown Series',
        mangaCoverUrl: ch.mangaId?.coverUrl,
        chapterId: idStr,
        chapterNumber: ch.chapterNumber,
        chapterTitle: ch.title,
        workTypeCode: 'CH',
        workTypeName: eventType === 'completed_work' ? 'Chapter Completed' : 'Chapter Release',
        workTypeColor: '#10b981',
        assignedWorkerId: null,
        assignedWorkerName: null,
        assignedWorkerAvatarUrl: null,
        status: ch.status,
        priority: ch.priority || 'Normal',
        deadline: ch.deadline || null,
        completedAt: ch.completedAt || null,
        urgency: itemUrgency,
      };
    };

    // 1. Fetch WorkAssignment deadlines + optional completed works / submissions
    if ((kind === 'all' || kind === 'assignment') && (!hasRoleFilter || selectedWorkTypeIds.length > 0)) {
      const baseAssignmentFilter: any = { organizationId: context.organizationId };
      if (mangaId && mangaId !== 'All') baseAssignmentFilter.mangaId = mangaId;
      if (hasRoleFilter) baseAssignmentFilter.workTypeId = { $in: selectedWorkTypeIds };
      if (scope === 'mine') baseAssignmentFilter.assignedWorkerId = context.user.id;

      const deadlineAssignments = await WorkAssignmentModel.find({
        ...baseAssignmentFilter,
        deadline: rangeOrExists,
      })
        .populate('mangaId', 'title coverUrl status')
        .populate('chapterId', 'chapterNumber title priority status')
        .populate('workTypeId', 'name code color')
        .populate('assignedWorkerId', 'displayName avatarUrl discordUsername')
        .sort({ deadline: 1 })
        .lean();

      for (const a of deadlineAssignments as any[]) {
        if (!a.deadline) continue;
        const isCompleted = a.status === 'COMPLETED' || a.status === 'APPROVED';
        const displayDate = isCompleted && a.completedAt ? a.completedAt : a.deadline;
        pushAssignmentUnique(a, isCompleted ? 'completed_work' : 'deadline', new Date(displayDate));
      }

      if (showActivity) {
        const completedAssignments = await WorkAssignmentModel.find({
          ...baseAssignmentFilter,
          status: { $in: ['COMPLETED', 'APPROVED'] },
          completedAt: rangeOrExists,
        })
          .populate('mangaId', 'title coverUrl status')
          .populate('chapterId', 'chapterNumber title priority status')
          .populate('workTypeId', 'name code color')
          .populate('assignedWorkerId', 'displayName avatarUrl discordUsername')
          .sort({ completedAt: -1 })
          .lean();

        for (const a of completedAssignments as any[]) {
          if (!a.completedAt) continue;
          pushAssignmentUnique(a, 'completed_work', new Date(a.completedAt));
        }

        const submittedAssignments = await WorkAssignmentModel.find({
          ...baseAssignmentFilter,
          status: { $in: ['SUBMITTED', 'IN_REVIEW'] },
          submittedAt: rangeOrExists,
        })
          .populate('mangaId', 'title coverUrl status')
          .populate('chapterId', 'chapterNumber title priority status')
          .populate('workTypeId', 'name code color')
          .populate('assignedWorkerId', 'displayName avatarUrl discordUsername')
          .sort({ submittedAt: -1 })
          .lean();

        for (const a of submittedAssignments as any[]) {
          if (!a.submittedAt) continue;
          pushAssignmentUnique(a, 'submission', new Date(a.submittedAt));
        }
      }
    }

    // 2. Fetch Chapter target deadlines + optional completed chapters
    if ((kind === 'all' || kind === 'chapter') && scope !== 'mine' && includesChapterTarget) {
      const baseChapterFilter: any = { organizationId: context.organizationId };
      if (mangaId && mangaId !== 'All') baseChapterFilter.mangaId = mangaId;

      const deadlineChapters = await ChapterModel.find({
        ...baseChapterFilter,
        deadline: rangeOrExists,
      })
        .populate('mangaId', 'title coverUrl status')
        .sort({ deadline: 1 })
        .lean();

      for (const ch of deadlineChapters as any[]) {
        if (!ch.deadline) continue;
        const idStr = ch._id.toString();
        seenChapterIds.add(idStr);
        const isCompleted = ch.status === 'Completed' || ch.status === 'Published';
        const displayDate = isCompleted && ch.completedAt ? ch.completedAt : ch.deadline;
        items.push(
          mapChapterToCalendarItem(ch, isCompleted ? 'completed_work' : 'deadline', new Date(displayDate))
        );
      }

      if (showActivity) {
        const completedChapters = await ChapterModel.find({
          ...baseChapterFilter,
          status: { $in: ['Completed', 'Published'] },
          completedAt: rangeOrExists,
        })
          .populate('mangaId', 'title coverUrl status')
          .sort({ completedAt: -1 })
          .lean();

        for (const ch of completedChapters as any[]) {
          const idStr = ch._id.toString();
          if (seenChapterIds.has(idStr) || !ch.completedAt) continue;
          seenChapterIds.add(idStr);
          items.push(mapChapterToCalendarItem(ch, 'completed_work', new Date(ch.completedAt)));
        }
      }
    }

    // Sort chronologically by primary calendar eventDate
    items.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

    // Summary metrics computed in the caller's timezone boundaries when provided
    const parsedTodayStart = todayStart ? new Date(todayStart) : null;
    const parsedTodayEnd = todayEnd ? new Date(todayEnd) : null;

    const startOfToday =
      parsedTodayStart && !isNaN(parsedTodayStart.getTime())
        ? parsedTodayStart
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

    const endOfToday =
      parsedTodayEnd && !isNaN(parsedTodayEnd.getTime())
        ? parsedTodayEnd
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const summary = {
      total: items.length,
      overdue: items.filter((i) => i.urgency === 'overdue').length,
      dueToday: items.filter((i) => {
        if (i.urgency === 'completed' || !i.deadline) return false;
        const d = new Date(i.deadline);
        return d >= startOfToday && d <= endOfToday;
      }).length,
      dueSoon: items.filter((i) => i.urgency === 'due_soon').length,
      dueThisWeek: items.filter((i) => {
        if (i.urgency === 'completed' || !i.deadline) return false;
        const d = new Date(i.deadline);
        return d >= now && d <= endOfWeek;
      }).length,
      completed: items.filter((i) => i.urgency === 'completed').length,
    };

    const filteredItems =
      urgency && urgency !== 'all'
        ? items.filter((i) => {
            if (urgency === 'completed_work') return i.eventType === 'completed_work' || i.urgency === 'completed';
            if (urgency === 'submission') return i.eventType === 'submission';
            if (urgency === 'deadline') return Boolean(i.deadline);
            return i.urgency === urgency;
          })
        : items;

    return reply.send({
      success: true,
      data: {
        items: filteredItems,
        summary,
      },
    });
  });

  /**
   * PATCH /api/deadlines/batch
   * Update or clear deadlines on multiple assignments or chapters at once.
   */
  fastify.patch('/batch', async (request, reply) => {
    const context = await request.requirePermission('assignments.edit');
    const parse = BatchUpdateDeadlinesSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: API_ERROR_CODES.VALIDATION_ERROR,
          message: parse.error.errors[0]?.message || 'Invalid batch deadline payload',
        },
      });
    }

    const parsedDate = parse.data.deadline ? new Date(parse.data.deadline) : null;
    if (parsedDate && isNaN(parsedDate.getTime())) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.DEADLINE_INVALID, message: 'Invalid deadline date format' },
      });
    }

    const uniqueIds = Array.from(new Set(parse.data.ids));
    const results: any[] = [];
    for (const targetId of uniqueIds) {
      if (parse.data.kind === 'assignment') {
        const updated = await ProductionService.updateAssignmentDeadline({
          organizationId: context.organizationId,
          assignmentId: targetId,
          deadline: parsedDate,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
        results.push(updated);
      } else {
        const updated = await ProductionService.updateChapterDeadline({
          organizationId: context.organizationId,
          chapterId: targetId,
          deadline: parsedDate,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
        results.push(updated);
      }
    }

    return reply.send({ success: true, data: { updatedCount: results.length, items: results } });
  });

  /**
   * PATCH /api/deadlines/:kind/:id
   * Update or clear deadline for either an assignment or a chapter.
   */
  fastify.patch('/:kind/:id', async (request, reply) => {
    const context = await request.requirePermission('assignments.edit');
    const { kind, id } = request.params as { kind: string; id: string };

    const parse = UpdateDeadlineSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: API_ERROR_CODES.VALIDATION_ERROR,
          message: parse.error.errors[0]?.message || 'Invalid deadline payload',
        },
      });
    }

    const parsedDate = parse.data.deadline ? new Date(parse.data.deadline) : null;
    if (parsedDate && isNaN(parsedDate.getTime())) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.DEADLINE_INVALID, message: 'Invalid deadline date format' },
      });
    }

    try {
      if (kind === 'assignment') {
        const updated = await ProductionService.updateAssignmentDeadline({
          organizationId: context.organizationId,
          assignmentId: id,
          deadline: parsedDate,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
        return reply.send({ success: true, data: updated });
      } else if (kind === 'chapter') {
        const updated = await ProductionService.updateChapterDeadline({
          organizationId: context.organizationId,
          chapterId: id,
          deadline: parsedDate,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
        return reply.send({ success: true, data: updated });
      } else {
        return reply.status(400).send({
          success: false,
          error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Kind must be assignment or chapter' },
        });
      }
    } catch (err: any) {
      return reply.status(err.code?.includes('NOT_FOUND') ? 404 : 400).send({
        success: false,
        error: {
          code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: err.message || 'Failed to update deadline',
        },
      });
    }
  });

  /**
   * GET /api/deadlines/timezone
   * Retrieve the authenticated user's persisted timezone preference.
   */
  fastify.get('/timezone', async (request, reply) => {
    const context = await request.requireAuth();
    const user = await UserModel.findById(context.user.id).select('timezone').lean();
    return reply.send({
      success: true,
      data: { timezone: user?.timezone || null },
    });
  });

  /**
   * PATCH /api/deadlines/timezone
   * Save user's IANA timezone so web, notifications, and Discord bot stay in sync.
   */
  fastify.patch('/timezone', async (request, reply) => {
    const context = await request.requireAuth();
    const { timezone } = (request.body as { timezone?: string }) || {};

    if (!timezone || typeof timezone !== 'string') {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'timezone is required' },
      });
    }

    // Validate IANA timezone using Intl
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: `Invalid IANA timezone: ${timezone}` },
      });
    }

    await UserModel.updateOne({ _id: context.user.id }, { $set: { timezone } });
    return reply.send({ success: true, data: { timezone } });
  });
}

