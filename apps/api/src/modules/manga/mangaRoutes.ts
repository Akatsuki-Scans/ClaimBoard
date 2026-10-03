import { FastifyInstance } from 'fastify';
import { MangaModel, ChapterModel, WorkAssignmentModel, ActivityLogModel, AuditLogModel, DiscordChannelModel } from '@claimboard/database';
import { CreateMangaSchema, UpdateMangaSchema, API_ERROR_CODES } from '@claimboard/shared';

export async function mangaRoutes(fastify: FastifyInstance) {
  // List Manga
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();
    const { status, search } = request.query as any;

    const filter: any = { organizationId: context.organizationId };
    if (status && status !== 'All') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const mangas = await MangaModel.find(filter).sort({ updatedAt: -1 }).lean();

    return reply.send({
      success: true,
      data: mangas.map((m) => ({
        id: m._id.toString(),
        title: m.title,
        altTitles: m.altTitles,
        coverUrl: m.coverUrl,
        description: m.description,
        author: m.author,
        artist: m.artist,
        status: m.status,
        language: m.language,
        tags: m.tags,
        genres: m.genres,
        sourceUrl: m.sourceUrl,
        discordRoleId: m.discordRoleId,
        discordRoleName: m.discordRoleName,
        discordChannelId: m.discordChannelId,
        releaseSchedule: m.releaseSchedule,
        totalChapters: m.totalChapters || 0,
        completedChapters: m.completedChapters || 0,
        activeChapters: m.activeChapters || 0,
        openTasksCount: m.openTasksCount || 0,
        claimedTasksCount: m.claimedTasksCount || 0,
        overdueTasksCount: m.overdueTasksCount || 0,
        createdAt: (m as any).createdAt,
        updatedAt: (m as any).updatedAt,
      })),
    });
  });

  // Get Single Manga by ID with populated info
  fastify.get('/:id', async (request, reply) => {
    const context = await request.requireAuth();
    const { id } = request.params as any;

    const manga = await MangaModel.findOne({ _id: id, organizationId: context.organizationId }).lean();
    if (!manga) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' },
      });
    }

    // Also look up discord channel mapping if any
    const discordMapping = await DiscordChannelModel.findOne({ mangaId: manga._id }).lean();

    // Look up recent chapters
    const chapters = await ChapterModel.find({ mangaId: manga._id }).sort({ createdAt: -1 }).limit(10).lean();

    return reply.send({
      success: true,
      data: {
        ...manga,
        id: manga._id.toString(),
        discordChannel: discordMapping ? { id: discordMapping.channelId, name: discordMapping.channelName } : null,
        recentChapters: chapters.map((c) => ({
          id: c._id.toString(),
          chapterNumber: c.chapterNumber,
          title: c.title,
          status: c.status,
          priority: c.priority,
        })),
      },
    });
  });

  // Create Manga
  fastify.post('/', async (request, reply) => {
    const context = await request.requirePermission('manga.create');
    const parse = CreateMangaSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const manga = await MangaModel.create({
      ...parse.data,
      organizationId: context.organizationId,
    });

    await ActivityLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: `Created new manga: ${manga.title}`,
      entityType: 'manga',
      entityId: manga._id,
      entityName: manga.title,
    });

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'MANGA_CREATED',
      entity: 'Manga',
      entityId: manga._id.toString(),
      after: manga.toObject(),
    });

    return reply.status(201).send({
      success: true,
      data: { id: manga._id.toString(), ...manga.toObject() },
    });
  });

  // Update Manga
  fastify.put('/:id', async (request, reply) => {
    const context = await request.requirePermission('manga.edit');
    const { id } = request.params as any;

    const parse = UpdateMangaSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: parse.error.errors[0]?.message || 'Validation error' },
      });
    }

    const previous = await MangaModel.findOne({ _id: id, organizationId: context.organizationId });
    if (!previous) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' },
      });
    }

    const updated = await MangaModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: parse.data },
      { new: true }
    );

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'MANGA_UPDATED',
      entity: 'Manga',
      entityId: id,
      before: previous.toObject(),
      after: updated?.toObject(),
    });

    return reply.send({ success: true, data: updated });
  });

  // Archive Manga
  fastify.delete('/:id', async (request, reply) => {
    const context = await request.requirePermission('manga.delete');
    const { id } = request.params as any;

    const manga = await MangaModel.findOneAndUpdate(
      { _id: id, organizationId: context.organizationId },
      { $set: { status: 'Archived' } },
      { new: true }
    );

    if (!manga) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Manga not found' } });
    }

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'MANGA_ARCHIVED',
      entity: 'Manga',
      entityId: id,
    });

    return reply.send({ success: true, data: { message: 'Manga archived successfully' } });
  });
}
