import { FastifyInstance } from 'fastify';
import {
  UserModel,
  RoleModel,
  SessionModel,
  AuditLogModel,
  ActivityLogModel,
  NotificationModel,
} from '@claimboard/database';
import { USER_AVAILABILITY, WORKLOAD_LEVELS, API_ERROR_CODES, SYSTEM_ROLES } from '@claimboard/shared';

export async function teamRoutes(fastify: FastifyInstance) {
  // List Team Members with Workload Status (legacy endpoint kept for compatibility)
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
        discordId: u.discordId,
        role: u.role,
        availability: u.availability || 'Available',
        workload,
        activeClaimsCount: activeCount,
        completedTasksCount: u.completedTasksCount || 0,
        averageCompletionHours: u.completedTasksCount ? Math.round(((u.completedTasksCount * 3.5) / u.completedTasksCount) * 10) / 10 : 0,
        dueTodayCount: 0,
        overdueCount: 0,
        isApproved: Boolean(u.isApproved),
        approvedBy: u.approvedBy,
        approvedAt: u.approvedAt,
        createdAt: u.createdAt,
      };
    });

    return reply.send({ success: true, data: team });
  });

  // Comprehensive User Directory & Approval Listing
  fastify.get('/users', async (request, reply) => {
    const context = await request.requirePermission('users.view');
    const { status = 'all', search } = (request.query as { status?: string; search?: string }) || {};

    const query: any = { organizationId: context.organizationId };

    if (status === 'pending') {
      query.isApproved = false;
    } else if (status === 'approved') {
      query.isApproved = true;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { displayName: regex },
        { username: regex },
        { email: regex },
        { discordUsername: regex },
      ];
    }

    const [allUsers, totalCount, pendingCount, approvedCount] = await Promise.all([
      UserModel.find(query).sort({ isApproved: 1, createdAt: -1 }).lean(),
      UserModel.countDocuments({ organizationId: context.organizationId }),
      UserModel.countDocuments({ organizationId: context.organizationId, isApproved: false }),
      UserModel.countDocuments({ organizationId: context.organizationId, isApproved: true }),
    ]);

    const formatted = allUsers.map((u) => {
      const activeCount = u.activeClaimsCount || 0;
      let workload = 'Low';
      if (activeCount >= 5) workload = 'Overloaded';
      else if (activeCount >= 3) workload = 'High';
      else if (activeCount >= 1) workload = 'Normal';

      return {
        id: u._id.toString(),
        username: u.username,
        displayName: u.displayName,
        email: u.email || '',
        avatarUrl: u.avatarUrl || '',
        discordId: u.discordId || '',
        discordUsername: u.discordUsername || '',
        role: u.role,
        availability: u.availability || 'Available',
        workload,
        activeClaimsCount: activeCount,
        completedTasksCount: u.completedTasksCount || 0,
        isApproved: Boolean(u.isApproved),
        approvedBy: u.approvedBy || null,
        approvedAt: u.approvedAt || null,
        createdAt: u.createdAt,
      };
    });

    return reply.send({
      success: true,
      data: {
        users: formatted,
        stats: {
          total: totalCount,
          pending: pendingCount,
          approved: approvedCount,
        },
      },
    });
  });

  // Approve Pending User (1-click approval)
  fastify.patch('/users/:userId/approve', async (request, reply) => {
    const context = await request.requirePermission('users.edit');
    const { userId } = request.params as any;
    const { role } = (request.body as { role?: string }) || {};

    const user = await UserModel.findOne({ _id: userId, organizationId: context.organizationId });
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'User not found in organization' },
      });
    }

    const previousRole = user.role;
    user.isApproved = true;
    user.approvedBy = context.user.displayName;
    user.approvedAt = new Date();
    if (role && SYSTEM_ROLES.includes(role as any)) {
      user.role = role;
    }
    await user.save();

    // Log to Audit Log
    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'USER_APPROVED',
      entity: 'User',
      entityId: user._id.toString(),
      before: { isApproved: false, role: previousRole },
      after: { isApproved: true, role: user.role, approvedBy: context.user.displayName },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // Log to Activity Feed
    await ActivityLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'Approved account access',
      entityType: 'User',
      entityId: user._id,
      entityName: user.displayName,
      metadata: { role: user.role, username: user.username },
    });

    // Notify User
    await NotificationModel.create({
      organizationId: context.organizationId,
      userId: user._id,
      title: 'Workspace Access Approved',
      message: `Your account has been approved by ${context.user.displayName}. Welcome to the scanlation workspace!`,
      type: 'system',
      linkUrl: '/dashboard',
    });

    return reply.send({
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        isApproved: true,
        approvedBy: user.approvedBy,
        approvedAt: user.approvedAt,
      },
    });
  });

  // Create / Invite New User directly
  fastify.post('/users', async (request, reply) => {
    const context = await request.requirePermission('users.create');
    const body = (request.body as any) || {};

    const username = (body.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const displayName = (body.displayName || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const role = body.role || 'Worker';
    const discordUsername = (body.discordUsername || '').trim();
    const discordId = (body.discordId || '').trim();

    if (!username || !displayName) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Username and display name are required' },
      });
    }

    // Check duplicate
    const existing = await UserModel.findOne({
      organizationId: context.organizationId,
      $or: [{ username }, ...(email ? [{ email }] : [])],
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE_USER', message: 'A user with this username or email already exists' },
      });
    }

    const newUser = await UserModel.create({
      organizationId: context.organizationId,
      username,
      displayName,
      email: email || `${username}@claimboard.local`,
      role: SYSTEM_ROLES.includes(role) ? role : 'Worker',
      discordId: discordId || undefined,
      discordUsername: discordUsername || undefined,
      avatarUrl: body.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96',
      availability: 'Available',
      workload: 'Normal',
      isApproved: true,
      approvedBy: context.user.displayName,
      approvedAt: new Date(),
      activeClaimsCount: 0,
      completedTasksCount: 0,
    });

    // Audit Log
    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: newUser._id.toString(),
      after: { username: newUser.username, role: newUser.role, displayName: newUser.displayName },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: newUser._id.toString(),
        username: newUser.username,
        displayName: newUser.displayName,
        email: newUser.email,
        role: newUser.role,
        isApproved: true,
        approvedBy: newUser.approvedBy,
        createdAt: newUser.createdAt,
      },
    });
  });

  // Remove / Reject User
  fastify.delete('/users/:userId', async (request, reply) => {
    const context = await request.requirePermission('users.delete');
    const { userId } = request.params as any;

    if (userId === context.user.id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot remove your own administrator account' },
      });
    }

    const user = await UserModel.findOne({ _id: userId, organizationId: context.organizationId });
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'User not found' },
      });
    }

    await UserModel.deleteOne({ _id: userId, organizationId: context.organizationId });
    await SessionModel.deleteMany({ userId });

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'USER_DELETED',
      entity: 'User',
      entityId: userId,
      before: { username: user.username, role: user.role, displayName: user.displayName },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: { message: `User ${user.displayName} (${user.username}) removed successfully` },
    });
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

    if (!SYSTEM_ROLES.includes(role)) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Invalid system role' },
      });
    }

    const user = await UserModel.findOne({ _id: userId, organizationId: context.organizationId });
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'User not found' },
      });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'ROLE_CHANGED',
      entity: 'User',
      entityId: userId,
      before: { role: oldRole },
      after: { role },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ success: true, data: { id: user._id.toString(), role: user.role } });
  });

  // List Roles
  fastify.get('/roles', async (request, reply) => {
    const context = await request.requireAuth();
    const roles = await RoleModel.find({ organizationId: context.organizationId }).lean();
    return reply.send({ success: true, data: roles });
  });
}
