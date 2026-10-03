import { FastifyInstance } from 'fastify';
import { NotificationModel } from '@claimboard/database';

export async function notificationRoutes(fastify: FastifyInstance) {
  // Get User Notifications
  fastify.get('/', async (request, reply) => {
    const context = await request.requireAuth();

    const notifications = await NotificationModel.find({
      organizationId: context.organizationId,
      userId: context.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await NotificationModel.countDocuments({
      organizationId: context.organizationId,
      userId: context.user.id,
      isRead: false,
    });

    return reply.send({
      success: true,
      data: {
        notifications: notifications.map((n) => ({
          ...n,
          id: n._id.toString(),
        })),
        unreadCount,
      },
    });
  });

  // Mark Single Notification as Read
  fastify.patch('/:id/read', async (request, reply) => {
    const context = await request.requireAuth();
    const { id } = request.params as any;

    await NotificationModel.updateOne(
      { _id: id, userId: context.user.id },
      { $set: { isRead: true } }
    );

    return reply.send({ success: true, data: { message: 'Marked as read' } });
  });

  // Mark All Notifications as Read
  fastify.post('/read-all', async (request, reply) => {
    const context = await request.requireAuth();

    await NotificationModel.updateMany(
      { userId: context.user.id, isRead: false },
      { $set: { isRead: true } }
    );

    return reply.send({ success: true, data: { message: 'All notifications marked as read' } });
  });
}
