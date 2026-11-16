import { FastifyInstance } from 'fastify';
import {
  DiscordGuildModel,
  DiscordChannelModel,
  DiscordRoleMappingModel,
  DiscordLogChannelModel,
  MangaModel,
  ChapterModel,
  WorkTypeModel,
  UserModel,
  WorkAssignmentModel,
  AuditLogModel,
} from '@claimboard/database';
import { API_ERROR_CODES, DiscordAssignCommandSchema } from '@claimboard/shared';
import { ProductionService } from '../../services/productionService';
import { client as discordClient } from '@claimboard/discord-bot';

export async function discordRoutes(fastify: FastifyInstance) {
  // Get Guilds & Status with server icon and text channels
  fastify.get('/guilds', async (request, reply) => {
    const context = await request.requireAuth();

    let guildsData: any[] = [];
    if (discordClient?.isReady?.() && discordClient.guilds?.cache?.size > 0) {
      guildsData = Array.from(discordClient.guilds.cache.values()).map((g: any) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL?.({ size: 64, extension: 'png' }) || null,
        memberCount: g.memberCount,
        channels: Array.from((g.channels?.cache?.values() || []) as any[])
          .filter((c: any) => c.isTextBased && c.isTextBased() && !c.isDMBased())
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name)),
      }));

      // Background sync to DiscordGuildModel for persistence
      for (const g of guildsData) {
        DiscordGuildModel.findOneAndUpdate(
          { guildId: g.id },
          {
            $set: {
              guildName: g.name,
              icon: g.icon || undefined,
              active: true,
            },
            $setOnInsert: {
              organizationId: context.organizationId,
              settings: {
                embedColor: '#6366f1',
                sendNudges: true,
                pingRolesOnAssign: true,
              },
            },
          },
          { upsert: true }
        ).catch(() => null);
      }
    }

    if (guildsData.length === 0) {
      const dbGuilds = await DiscordGuildModel.find({ organizationId: context.organizationId }).lean();
      if (dbGuilds.length > 0) {
        guildsData = dbGuilds.map((g: any) => ({
          id: g.guildId,
          name: g.guildName,
          icon: g.icon || null,
          channels: [],
        }));
      } else {
        // Fallback default server for UI setup
        guildsData = [
          {
            id: 'guild_primary',
            name: 'Primary Scanlation Server',
            icon: 'https://cdn.discordapp.com/embed/avatars/0.png',
            channels: [
              { id: '119837482901', name: 'announcements' },
              { id: '119837482902', name: 'production-claims' },
              { id: '119837482903', name: 'raw-releases' },
              { id: '119837482904', name: 'chat' },
            ],
          },
        ];
      }
    }

    return reply.send({ success: true, data: guildsData });
  });

  // Get Channel Mappings enriched with Discord guild profile picture (PFP) and server details
  fastify.get('/channels', async (request, reply) => {
    const context = await request.requireAuth();
    const channels = await DiscordChannelModel.find({ organizationId: context.organizationId })
      .populate('mangaId', 'title coverUrl')
      .lean();

    const formatted = channels.map((c: any) => {
      let gName = 'Discord Server';
      let gIcon: string | null = null;
      if (discordClient?.isReady?.()) {
        const guild = discordClient.guilds?.cache?.get(c.guildId) || discordClient.guilds?.cache?.first();
        if (guild) {
          gName = guild.name;
          gIcon = guild.iconURL?.({ size: 64, extension: 'png' }) || null;
        }
      }
      if (!gIcon) {
        gIcon = 'https://cdn.discordapp.com/embed/avatars/0.png';
      }

      return {
        id: c._id.toString(),
        guildId: c.guildId,
        guildName: gName,
        guildIcon: gIcon,
        channelId: c.channelId,
        channelName: c.channelName?.replace(/^#/, ''),
        mangaId: c.mangaId?._id?.toString(),
        mangaTitle: c.mangaId?.title || 'Unknown Manga',
        mangaCoverUrl: c.mangaId?.coverUrl,
      };
    });

    return reply.send({
      success: true,
      data: formatted,
    });
  });

  // Delete Channel Mapping
  fastify.delete('/channels/:id', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { id } = request.params as any;

    const mapping = await DiscordChannelModel.findOne({ _id: id, organizationId: context.organizationId });
    if (mapping) {
      await DiscordChannelModel.deleteOne({ _id: id, organizationId: context.organizationId });
      if (mapping.mangaId) {
        await MangaModel.updateOne(
          { _id: mapping.mangaId, discordChannelId: mapping.channelId },
          { $unset: { discordChannelId: 1 } }
        ).catch(() => null);
      }

      await AuditLogModel.create({
        organizationId: context.organizationId,
        actorId: context.user.id,
        actorName: context.user.displayName,
        action: 'DISCORD_CHANNEL_UNMAPPED',
        entity: 'DiscordChannel',
        entityId: id,
      }).catch(() => null);
    }

    return reply.send({ success: true, message: 'Channel mapping deleted' });
  });

  // Save Channel Mapping (with server/guild info & series binding)
  fastify.post('/channels', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { guildId, channelId, channelName, mangaId } = (request.body as any) || {};

    if (!channelId || !mangaId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'channelId and mangaId are required' },
      });
    }

    let resolvedGuildId = guildId;
    let resolvedChannelName = channelName;

    if (discordClient?.isReady?.()) {
      const channel = discordClient.channels?.cache?.get(channelId) as any;
      if (channel) {
        resolvedGuildId = resolvedGuildId || channel.guildId;
        resolvedChannelName = resolvedChannelName || channel.name;
      }
      if (!resolvedGuildId) {
        resolvedGuildId = discordClient.guilds?.cache?.first()?.id;
      }
    }
    resolvedGuildId = resolvedGuildId || 'guild_primary';
    resolvedChannelName = (resolvedChannelName || `channel-${channelId}`).replace(/^#/, '');

    const mapping = await DiscordChannelModel.findOneAndUpdate(
      { channelId },
      {
        $set: {
          organizationId: context.organizationId,
          guildId: resolvedGuildId,
          channelName: resolvedChannelName,
          mangaId,
        },
      },
      { upsert: true, new: true }
    );

    await MangaModel.updateOne(
      { _id: mangaId },
      { $set: { discordGuildId: resolvedGuildId, discordChannelId: channelId } }
    ).catch(() => null);

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_CHANNEL_MAPPED',
      entity: 'DiscordChannel',
      entityId: channelId,
      after: { mangaId, channelName: resolvedChannelName, guildId: resolvedGuildId },
    }).catch(() => null);

    return reply.send({ success: true, data: mapping });
  });

  // Get Available Server Roles across all connected Discord servers/guilds
  fastify.get('/server-roles', async (request, reply) => {
    await request.requireAuth();
    const { guildId } = request.query as any;

    let roles: any[] = [];
    if (discordClient?.isReady?.() && discordClient.guilds?.cache?.size > 0) {
      const targetGuilds = guildId
        ? [discordClient.guilds.cache.get(guildId)].filter(Boolean)
        : Array.from(discordClient.guilds.cache.values());

      for (const g of targetGuilds) {
        if (!g) continue;
        const gRoles = Array.from((g.roles?.cache?.values() || []) as any[])
          .filter((r: any) => r.id !== g.id) // exclude @everyone
          .map((r: any) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            hexColor: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : '#818cf8',
            isManaged: !!r.managed,
            position: r.position,
            guildId: g.id,
            guildName: g.name,
          }));
        roles.push(...gRoles);
      }
      roles.sort((a, b) => b.position - a.position);
    }

    if (roles.length === 0) {
      // Fallback roles for development or offline bot
      roles = [
        { id: 'role_tl', name: 'Translators', hexColor: '#3b82f6', isManaged: false, position: 6 },
        { id: 'role_pr', name: 'Proofreaders', hexColor: '#ec4899', isManaged: false, position: 5 },
        { id: 'role_cl', name: 'Cleaners', hexColor: '#10b981', isManaged: false, position: 4 },
        { id: 'role_rd', name: 'Redrawers', hexColor: '#f59e0b', isManaged: false, position: 3 },
        { id: 'role_ts', name: 'Typesetters', hexColor: '#8b5cf6', isManaged: false, position: 2 },
        { id: 'role_qc', name: 'Quality Checkers', hexColor: '#14b8a6', isManaged: false, position: 1 },
      ];
    }

    return reply.send({ success: true, data: roles });
  });

  // Create a new role directly in the Discord server from the website
  fastify.post('/create-role', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { guildId, name, color, hoist, mentionable } = (request.body as any) || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Role name is required' },
      });
    }

    const trimmedName = name.trim();

    if (discordClient?.isReady?.() && discordClient.guilds?.cache?.size > 0) {
      const guild = (guildId ? discordClient.guilds.cache.get(guildId) : null) || discordClient.guilds.cache.first();
      if (!guild) {
        return reply.status(404).send({
          success: false,
          error: { code: API_ERROR_CODES.DISCORD_MAPPING_NOT_FOUND, message: 'Target Discord server not found' },
        });
      }

      try {
        const createdRole = await guild.roles.create({
          name: trimmedName,
          color: color as any,
          hoist: !!hoist,
          mentionable: mentionable !== false,
          reason: `Created via ClaimBoard by ${context.user.displayName}`,
        });

        await AuditLogModel.create({
          organizationId: context.organizationId,
          actorId: context.user.id,
          actorName: context.user.displayName,
          action: 'DISCORD_ROLE_CREATED',
          entity: 'DiscordRole',
          entityId: createdRole.id,
          after: { name: createdRole.name, color: createdRole.hexColor, guildId: guild.id },
        }).catch(() => null);

        return reply.status(201).send({
          success: true,
          data: {
            id: createdRole.id,
            name: createdRole.name,
            color: createdRole.color,
            hexColor: createdRole.hexColor && createdRole.hexColor !== '#000000' ? createdRole.hexColor : '#818cf8',
            guildId: guild.id,
            guildName: guild.name,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: { code: API_ERROR_CODES.INTERNAL_SERVER_ERROR, message: err?.message || 'Failed to create role in Discord' },
        });
      }
    }

    // Mock role creation fallback
    const mockRoleId = Date.now().toString();
    return reply.status(201).send({
      success: true,
      data: {
        id: mockRoleId,
        name: trimmedName,
        hexColor: color || '#818cf8',
        guildId: 'guild_primary',
        guildName: 'Primary Scanlation Server',
      },
    });
  });

  // Configure or clear series notification Discord role from the website
  fastify.post('/series-role', async (request, reply) => {
    const context = await request.requirePermission('manga.edit');
    const { mangaId, roleId, roleName, guildId } = (request.body as any) || {};

    if (!mangaId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'mangaId is required' },
      });
    }

    const manga = await MangaModel.findOneAndUpdate(
      { _id: mangaId, organizationId: context.organizationId },
      {
        $set: {
          discordRoleId: roleId ? roleId.trim() : null,
          discordRoleName: roleName ? roleName.trim().replace(/^@/, '') : null,
          discordGuildId: guildId || null,
        },
      },
      { new: true }
    );

    if (!manga) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.MANGA_NOT_FOUND, message: 'Series not found' },
      });
    }

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: roleId ? 'MANGA_ROLE_TAG_CONFIGURED' : 'MANGA_ROLE_TAG_REMOVED',
      entity: 'Manga',
      entityId: mangaId,
      after: { discordRoleId: manga.discordRoleId, discordRoleName: manga.discordRoleName },
    }).catch(() => null);

    return reply.send({ success: true, data: manga });
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

    if (!workTypeId || !roleId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'workTypeId and roleId are required' },
      });
    }

    const mapping = await DiscordRoleMappingModel.findOneAndUpdate(
      { guildId: guildId || 'guild_primary', workTypeId },
      {
        $set: {
          organizationId: context.organizationId,
          roleId,
          roleName: roleName ? (roleName.startsWith('@') ? roleName : `@${roleName}`) : `@Role-${roleId}`,
        },
      },
      { upsert: true, new: true }
    );

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_ROLE_MAPPED',
      entity: 'DiscordRoleMapping',
      entityId: mapping._id.toString(),
      after: { workTypeId, roleId, roleName },
    });

    return reply.send({ success: true, data: mapping });
  });

  // Delete Role Mapping
  fastify.delete('/roles/:id', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { id } = request.params as any;

    await DiscordRoleMappingModel.deleteOne({ _id: id, organizationId: context.organizationId });

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_ROLE_UNMAPPED',
      entity: 'DiscordRoleMapping',
      entityId: id,
    });

    return reply.send({ success: true, message: 'Role mapping deleted' });
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

  // Get Log Channels
  fastify.get('/log-channels', async (request, reply) => {
    const context = await request.requireAuth();
    const channels = await DiscordLogChannelModel.find({
      $or: [
        { organizationId: context.organizationId },
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    return reply.send({
      success: true,
      data: channels.map((c: any) => ({
        id: c._id.toString(),
        guildId: c.guildId,
        channelId: c.channelId,
        channelName: c.channelName || `channel-${c.channelId}`,
        addedByName: c.addedByName,
        createdAt: c.createdAt,
      })),
    });
  });

  // Add Log Channel from Web
  fastify.post('/log-channels', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { guildId, channelId, channelName } = (request.body as any) || {};

    if (!channelId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'channelId is required' },
      });
    }

    const record = await DiscordLogChannelModel.findOneAndUpdate(
      { guildId: guildId || 'guild_primary', channelId: String(channelId).trim() },
      {
        $set: {
          organizationId: context.organizationId,
          channelName: channelName?.trim() || `log-${String(channelId).slice(-4)}`,
          addedById: context.user.id,
          addedByName: context.user.displayName,
        },
      },
      { upsert: true, new: true }
    );

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_LOG_CHANNEL_ADDED',
      entity: 'DiscordLogChannel',
      entityId: record._id.toString(),
      after: { channelId, channelName },
    });

    return reply.send({
      success: true,
      data: {
        id: record._id.toString(),
        guildId: record.guildId,
        channelId: record.channelId,
        channelName: record.channelName,
        addedByName: record.addedByName,
        createdAt: record.createdAt,
      },
    });
  });

  // Remove Log Channel
  fastify.delete('/log-channels/:id', async (request, reply) => {
    const context = await request.requirePermission('discord.manage');
    const { id } = request.params as any;

    await DiscordLogChannelModel.deleteOne({ _id: id });

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'DISCORD_LOG_CHANNEL_REMOVED',
      entity: 'DiscordLogChannel',
      entityId: id,
    });

    return reply.send({ success: true, message: 'Log channel removed' });
  });
}
