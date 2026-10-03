import { FastifyInstance } from 'fastify';
import { AuditLogModel, ActivityLogModel } from '@claimboard/database';

export async function auditRoutes(fastify: FastifyInstance) {
  // Audit Logs (Specification #38)
  fastify.get('/', async (request, reply) => {
    const context = await request.requirePermission('audit.view');
    const { entity, actorId, limit = 50 } = request.query as any;

    const filter: any = { organizationId: context.organizationId };
    if (entity) filter.entity = entity;
    if (actorId) filter.actorId = actorId;

    const logs = await AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return reply.send({
      success: true,
      data: logs.map((l) => ({ ...l, id: l._id.toString() })),
    });
  });

  // Contextual Activity Feed (Specification #39)
  fastify.get('/activity', async (request, reply) => {
    const context = await request.requireAuth();
    const { entityType, entityId, limit = 30 } = request.query as any;

    const filter: any = { organizationId: context.organizationId };
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    const feed = await ActivityLogModel.find(filter)
      .populate('actorId', 'displayName avatarUrl discordUsername email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    return reply.send({
      success: true,
      data: feed.map((f: any) => {
        const actor = typeof f.actorId === 'object' && f.actorId !== null ? f.actorId : null;
        const isCurrentUser =
          actor?._id?.toString() === context.user.id ||
          f.actorId?.toString() === context.user.id ||
          f.actorName === context.user.displayName;

        const avatar =
          actor?.avatarUrl ||
          (isCurrentUser ? context.user.avatarUrl : undefined) ||
          (f.metadata as any)?.avatarUrl;

        return {
          ...f,
          id: f._id.toString(),
          actorId: actor?._id?.toString() || f.actorId?.toString(),
          actorName: actor?.displayName || f.actorName,
          actorAvatarUrl: avatar,
        };
      }),
    });
  });
}
