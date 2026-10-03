import { FastifyInstance } from 'fastify';
import {
  DiscordGuildModel,
  DiscordChannelModel,
  DiscordRoleMappingModel,
  MangaModel,
  ChapterModel,
  WorkTypeModel,
  UserModel,
  WorkAssignmentModel,
  AuditLogModel,
} from '@claimboard/database';
import { API_ERROR_CODES, DiscordAssignCommandSchema } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';

export async function discordRoutes(fastify: FastifyInstance) {
  // Get Guilds & Status
  fastify.get('/guilds', async (request, reply) => {
    const context = await request.requireAuth();
    const guilds = await DiscordGuildModel.find({ organizationId: context.organizationId }).lean();
    return reply.send({ success: true, data: guilds });
  });

  // Get Channel Mappings
  fastify.get('/channels', async (request, reply) => {
    const context = await request.requireAuth();
    const channels = await DiscordChannelModel.find({ organizationId: context.organizationId })
      .populate('mangaId', 'title coverUrl')
      .lean();

    return reply.send({
      success: true,
      data: channels.map((c: any) => ({
        id: c._id.toString(),
        guildId: c.guildId,
        channelId: c.channelId,
        channelName: c.channelName,
        mangaId: c.mangaId?._id?.toString(),
        mangaTitle: c.mangaId?.title || 'Unknown Manga',
      })),
    });
  });

  // Save Channel Mapping (Specification #40 & #67)
  fastify.post('/channels', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { guildId, channelId, channelName, mangaId } = (request.body as any) || {};

    if (!channelId || !mangaId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'channelId and mangaId are required' },
      });
    }

    const mapping = await DiscordChannelModel.findOneAndUpdate(
      { guildId: guildId || 'guild_primary', channelId },
      {
        $set: {
          organizationId: context.organizationId,
          channelName: channelName || `#channel-${channelId}`,
          mangaId,
        },
      },
      { upsert: true, new: true }
    );

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_CHANNEL_MAPPED',
      entity: 'DiscordChannel',
      entityId: channelId,
      after: { mangaId, channelName },
    });

    return reply.send({ success: true, data: mapping });
  });

  // Get Role Mappings (Specification #41)
  fastify.get('/roles', async (request, reply) => {
    const context = await request.requireAuth();
    const mappings = await DiscordRoleMappingModel.find({ organizationId: context.organizationId })
      .populate('workTypeId')
      .lean();

    return reply.send({
      success: true,
      data: mappings.map((m: any) => ({
        id: m._id.toString(),
        guildId: m.guildId,
        roleId: m.roleId,
        roleName: m.roleName,
        workTypeId: m.workTypeId?._id?.toString(),
        workTypeName: m.workTypeId?.name,
      })),
    });
  });

  // Save Role Mapping
  fastify.post('/roles', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { guildId, roleId, roleName, workTypeId } = (request.body as any) || {};

    const mapping = await DiscordRoleMappingModel.findOneAndUpdate(
      { guildId: guildId || 'guild_primary', workTypeId },
      {
        $set: {
          organizationId: context.organizationId,
          roleId,
          roleName: roleName || `@Role-${roleId}`,
        },
      },
      { upsert: true, new: true }
    );

    return reply.send({ success: true, data: mapping });
  });

  // Discord Slash Command Webhook: /assign (Specification #11)
  fastify.post('/slash/assign', async (request, reply) => {
    const { guildId, channelId, mangaId: overrideMangaId, chapterNumber, volumeNumber, workTypeCodes, callerUserId, description } =
      request.body as any;

    // Detect manga from channel ID
    let manga = null;
    if (overrideMangaId) {
      manga = await MangaModel.findById(overrideMangaId);
    } else {
      const channelMapping = await DiscordChannelModel.findOne({ channelId });
      if (channelMapping) {
        manga = await MangaModel.findById(channelMapping.mangaId);
      }
    }

    if (!manga) {
      return reply.status(404).send({
        success: false,
        error: {
          code: API_ERROR_CODES.DISCORD_MAPPING_NOT_FOUND,
          message: 'No manga is mapped to this Discord channel. Please specify manga or map this channel.',
        },
      });
    }

    // Find or create chapter
    let chapter = await ChapterModel.findOne({ mangaId: manga._id, chapterNumber });
    if (!chapter) {
      chapter = await ChapterModel.create({
        organizationId: manga.organizationId,
        mangaId: manga._id,
        chapterNumber,
        volumeNumber,
        status: 'In_Production',
      });
      await MangaModel.updateOne({ _id: manga._id }, { $inc: { totalChapters: 1, activeChapters: 1 } });
    }

    // Resolve work types
    const workTypes = await WorkTypeModel.find({
      organizationId: manga.organizationId,
      code: { $in: workTypeCodes.map((c: string) => c.toUpperCase()) },
    });

    if (!workTypes.length) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'No valid work types matched' },
      });
    }

    // Resolve user or fallback to system admin
    let user = await UserModel.findOne({ discordId: callerUserId });
    if (!user) {
      user = await UserModel.findOne({ organizationId: manga.organizationId, role: 'Administrator' });
    }

    const createdAssignments = await ProductionService.assignWork({
      organizationId: manga.organizationId.toString(),
      mangaId: manga._id.toString(),
      chapterId: chapter._id.toString(),
      workTypeIds: workTypes.map((wt) => wt._id.toString()),
      dependsOnPreviousInOrder: true,
      actorId: user ? user._id.toString() : manga.organizationId.toString(),
      actorName: user ? user.displayName : 'Discord Bot',
    });

    // Lookup role mappings to ping
    const roleMappings = await DiscordRoleMappingModel.find({
      workTypeId: { $in: workTypes.map((wt) => wt._id) },
    }).lean();

    const rolesToPing = roleMappings.map((rm) => `<@&${rm.roleId}>`).join(' ');

    return reply.send({
      success: true,
      data: {
        mangaTitle: manga.title,
        chapterNumber,
        assignments: createdAssignments.map((a: any) => ({
          id: a._id.toString(),
          workTypeId: a.workTypeId.toString(),
          status: a.status,
        })),
        rolesToPing,
        embed: {
          title: `📢 New Chapter Announced: ${manga.title} — Ch. ${chapterNumber}`,
          description: description || `Production tasks are now open for claiming!`,
          color: 0x6366f1,
          fields: [
            { name: 'Manga', value: manga.title, inline: true },
            { name: 'Chapter', value: chapterNumber, inline: true },
            { name: 'Open Tasks', value: workTypes.map((wt) => `• **${wt.name}** (\`${wt.code}\`)`).join('\n') },
          ],
        },
      },
    });
  });

  // Discord Slash Command: /seeclaims (Specification #16)
  fastify.post('/slash/seeclaims', async (request, reply) => {
    const { channelId, mangaTitle } = request.body as any;

    let manga = null;
    if (mangaTitle) {
      manga = await MangaModel.findOne({ title: { $regex: mangaTitle, $options: 'i' } });
    } else {
      const channelMapping = await DiscordChannelModel.findOne({ channelId });
      if (channelMapping) manga = await MangaModel.findById(channelMapping.mangaId);
    }

    if (!manga) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Could not determine manga for this channel.' },
      });
    }

    const latestChapter = await ChapterModel.findOne({ mangaId: manga._id }).sort({ createdAt: -1 });
    if (!latestChapter) {
      return reply.send({
        success: true,
        data: { message: `No chapters in production for ${manga.title}.` },
      });
    }

    const assignments = await WorkAssignmentModel.find({ chapterId: latestChapter._id })
      .populate('workTypeId')
      .lean();

    const claimsList = assignments.map((a: any) => ({
      workType: a.workTypeId?.name || 'Task',
      status: a.status,
      worker: a.assignedWorkerName || 'Open',
    }));

    return reply.send({
      success: true,
      data: {
        mangaTitle: manga.title,
        chapterNumber: latestChapter.chapterNumber,
        claims: claimsList,
      },
    });
  });
}
