import { FastifyInstance } from 'fastify';
import { UserModel, RoleModel, WorkAssignmentModel, ClaimModel } from '@claimboard/database';
import { USER_AVAILABILITY, WORKLOAD_LEVELS, API_ERROR_CODES } from '@claimboard/shared';

export async function teamRoutes(fastify: FastifyInstance) {
  // List Team Members with Workload Status
  fastify.get('/workload', async (request, reply) => {
    const context = await request.requireAuth();

    const users = await UserModel.find({ organizationId: context.organizationId }).lean();

    const team = users.map((u) => {
      const activeCount = u.activeClaimsCount || 0;
      let workload = 'Low';
      if (activeCount >= 5) workload = 'Overloaded';
      else if (activeCount >= 3) workload = 'High';
      else if (activeCount >= 1) workload = 'Normal';

      return {
        id: u._id.toString(),
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        discordUsername: u.discordUsername,
        role: u.role,
        availability: u.availability || 'Available',
        workload,
        activeClaimsCount: activeCount,
        completedTasksCount: u.completedTasksCount || 0,
        averageCompletionHours: 4.1,
        dueTodayCount: 0,
        overdueCount: 0,
      };
    });

    return reply.send({ success: true, data: team });
  });

  // Worker Updates Their Own Availability
  fastify.patch('/availability', async (request, reply) => {
    const context = await request.requireAuth();
    const { availability } = (request.body as any) || {};

    if (!USER_AVAILABILITY.includes(availability)) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Invalid availability status' },
      });
    }

    const updated = await UserModel.findOneAndUpdate(
      { _id: context.user.id },
      { $set: { availability } },
      { new: true }
    );

    return reply.send({ success: true, data: { availability: updated?.availability } });
  });

  // Admin Change User Role
  fastify.patch('/users/:userId/role', async (request, reply) => {
    const context = await request.requirePermission('users.edit');
    const { userId } = request.params as any;
    const { role } = (request.body as any) || {};

    const updated = await UserModel.findOneAndUpdate(
      { _id: userId, organizationId: context.organizationId },
      { $set: { role } },
      { new: true }
    );

    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'User not found' } });
    }

    return reply.send({ success: true, data: updated });
  });

  // List Roles
  fastify.get('/roles', async (request, reply) => {
    const context = await request.requireAuth();
    const roles = await RoleModel.find({ organizationId: context.organizationId }).lean();
    return reply.send({ success: true, data: roles });
  });
}
