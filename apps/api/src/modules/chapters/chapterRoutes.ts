import { FastifyInstance } from 'fastify';
import {
  ChapterModel,
  MangaModel,
  WorkAssignmentModel,
  WorkTemplateModel,
  ClaimModel,
  DeliverableModel,
  ReviewModel,
  ActivityLogModel,
  WorkTypeModel,
} from '@claimboard/database';
import {
  CreateChapterSchema,
  BulkCreateChaptersSchema,
  API_ERROR_CODES,
} from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function chapterRoutes(fastify: FastifyInstance) {
  // List Chapters for a Manga
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const { mangaId } = request.query as any;

    const filter: any = { organizationId: context.organizationId };
    if (mangaId) filter.mangaId = mangaId;

    const chapters = await ChapterModel.find(filter).sort({ createdAt: -1 }).lean();

    return reply.send({
      success: true,
      data: chapters.map((c) => ({
        ...c,
        id: c._id.toString(),
      })),
    });
  });

  // Create Single Chapter
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('assignments.create');
    const parse = CreateChapterSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const { mangaId, chapterNumber, volumeNumber, title, releaseDate, deadline, priority, notes, templateId } = parse.data;

    const manga = await MangaModel.findOne({ _id: mangaId, organizationId: context.organizationId });
    if (!manga) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' } });
    }

    const parsedDeadline = deadline ? new Date(deadline) : undefined;
    if (parsedDeadline && isNaN(parsedDeadline.getTime())) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.DEADLINE_INVALID, message: 'Invalid deadline date' },
      });
    }

    const chapter = await ChapterModel.create({
      organizationId: context.organizationId,
      mangaId,
      chapterNumber,
      volumeNumber,
      title,
      releaseDate: releaseDate ? new Date(releaseDate) : undefined,
      deadline: parsedDeadline,
      priority,
      notes,
      status: 'In_Production',
    });

    await MangaModel.updateOne({ _id: mangaId }, { $inc: { totalChapters: 1, activeChapters: 1 } });

    // If template was selected, apply template to automatically create work assignments
    const selectedTemplateId = templateId || manga.defaultTemplateId;
    let assignedViaTemplate = false;
    if (selectedTemplateId) {
      const template = await WorkTemplateModel.findOne({ _id: selectedTemplateId, organizationId: context.organizationId });
      if (template && template.steps && template.steps.length > 0) {
        const workTypeIds = template.steps.sort((a, b) => a.order - b.order).map((s) => s.workTypeId.toString());
        await ProductionService.assignWork({
          organizationId: context.organizationId,
          mangaId,
          chapterId: chapter._id.toString(),
          workTypeIds,
          priority: priority as any,
          deadline: parsedDeadline,
          dependsOnPreviousInOrder: true,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
        assignedViaTemplate = true;
      }
    }

    if (!assignedViaTemplate) {
      // Auto-assign standard work types so chapter immediately appears in production pipeline
      let defaultWorkTypes = await WorkTypeModel.find({ organizationId: context.organizationId }).sort({ sortOrder: 1 }).lean();
      if (defaultWorkTypes.length === 0) {
        const defaults = [
          { name: 'Translation', code: 'TL', color: '#38bdf8', sortOrder: 1 },
          { name: 'Cleaning', code: 'CL', color: '#a855f7', sortOrder: 2 },
          { name: 'Redrawing', code: 'RD', color: '#ec4899', sortOrder: 3 },
          { name: 'Typesetting', code: 'TS', color: '#f59e0b', sortOrder: 4 },
          { name: 'Quality Check', code: 'QC', color: '#10b981', sortOrder: 5 },
        ];
        defaultWorkTypes = (await Promise.all(
          defaults.map((d) =>
            WorkTypeModel.create({
              organizationId: context.organizationId,
              ...d,
              requiresReview: true,
              allowMultipleWorkers: false,
              estimatedWorkloadHours: 2,
            })
          )
        )) as any;
      }

      if (defaultWorkTypes.length > 0) {
        await ProductionService.assignWork({
          organizationId: context.organizationId,
          mangaId,
          chapterId: chapter._id.toString(),
          workTypeIds: defaultWorkTypes.map((wt: any) => wt._id.toString()),
          priority: priority as any,
          deadline: parsedDeadline,
          dependsOnPreviousInOrder: true,
          actorId: context.user.id,
          actorName: context.user.displayName,
        });
      }
    }

    await ActivityLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: `Created chapter ${chapterNumber} for ${manga.title}`,
      entityType: 'chapter',
      entityId: chapter._id,
      entityName: `${manga.title} Ch. ${chapterNumber}`,
    });

    return reply.status(201).send({
      success: true,
      data: { id: chapter._id.toString(), ...chapter.toObject() },
    });
  });

  // Bulk Create Chapters (e.g. 100-120)
  fastify.post('/bulk', async (request, reply) => {
    const context = await request.requirePermission('assignments.create');
    const parse = BulkCreateChaptersSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const { mangaId, startNumber, endNumber, priority, templateId } = parse.data;

    if (startNumber > endNumber) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Start number cannot be greater than end number' },
      });
    }

    if (endNumber - startNumber > 50) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Cannot bulk create more than 50 chapters at once' },
      });
    }

    const manga = await MangaModel.findOne({ _id: mangaId, organizationId: context.organizationId });
    if (!manga) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' } });
    }

    const createdChapters = [];
    const template = templateId ? await WorkTemplateModel.findOne({ _id: templateId, organizationId: context.organizationId }) : null;

    for (let num = startNumber; num <= endNumber; num++) {
      const chapterNumber = num.toString();
      // Check if already exists
      const existing = await ChapterModel.findOne({ mangaId, chapterNumber });
      if (!existing) {
        const chapter = await ChapterModel.create({
          organizationId: context.organizationId,
          mangaId,
          chapterNumber,
          status: 'In_Production',
          priority,
        });

        if (template && template.steps && template.steps.length > 0) {
          const workTypeIds = template.steps.sort((a, b) => a.order - b.order).map((s) => s.workTypeId.toString());
          await ProductionService.assignWork({
            organizationId: context.organizationId,
            mangaId,
            chapterId: chapter._id.toString(),
            workTypeIds,
            priority: priority as any,
            dependsOnPreviousInOrder: true,
            actorId: context.user.id,
            actorName: context.user.displayName,
          });
        }

        createdChapters.push(chapter);
      }
    }

    await MangaModel.updateOne(
      { _id: mangaId },
      { $inc: { totalChapters: createdChapters.length, activeChapters: createdChapters.length } }
    );

    return reply.status(201).send({
      success: true,
      data: { count: createdChapters.length, message: `Successfully generated ${createdChapters.length} chapters` },
    });
  });

  // Chapter Timeline (Specification #69: Assignment -> Claim -> Submission -> Review -> Revision -> Approval -> Completion)
  fastify.get('/:id/timeline', async (request, reply) => {
    const context = await request.requireAuth();
    const { id } = request.params as any;

    const chapter = await ChapterModel.findOne({ _id: id, organizationId: context.organizationId }).lean();
    if (!chapter) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.CHAPTER_NOT_FOUND, message: 'Chapter not found' } });
    }

    const assignments = await WorkAssignmentModel.find({ chapterId: id }).populate('workTypeId').lean();
    const assignmentIds = assignments.map((a) => a._id);

    const claims = await ClaimModel.find({ assignmentId: { $in: assignmentIds } }).lean();
    const deliverables = await DeliverableModel.find({ assignmentId: { $in: assignmentIds } }).lean();
    const reviews = await ReviewModel.find({ assignmentId: { $in: assignmentIds } }).lean();

    return reply.send({
      success: true,
      data: {
        chapter: {
          id: chapter._id.toString(),
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          status: chapter.status,
          deadline: chapter.deadline,
          releaseDate: chapter.releaseDate,
        },
        assignments: assignments.map((a) => ({
          id: a._id.toString(),
          workType: a.workTypeId,
          status: a.status,
          priority: a.priority,
          deadline: a.deadline,
          assignedWorkerName: a.assignedWorkerName,
          isBlocked: a.isBlocked,
          claimedAt: a.claimedAt,
          completedAt: a.completedAt,
        })),
        claims: claims.map((c) => ({
          id: c._id.toString(),
          workerName: c.workerName,
          status: c.status,
          claimedAt: c.claimedAt,
          revisions: c.revisions,
        })),
        deliverables: deliverables.map((d) => ({
          id: d._id.toString(),
          revision: d.revision,
          url: d.url,
          label: d.label,
          submittedByName: d.submittedByName,
          createdAt: d.createdAt,
        })),
        reviews: reviews.map((r) => ({
          id: r._id.toString(),
          reviewerName: r.reviewerName,
          status: r.status,
          comment: r.comment,
          severity: r.severity,
          createdAt: r.createdAt,
        })),
      },
    });
  });

  // Update Chapter Target Deadline
  fastify.patch('/:id/deadline', async (request, reply) => {
    const context = await request.requirePermission('assignments.edit');
    const { id } = request.params as any;
    const { deadline } = (request.body as any) || {};

    const parsedDate = deadline ? new Date(deadline) : null;
    if (parsedDate && isNaN(parsedDate.getTime())) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.DEADLINE_INVALID, message: 'Invalid deadline date format' },
      });
    }

    try {
      const updated = await ProductionService.updateChapterDeadline({
        organizationId: context.organizationId,
        chapterId: id,
        deadline: parsedDate,
        actorId: context.user.id,
        actorName: context.user.displayName,
      });
      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      return reply.status(err.code === API_ERROR_CODES.CHAPTER_NOT_FOUND ? 404 : 400).send({
        success: false,
        error: { code: err.code || API_ERROR_CODES.INTERNAL_SERVER_ERROR, message: err.message },
      });
    }
  });
}
