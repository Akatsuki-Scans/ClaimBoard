import { FastifyInstance } from 'fastify';
import { ClaimModel, WorkAssignmentModel } from '@claimboard/database';
import { ClaimWorkSchema, UnclaimWorkSchema, ReassignClaimSchema, API_ERROR_CODES } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function claimRoutes(fastify: FastifyInstance) {
  // Claim Work (Atomic, Race-Condition Safe)
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('claims.create');
    const parse = ClaimWorkSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    try {
      const result = await ProductionService.claimWork({
        organizationId: context.organizationId,
        assignmentId: parse.data.assignmentId,
        workerId: context.user.id,
        workerName: context.user.displayName,
        workerAvatarUrl: context.user.avatarUrl,
      });

      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: {
          code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: err.message || 'Failed to claim work assignment',
        },
      });
    }
  });

  // Unclaim Work
  fastify.post('/unclaim', async (request, reply) => {
    const context = await request.requirePermission('claims.cancel');
    const parse = UnclaimWorkSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const isAdmin = context.permissions.includes('claims.reassign') || context.user.role === 'Administrator' || context.user.role === 'Owner';

    try {
      const updated = await ProductionService.unclaimWork({
        organizationId: context.organizationId,
        assignmentId: parse.data.assignmentId,
        workerId: context.user.id,
        workerName: context.user.displayName,
        reason: parse.data.reason,
        isAdmin,
      });

      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: {
          code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: err.message || 'Failed to unclaim assignment',
        },
      });
    }
  });

  // Reassign Work (Admin / Moderator)
  fastify.post('/reassign', async (request, reply) => {
    const context = await request.requirePermission('claims.reassign');
    const parse = ReassignClaimSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    try {
      const result = await ProductionService.reassignWork({
        organizationId: context.organizationId,
        assignmentId: parse.data.assignmentId,
        newWorkerId: parse.data.newWorkerId,
        reason: parse.data.reason,
        adminId: context.user.id,
        adminName: context.user.displayName,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: {
          code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: err.message || 'Failed to reassign claim',
        },
      });
    }
  });

  // My Claims (Specification #29 & #96)
  fastify.get('/my', async (request, reply) => {
    const context = await request.requireAuth();
    const { status, filter } = request.query as any;

    const query: any = {
      organizationId: context.organizationId,
      workerId: context.user.id,
    };

    if (filter === 'Active') {
      query.status = { $in: ['ACTIVE', 'CHANGES_REQUESTED'] };
    } else if (filter === 'Review') {
      query.status = { $in: ['SUBMITTED', 'UNDER_REVIEW'] };
    } else if (filter === 'Completed') {
      query.status = 'COMPLETED';
    } else if (status) {
      query.status = status;
    }

    const claims = await ClaimModel.find(query)
      .populate({
        path: 'assignmentId',
        populate: [
          { path: 'workTypeId' },
          { path: 'mangaId', select: 'title coverUrl' },
          { path: 'chapterId', select: 'chapterNumber title priority' },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = claims.map((c: any) => {
      const assignment = c.assignmentId;
      const now = new Date();
      const isOverdue = c.deadline && new Date(c.deadline) < now && c.status !== 'COMPLETED';

      return {
        id: c._id.toString(),
        assignmentId: assignment?._id?.toString(),
        workerId: c.workerId.toString(),
        workerName: c.workerName,
        status: c.status,
        claimedAt: c.claimedAt,
        deadline: c.deadline,
        isOverdue,
        revisionsCount: c.revisions?.length || 0,
        lastDeliverableUrl: c.revisions?.length ? c.revisions[c.revisions.length - 1].deliverableUrl : undefined,
        lastDeliverableLabel: c.revisions?.length ? c.revisions[c.revisions.length - 1].deliverableLabel : undefined,
        revisions: c.revisions || [],
        mangaTitle: assignment?.mangaId?.title || 'Unknown Manga',
        mangaCoverUrl: assignment?.mangaId?.coverUrl,
        chapterNumber: assignment?.chapterId?.chapterNumber || '?',
        chapterTitle: assignment?.chapterId?.title,
        workTypeName: assignment?.workTypeId?.name || 'Task',
        workTypeCode: assignment?.workTypeId?.code || 'TSK',
        workTypeColor: assignment?.workTypeId?.color || '#6366f1',
        requiresReview: assignment?.workTypeId?.requiresReview ?? true,
      };
    });

    return reply.send({ success: true, data: formatted });
  });

  // Get Claim by ID with revisions
  fastify.get('/:id', async (request, reply) => {
    const context = await request.requireAuth();
    const { id } = request.params as any;

    const claim = await ClaimModel.findOne({ _id: id, organizationId: context.organizationId })
      .populate({
        path: 'assignmentId',
        populate: [
          { path: 'workTypeId' },
          { path: 'mangaId', select: 'title coverUrl' },
          { path: 'chapterId', select: 'chapterNumber title priority' },
        ],
      })
      .lean();

    if (!claim) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.CLAIM_NOT_FOUND, message: 'Claim not found' } });
    }

    return reply.send({
      success: true,
      data: {
        ...claim,
        id: claim._id.toString(),
      },
    });
  });
}
