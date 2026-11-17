import { FastifyInstance } from 'fastify';
import { MangaModel, ChapterModel, WorkAssignmentModel, WorkTypeModel, DeliverableModel, ReviewModel } from '@claimboard/database';

const STATUS_PRIORITY_WEIGHT: Record<string, number> = {
  COMPLETED: 6,
  APPROVED: 6,
  IN_REVIEW: 5,
  SUBMITTED: 4,
  CHANGES_REQUESTED: 3,
  IN_PROGRESS: 2,
  CLAIMED: 1,
  ACTIVE: 1,
  OPEN: 0,
};

export async function pipelineRoutes(fastify: FastifyInstance) {
  // Get Visual Pipeline for Manga or All Active Production
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const { mangaId, status } = request.query as any;

    const chapterFilter: any = {
      organizationId: context.organizationId,
    };

    if (status && status !== 'All') {
      chapterFilter.status = status;
    }

    if (mangaId && mangaId !== 'All') {
      chapterFilter.mangaId = mangaId;
    }

    const chapters = await ChapterModel.find(chapterFilter)
      .populate('mangaId', 'title coverUrl status')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(30)
      .lean();

    const chapterIds = chapters.map((c) => c._id);
    const rawAssignments = await WorkAssignmentModel.find({
      chapterId: { $in: chapterIds },
      organizationId: context.organizationId,
    })
      .populate('workTypeId')
      .lean();

    // Sort assignments so active / completed tasks take priority over older open duplicates
    const assignments = [...rawAssignments].sort((a: any, b: any) => {
      const weightA = STATUS_PRIORITY_WEIGHT[a.status] ?? 0;
      const weightB = STATUS_PRIORITY_WEIGHT[b.status] ?? 0;
      if (weightB !== weightA) return weightB - weightA;
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });

    const assignmentIds = assignments.map((a) => a._id);
    const [deliverables, reviews] = await Promise.all([
      DeliverableModel.find({
        assignmentId: { $in: assignmentIds },
        organizationId: context.organizationId,
      })
        .sort({ revision: -1 })
        .lean(),
      ReviewModel.find({
        assignmentId: { $in: assignmentIds },
        organizationId: context.organizationId,
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const pipelineData = chapters.map((ch: any) => {
      const seenRoleIds = new Set<string>();
      const chAssignments: any[] = [];
      for (const a of assignments as any[]) {
        if (a.chapterId.toString() !== ch._id.toString()) continue;
        if (!a.workTypeId) continue;
        if (/^upload(ing|er)?$/i.test(a.workTypeId?.name || '') || ['UP', 'UPL', 'UPLOAD'].includes((a.workTypeId?.code || '').toUpperCase())) {
          continue;
        }
        const wtKey = a.workTypeId?._id?.toString() || a.workTypeId?.toString();
        if (seenRoleIds.has(wtKey)) continue;
        seenRoleIds.add(wtKey);
        chAssignments.push(a);
      }

      // Sort stages by work type standard workflow sort order
      chAssignments.sort((a, b) => (a.workTypeId?.sortOrder || 0) - (b.workTypeId?.sortOrder || 0));

      return {
        chapterId: ch._id.toString(),
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        mangaId: ch.mangaId?._id?.toString(),
        mangaTitle: ch.mangaId?.title || 'Unknown Manga',
        mangaCoverUrl: ch.mangaId?.coverUrl,
        priority: ch.priority,
        status: ch.status,
        deadline: ch.deadline,
        releaseDate: ch.releaseDate,
        completedAt: ch.completedAt,
        stages: chAssignments.map((a: any) => {
          const stageDeliverables = deliverables.filter(
            (d: any) => d.assignmentId.toString() === a._id.toString()
          );
          const latestDeliverable = stageDeliverables.length > 0 ? stageDeliverables[0] : null;

          const stageReviews = reviews.filter(
            (r: any) => r.assignmentId.toString() === a._id.toString()
          );
          const latestReview = stageReviews.length > 0 ? stageReviews[0] : null;

          return {
            assignmentId: a._id.toString(),
            workTypeId: a.workTypeId?._id?.toString(),
            workTypeCode: a.workTypeId?.code || '?',
            workTypeName: a.workTypeId?.name || 'Task',
            color: a.workTypeId?.color || '#6366f1',
            status: a.status,
            priority: a.priority || 'Normal',
            isBlocked: a.isBlocked,
            blockedReason: a.blockedReason,
            assignedWorkerId: a.assignedWorkerId?.toString(),
            assignedWorkerName: a.assignedWorkerName,
            activeClaimId: a.activeClaimId?.toString(),
            deadline: a.deadline,
            submittedAt: a.submittedAt,
            completedAt: a.completedAt,
            hasDeliverables: stageDeliverables.length > 0,
            deliverablesCount: stageDeliverables.length,
            latestDeliverable: latestDeliverable
              ? {
                  id: latestDeliverable._id.toString(),
                  url: latestDeliverable.url,
                  label: latestDeliverable.label,
                  notes: latestDeliverable.notes,
                  revision: latestDeliverable.revision,
                  submittedByName: latestDeliverable.submittedByName,
                  createdAt: latestDeliverable.createdAt,
                }
              : null,
            latestReview: latestReview
              ? {
                  id: latestReview._id.toString(),
                  reviewerName: latestReview.reviewerName,
                  status: latestReview.status,
                  comment: latestReview.comment,
                  createdAt: latestReview.createdAt,
                }
              : null,
          };
        }),
      };
    });

    return reply.send({ success: true, data: pipelineData });
  });
}
