import { FastifyInstance } from 'fastify';
import { MangaModel, ChapterModel, WorkAssignmentModel, WorkTypeModel, DeliverableModel } from '@claimboard/database';

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
    const assignments = await WorkAssignmentModel.find({
      chapterId: { $in: chapterIds },
      organizationId: context.organizationId,
    })
      .populate('workTypeId')
      .sort({ createdAt: 1 })
      .lean();

    const assignmentIds = assignments.map((a) => a._id);
    const deliverables = await DeliverableModel.find({
      assignmentId: { $in: assignmentIds },
      organizationId: context.organizationId,
    })
      .sort({ revision: -1 })
      .lean();

    const pipelineData = chapters.map((ch: any) => {
      const chAssignments = assignments.filter(
        (a: any) => a.chapterId.toString() === ch._id.toString()
      );

      return {
        chapterId: ch._id.toString(),
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        mangaId: ch.mangaId?._id?.toString(),
        mangaTitle: ch.mangaId?.title || 'Unknown Manga',
        mangaCoverUrl: ch.mangaId?.coverUrl,
        priority: ch.priority,
        status: ch.status,
        stages: chAssignments.map((a: any) => {
          const stageDeliverables = deliverables.filter(
            (d: any) => d.assignmentId.toString() === a._id.toString()
          );
          const latestDeliverable = stageDeliverables.length > 0 ? stageDeliverables[0] : null;

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
          };
        }),
      };
    });

    return reply.send({ success: true, data: pipelineData });
  });
}
