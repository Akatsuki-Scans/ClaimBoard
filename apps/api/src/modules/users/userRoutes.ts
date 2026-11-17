import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import {
  UserModel,
  WorkAssignmentModel,
  DeliverableModel,
  ReviewModel,
  ActivityLogModel,
} from '@claimboard/database';
import { API_ERROR_CODES } from '@claimboard/shared';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function userRoutes(fastify: FastifyInstance) {
  // Handler for deep user profile & work telemetry
  const resolveUserProfile = async (rawIdentifier: string, contextOrgId?: any) => {
    const identifier = decodeURIComponent(rawIdentifier.trim());
    if (!identifier) return null;

    const esc = escapeRegex(identifier);
    const queryConditions: any[] = [];

    // 1. Direct MongoDB ObjectId match
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      queryConditions.push({ _id: new mongoose.Types.ObjectId(identifier) });
    }

    // 2. Case-insensitive exact matches on Display Name, Username, and Discord handles
    queryConditions.push({ displayName: { $regex: `^${esc}$`, $options: 'i' } });
    queryConditions.push({ username: { $regex: `^${esc}$`, $options: 'i' } });
    queryConditions.push({ discordUsername: { $regex: `^${esc}$`, $options: 'i' } });
    queryConditions.push({ discordId: identifier });

    // 3. Flexible slug match (handles "kimchi-scans" -> "Kimchi Scans" or "kimchi_scans")
    const words = identifier.split(/[-_\s]+/).filter(Boolean);
    if (words.length > 0) {
      const slugPattern = words.map((w) => escapeRegex(w)).join('[-_\\s]*');
      queryConditions.push({ displayName: { $regex: `^${slugPattern}$`, $options: 'i' } });
      queryConditions.push({ username: { $regex: `^${slugPattern}$`, $options: 'i' } });
    }

    // Priority 1: Match within current organization
    let user: any = null;
    if (contextOrgId) {
      user = await UserModel.findOne({
        organizationId: contextOrgId,
        $or: queryConditions,
      }).lean();
    }

    // Priority 2: Match across any organization if not found
    if (!user) {
      user = await UserModel.findOne({
        $or: queryConditions,
      }).lean();
    }

    // Priority 3: Partial substring fallback
    if (!user) {
      user = await UserModel.findOne({
        $or: [
          { displayName: { $regex: esc, $options: 'i' } },
          { username: { $regex: esc, $options: 'i' } },
        ],
      }).lean();
    }

    return user;
  };

  const getUserTelemetryData = async (user: any) => {
    // Fetch all work assignments assigned to this worker
    const assignments: any[] = await WorkAssignmentModel.find({
      assignedWorkerId: user._id,
    })
      .populate('mangaId', 'title coverUrl status')
      .populate('chapterId', 'chapterNumber title deadline status releaseDate')
      .populate('workTypeId', 'name code color sortOrder')
      .sort({ updatedAt: -1 })
      .lean();

    const assignmentIds = assignments.map((a) => a._id);

    // Fetch deliverables, reviews, and activity history
    const [reviews, deliverables, activityLogs] = await Promise.all([
      ReviewModel.find({ assignmentId: { $in: assignmentIds } })
        .sort({ createdAt: -1 })
        .lean(),
      DeliverableModel.find({
        $or: [{ submittedById: user._id }, { assignmentId: { $in: assignmentIds } }],
      })
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      ActivityLogModel.find({
        $or: [{ actorId: user._id }, { 'metadata.workerId': user._id.toString() }],
      })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
    ]);

    const currentWork: any[] = [];
    const completedWork: any[] = [];
    const distinctManga = new Map<string, any>();
    const distinctChapters = new Set<string>();
    const roleCounts = new Map<string, { code: string; name: string; color: string; count: number }>();

    for (const a of assignments) {
      const isDone = a.status === 'COMPLETED' || a.status === 'APPROVED';
      const mangaTitle = a.mangaId?.title || 'Unknown Manga';
      const mangaIdStr = a.mangaId?._id?.toString() || a.mangaId?.toString();
      const chapterIdStr = a.chapterId?._id?.toString() || a.chapterId?.toString();
      const wtCode = a.workTypeId?.code || 'ROLE';
      const wtName = a.workTypeId?.name || 'Task';
      const wtColor = a.workTypeId?.color || '#6366f1';

      // Match latest review for this assignment
      const matchingReviews = reviews.filter((r) => r.assignmentId.toString() === a._id.toString());
      const latestRev = matchingReviews.length > 0 ? matchingReviews[0] : null;

      // Match latest deliverable
      const matchingDels = deliverables.filter((d) => d.assignmentId.toString() === a._id.toString());
      const latestDel = matchingDels.length > 0 ? matchingDels[0] : null;

      const formattedTask = {
        id: a._id.toString(),
        assignmentId: a._id.toString(),
        mangaId: mangaIdStr,
        mangaTitle,
        mangaCoverUrl: a.mangaId?.coverUrl,
        chapterId: chapterIdStr,
        chapterNumber: a.chapterId?.chapterNumber || '?',
        chapterTitle: a.chapterId?.title,
        workTypeId: a.workTypeId?._id?.toString(),
        workTypeName: wtName,
        workTypeCode: wtCode,
        color: wtColor,
        status: a.status,
        priority: a.priority || 'Normal',
        deadline: a.deadline,
        claimedAt: a.claimedAt || a.createdAt,
        submittedAt: a.submittedAt,
        completedAt: a.completedAt,
        isBlocked: a.isBlocked,
        blockedReason: a.blockedReason,
        pipelineUrl: mangaIdStr && chapterIdStr ? `/pipeline/${mangaIdStr}/${chapterIdStr}` : '/pipeline',
        deliverableUrl: latestDel?.url,
        deliverableLabel: latestDel?.label,
        notes: latestDel?.notes,
        revision: latestDel?.revision || 1,
        latestReview: latestRev
          ? {
              reviewerName: latestRev.reviewerName,
              status: latestRev.status,
              comment: latestRev.comment,
              createdAt: latestRev.createdAt,
            }
          : null,
      };

      if (isDone) {
        completedWork.push(formattedTask);
        if (mangaIdStr) {
          distinctManga.set(mangaIdStr, {
            id: mangaIdStr,
            title: mangaTitle,
            coverUrl: a.mangaId?.coverUrl,
            completedCount: (distinctManga.get(mangaIdStr)?.completedCount || 0) + 1,
          });
        }
        if (chapterIdStr) distinctChapters.add(chapterIdStr);

        const rEntry = roleCounts.get(wtCode) || { code: wtCode, name: wtName, color: wtColor, count: 0 };
        rEntry.count += 1;
        roleCounts.set(wtCode, rEntry);
      } else {
        currentWork.push(formattedTask);
      }
    }

    // Sort current work by deadline urgency (closest deadline first)
    currentWork.sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return new Date(b.claimedAt || 0).getTime() - new Date(a.claimedAt || 0).getTime();
    });

    // Review metrics
    const totalReviews = reviews.length;
    const approvedReviews = reviews.filter((r) => r.status === 'Approved').length;
    const changesRequested = reviews.filter((r) => r.status === 'Changes_Requested').length;
    const approvalRate = totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 100;

    const seriesBreakdown = Array.from(distinctManga.values()).sort((a, b) => b.completedCount - a.completedCount);
    const rolesBreakdown = Array.from(roleCounts.values()).sort((a, b) => b.count - a.count);

    return {
      user: {
        id: user._id.toString(),
        username: user.username,
        displayName: user.displayName || user.username,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isApproved: user.isApproved ?? true,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
        availability: user.availability || 'Available',
        workload: user.workload || (currentWork.length >= 4 ? 'Heavy' : currentWork.length >= 2 ? 'Normal' : 'Light'),
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      stats: {
        totalCompletedTasks: completedWork.length,
        totalActiveTasks: currentWork.length,
        totalUnderReview: currentWork.filter((w) => ['SUBMITTED', 'IN_REVIEW'].includes(w.status)).length,
        totalReviewsReceived: totalReviews,
        totalApprovedReviews: approvedReviews,
        totalChangesRequested: changesRequested,
        approvalRate,
        totalSeriesCount: distinctManga.size,
        totalChaptersCount: distinctChapters.size,
      },
      currentWork,
      completedWork,
      rolesBreakdown,
      seriesBreakdown,
      recentActivity: activityLogs.map((log: any) => ({
        id: log._id.toString(),
        action: log.action,
        entityType: log.entityType,
        createdAt: log.createdAt,
        metadata: log.metadata,
      })),
    };
  };

  // 1. GET /api/users/me or /api/user/me (Current user's own profile)
  fastify.get('/me', async (request, reply) => {
    const context = await request.requireAuth();
    const user = await UserModel.findById(context.user.id).lean();
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    const data = await getUserTelemetryData(user);
    return reply.send({ success: true, data });
  });

  // 2. GET /api/users/profile or /api/user/profile (Alias for /me)
  fastify.get('/profile', async (request, reply) => {
    const context = await request.requireAuth();
    const user = await UserModel.findById(context.user.id).lean();
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    const data = await getUserTelemetryData(user);
    return reply.send({ success: true, data });
  });

  // 3. GET /api/users/:identifier or /api/user/:identifier
  // Resolves by displayName (e.g. "Kimchi"), username, slug ("kimchi-scans"), or Mongo ID
  fastify.get('/:identifier', async (request, reply) => {
    const context = await request.requireAuth();
    const { identifier } = request.params as { identifier: string };

    if (!identifier || identifier === 'me' || identifier === 'profile') {
      const user = await UserModel.findById(context.user.id).lean();
      if (!user) {
        return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }
      const data = await getUserTelemetryData(user);
      return reply.send({ success: true, data });
    }

    const user = await resolveUserProfile(identifier, context.organizationId);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: `No user found matching "${identifier}"` },
      });
    }

    const data = await getUserTelemetryData(user);
    return reply.send({ success: true, data });
  });

  // 4. GET /api/users (Directory overview with work counters)
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const users = await UserModel.find({
      organizationId: context.organizationId,
      isApproved: true,
    })
      .select('-passwordHash')
      .sort({ completedTasksCount: -1, displayName: 1 })
      .lean();

    return reply.send({
      success: true,
      data: users.map((u: any) => ({
        id: u._id.toString(),
        username: u.username,
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarUrl,
        discordUsername: u.discordUsername,
        discordId: u.discordId,
        role: u.role,
        availability: u.availability || 'Available',
        workload: u.workload || 'Low',
        activeClaimsCount: u.activeClaimsCount || 0,
        completedTasksCount: u.completedTasksCount || 0,
        createdAt: u.createdAt,
      })),
    });
  });
}
