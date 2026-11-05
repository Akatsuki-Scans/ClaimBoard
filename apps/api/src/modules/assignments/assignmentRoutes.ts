import { FastifyInstance } from 'fastify';
import { WorkAssignmentModel, MangaModel, ChapterModel, WorkTypeModel, AuditLogModel } from '@claimboard/database';
import { CreateAssignmentSchema, ApplyTemplateSchema, API_ERROR_CODES } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function assignmentRoutes(fastify: FastifyInstance) {
  // Open Work Query (Specification #30 & #95: Open Work board with list, kanban, by manga, by work type)
  fastify.get('/open', async (request, reply) => {
    const context = await request.requireAuth();
    const { mangaId, workTypeId, priority, status } = request.query as any;

    const filter: any = { organizationId: context.organizationId };

    if (status && status !== 'All') {
      filter.status = status;
    } else {
      // By default open work includes OPEN, CLAIMED, IN_PROGRESS
      filter.status = { $in: ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'CHANGES_REQUESTED'] };
    }

    if (mangaId && mangaId !== 'All') filter.mangaId = mangaId;
    if (workTypeId && workTypeId !== 'All') filter.workTypeId = workTypeId;
    if (priority && priority !== 'All') filter.priority = priority;

    const assignments = await WorkAssignmentModel.find(filter)
      .populate('mangaId', 'title coverUrl status')
      .populate('chapterId', 'chapterNumber title priority')
      .populate('workTypeId')
      .populate('dependsOnAssignmentIds')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = assignments.map((a: any) => ({
      id: a._id.toString(),
      organizationId: a.organizationId.toString(),
      mangaId: a.mangaId?._id?.toString() || a.mangaId?.toString(),
      chapterId: a.chapterId?._id?.toString() || a.chapterId?.toString(),
      workTypeId: a.workTypeId?._id?.toString() || a.workTypeId?.toString(),
      manga: a.mangaId ? { id: a.mangaId._id?.toString(), title: a.mangaId.title, coverUrl: a.mangaId.coverUrl } : undefined,
      mangaTitle: a.mangaId?.title || 'Unknown Manga',
      chapter: a.chapterId ? { id: a.chapterId._id?.toString(), chapterNumber: a.chapterId.chapterNumber, title: a.chapterId.title, priority: a.chapterId.priority } : undefined,
      chapterNumber: a.chapterId?.chapterNumber,
      workType: a.workTypeId ? {
        id: a.workTypeId._id?.toString(),
        name: a.workTypeId.name,
        code: a.workTypeId.code,
        color: a.workTypeId.color,
        requiresReview: a.workTypeId.requiresReview,
        estimatedWorkloadHours: a.workTypeId.estimatedWorkloadHours,
      } : undefined,
      workTypeName: a.workTypeId?.name,
      status: a.status,
      priority: a.priority,
      deadline: a.deadline,
      isBlocked: a.isBlocked,
      blockedReason: a.blockedReason,
      assignedWorkerId: a.assignedWorkerId?.toString(),
      assignedWorkerName: a.assignedWorkerName,
      claimedAt: a.claimedAt,
      submittedAt: a.submittedAt,
      completedAt: a.completedAt,
      activeClaimId: a.activeClaimId?.toString(),
      allowUnclaim: a.allowUnclaim,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return reply.send({ success: true, data: formatted });
  });

  // Get all assignments with query options
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const { chapterId, mangaId } = request.query as any;

    const filter: any = { organizationId: context.organizationId };
    if (chapterId) filter.chapterId = chapterId;
    if (mangaId) filter.mangaId = mangaId;

    const assignments = await WorkAssignmentModel.find(filter)
      .populate('workTypeId')
      .populate('mangaId', 'title coverUrl')
      .populate('chapterId', 'chapterNumber title')
      .sort({ createdAt: 1 })
      .lean();

    return reply.send({
      success: true,
      data: assignments.map((a: any) => ({
        ...a,
        id: a._id.toString(),
        mangaId: a.mangaId?._id ? a.mangaId._id.toString() : a.mangaId?.toString(),
        chapterId: a.chapterId?._id ? a.chapterId._id.toString() : a.chapterId?.toString(),
        workTypeId: a.workTypeId?._id ? a.workTypeId._id.toString() : a.workTypeId?.toString(),
        manga: a.mangaId && typeof a.mangaId === 'object' ? {
          id: a.mangaId._id?.toString(),
          title: a.mangaId.title,
          coverUrl: a.mangaId.coverUrl,
        } : undefined,
        mangaTitle: a.mangaId?.title || (typeof a.mangaId === 'string' ? a.mangaId : 'Unknown Manga'),
        chapter: a.chapterId && typeof a.chapterId === 'object' ? {
          id: a.chapterId._id?.toString(),
          chapterNumber: a.chapterId.chapterNumber,
          title: a.chapterId.title,
        } : undefined,
        chapterNumber: a.chapterId?.chapterNumber,
        workType: a.workTypeId,
        workTypeName: a.workTypeId?.name,
      })),
    });
  });

  // Create Assignment
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('assignments.create');
    const parse = CreateAssignmentSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const created = await ProductionService.assignWork({
      organizationId: context.organizationId,
      mangaId: parse.data.mangaId,
      chapterId: parse.data.chapterId,
      workTypeIds: [parse.data.workTypeId],
      priority: parse.data.priority as any,
      deadline: parse.data.deadline ? new Date(parse.data.deadline) : undefined,
      actorId: context.user.id,
      actorName: context.user.displayName,
    });

    return reply.status(201).send({ success: true, data: created[0] });
  });

  // Update Priority
  fastify.patch('/:id/priority', async (request, reply) => {
    const context = await request.requirePermission('assignments.edit');
    const { id } = request.params as any;
    const { priority } = (request.body as any) || {};

    const assignment = await WorkAssignmentModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: { priority } },
      { new: true }
    );

    if (!assignment) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' } });
    }

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'ASSIGNMENT_PRIORITY_UPDATED',
      entity: 'WorkAssignment',
      entityId: id,
      after: { priority },
    });

    return reply.send({ success: true, data: assignment });
  });

  // Update Deadline
  fastify.patch('/:id/deadline', async (request, reply) => {
    const context = await request.requirePermission('assignments.edit');
    const { id } = request.params as any;
    const { deadline } = (request.body as any) || {};

    const parsedDate = deadline ? new Date(deadline) : null;
    const assignment = await WorkAssignmentModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: { deadline: parsedDate } },
      { new: true }
    );

    if (!assignment) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' } });
    }

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'ASSIGNMENT_DEADLINE_UPDATED',
      entity: 'WorkAssignment',
      entityId: id,
      after: { deadline: parsedDate },
    });

    return reply.send({ success: true, data: assignment });
  });

  // Update Status (for Drag and Drop pipeline progression)
  fastify.patch('/:id/status', async (request, reply) => {
    const context = await request.requireAuth();
    const { id } = request.params as any;
    const { status } = (request.body as any) || {};

    const allowedStatuses = ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'COMPLETED'];
    if (!status || !allowedStatuses.includes(status)) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: `Invalid or missing status: ${status}` },
      });
    }

    const updateFields: any = { status };
    if (status === 'COMPLETED') {
      updateFields.completedAt = new Date();
    } else if (status === 'IN_PROGRESS') {
      // If unassigned, automatically assign to current user
      const existing = await WorkAssignmentModel.findOne({ _id: id, organizationId: context.organizationId });
      if (existing && !existing.assignedWorkerId) {
        updateFields.assignedWorkerId = context.user.id;
        updateFields.assignedWorkerName = context.user.displayName;
        updateFields.claimedAt = new Date();
      }
    }

    const assignment: any = await WorkAssignmentModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: updateFields },
      { new: true }
    ).populate('workTypeId');

    if (!assignment) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.ASSIGNMENT_NOT_FOUND, message: 'Assignment not found' } });
    }

    if (status === 'COMPLETED') {
      await ProductionService.unblockDependentAssignments(id, context.organizationId);
    }

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'ASSIGNMENT_STATUS_UPDATED',
      entity: 'WorkAssignment',
      entityId: id,
      after: { status },
    });

    return reply.send({ success: true, data: assignment });
  });
}
