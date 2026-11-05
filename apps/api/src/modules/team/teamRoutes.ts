import { FastifyInstance } from 'fastify';
import {
  UserModel,
  RoleModel,
  SessionModel,
  AuditLogModel,
  ActivityLogModel,
  NotificationModel,
  TeamModel,
  MangaModel,
} from '@claimboard/database';
import { USER_AVAILABILITY, WORKLOAD_LEVELS, API_ERROR_CODES, SYSTEM_ROLES } from '@claimboard/shared';

function canManageTeam(user: any): boolean {
  if (!user) return false;
  return (
    user.role === 'Administrator' ||
    user.role === 'Owner' ||
    user.role === 'Manager' ||
    (Array.isArray(user.permissions) &&
      (user.permissions.includes('users.edit') || user.permissions.includes('manga.edit')))
  );
}

export async function teamRoutes(fastify: FastifyInstance) {
  // List Approved Team Members with Workload Status (Bug fix: strictly filter isApproved: true)
  fastify.get('/workload', async (request, reply) => {
    const context = await request.requireAuth();

    // Fix: Only return members who have been approved by an administrator
    const users = await UserModel.find({
      organizationId: context.organizationId,
      isApproved: true,
    }).lean();

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

  // =========================================================
  // MANGA TEAMS & CREW MANAGEMENT
  // =========================================================

  // 1. List All Manga Teams (Visible to all authenticated staff)
  fastify.get('/teams', async (request, reply) => {
    const context = await request.requireAuth();

    const rawTeams = await TeamModel.find({ organizationId: context.organizationId })
      .populate('mangaId', 'title coverUrl status discordRoleId discordRoleName')
      .sort({ createdAt: -1 })
      .lean();

    // Gather all user IDs from all team members
    const userIds = new Set<string>();
    rawTeams.forEach((t: any) => {
      (t.members || []).forEach((m: any) => {
        if (m.userId) userIds.add(m.userId.toString());
      });
    });

    const users = await UserModel.find({
      _id: { $in: Array.from(userIds) },
      organizationId: context.organizationId,
    }).lean();

    const userMap = new Map<string, any>(users.map((u) => [u._id.toString(), u]));

    const formattedTeams = rawTeams.map((t: any) => {
      const manga = t.mangaId;
      const discordRoleId = t.discordRoleId || manga?.discordRoleId || null;
      const discordRoleName = t.discordRoleName || manga?.discordRoleName || null;

      const populatedMembers = (t.members || [])
        .map((m: any) => {
          const u = userMap.get(m.userId?.toString());
          if (!u) return null;
          return {
            id: u._id.toString(),
            userId: u._id.toString(),
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl || '',
            discordUsername: u.discordUsername || '',
            discordId: u.discordId || '',
            systemRole: u.role,
            teamRole: m.role || 'Member',
            availability: u.availability || 'Available',
            workload: u.workload || 'Normal',
            activeClaimsCount: u.activeClaimsCount || 0,
            completedTasksCount: u.completedTasksCount || 0,
            joinedAt: m.joinedAt,
          };
        })
        .filter(Boolean);

      return {
        id: t._id.toString(),
        name: t.name,
        description: t.description || '',
        manga: manga
          ? {
              id: manga._id.toString(),
              title: manga.title,
              coverUrl: manga.coverUrl || '',
              status: manga.status,
              discordRoleId: manga.discordRoleId || null,
              discordRoleName: manga.discordRoleName || null,
            }
          : null,
        discordRoleId,
        discordRoleName,
        members: populatedMembers,
        memberCount: populatedMembers.length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    return reply.send({ success: true, data: formattedTeams });
  });

  // 2. Create Manga Team (Admins & Managers Only)
  fastify.post('/teams', async (request, reply) => {
    const context = await request.requireAuth();

    if (!canManageTeam(context.user)) {
      return reply.status(403).send({
        success: false,
        error: { code: API_ERROR_CODES.INSUFFICIENT_PERMISSION, message: 'Only administrators and managers can create teams' },
      });
    }

    const body = (request.body as any) || {};
    const name = (body.name || '').trim();
    const mangaId = body.mangaId || null;
    const description = (body.description || '').trim();
    let discordRoleId = body.discordRoleId?.trim() || null;
    let discordRoleName = body.discordRoleName?.trim() || null;
    const initialMembers = Array.isArray(body.members) ? body.members : [];

    if (!name) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'Team name is required' },
      });
    }

    let manga: any = null;
    if (mangaId) {
      manga = await MangaModel.findOne({ _id: mangaId, organizationId: context.organizationId });
      if (manga) {
        if (!discordRoleId && manga.discordRoleId) discordRoleId = manga.discordRoleId;
        if (!discordRoleName && manga.discordRoleName) discordRoleName = manga.discordRoleName;
      }
    }

    // Build initial members
    const validMembers: any[] = [];
    for (const m of initialMembers) {
      if (m.userId) {
        const u = await UserModel.findOne({ _id: m.userId, organizationId: context.organizationId, isApproved: true });
        if (u) {
          validMembers.push({
            userId: u._id,
            role: m.role || 'Member',
            joinedAt: new Date(),
          });
        }
      }
    }

    const team = await TeamModel.create({
      organizationId: context.organizationId,
      name,
      mangaId: manga?._id || undefined,
      description,
      discordRoleId: discordRoleId || undefined,
      discordRoleName: discordRoleName || undefined,
      members: validMembers,
      createdBy: context.user.id,
    });

    // Notify initial members
    for (const member of validMembers) {
      await NotificationModel.create({
        organizationId: context.organizationId,
        userId: member.userId,
        title: 'Added to Manga Team',
        message: `You were added to the team "${team.name}"${manga ? ` for series "${manga.title}"` : ''} as ${member.role || 'Team Member'}.`,
        type: 'team',
        linkUrl: '/team',
      });
    }

    // Audit Log
    await AuditLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'TEAM_CREATED',
      entity: 'Team',
      entityId: team._id.toString(),
      after: { name: team.name, mangaId: team.mangaId, memberCount: validMembers.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: team._id.toString(),
        name: team.name,
        description: team.description,
        manga: manga ? { id: manga._id.toString(), title: manga.title, coverUrl: manga.coverUrl } : null,
        discordRoleId,
        discordRoleName,
        memberCount: validMembers.length,
      },
    });
  });

  // 3. Update Manga Team (Admins & Managers Only)
  fastify.patch('/teams/:teamId', async (request, reply) => {
    const context = await request.requireAuth();

    if (!canManageTeam(context.user)) {
      return reply.status(403).send({
        success: false,
        error: { code: API_ERROR_CODES.INSUFFICIENT_PERMISSION, message: 'Only administrators and managers can update teams' },
      });
    }

    const { teamId } = request.params as any;
    const body = (request.body as any) || {};

    const team = await TeamModel.findOne({ _id: teamId, organizationId: context.organizationId });
    if (!team) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' },
      });
    }

    if (body.name !== undefined) team.name = body.name.trim();
    if (body.description !== undefined) team.description = body.description.trim();
    if (body.discordRoleId !== undefined) team.discordRoleId = body.discordRoleId?.trim() || undefined;
    if (body.discordRoleName !== undefined) team.discordRoleName = body.discordRoleName?.trim() || undefined;

    if (body.mangaId !== undefined) {
      if (body.mangaId) {
        const manga = await MangaModel.findOne({ _id: body.mangaId, organizationId: context.organizationId });
        if (manga) {
          team.mangaId = manga._id;
          if (!body.discordRoleId && manga.discordRoleId) team.discordRoleId = manga.discordRoleId;
          if (!body.discordRoleName && manga.discordRoleName) team.discordRoleName = manga.discordRoleName;
        }
      } else {
        team.mangaId = undefined;
      }
    }

    await team.save();

    return reply.send({
      success: true,
      data: {
        id: team._id.toString(),
        name: team.name,
        description: team.description,
        discordRoleId: team.discordRoleId,
        discordRoleName: team.discordRoleName,
      },
    });
  });

  // 4. Delete Manga Team (Admins & Managers Only)
  fastify.delete('/teams/:teamId', async (request, reply) => {
    const context = await request.requireAuth();

    if (!canManageTeam(context.user)) {
      return reply.status(403).send({
        success: false,
        error: { code: API_ERROR_CODES.INSUFFICIENT_PERMISSION, message: 'Only administrators and managers can delete teams' },
      });
    }

    const { teamId } = request.params as any;
    const team = await TeamModel.findOne({ _id: teamId, organizationId: context.organizationId });
    if (!team) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' },
      });
    }

    await TeamModel.deleteOne({ _id: teamId, organizationId: context.organizationId });

    return reply.send({ success: true, data: { message: `Team ${team.name} removed successfully` } });
  });

  // 5. Add Member to Manga Team with Live Notification (Admins & Managers Only)
  fastify.post('/teams/:teamId/members', async (request, reply) => {
    const context = await request.requireAuth();

    if (!canManageTeam(context.user)) {
      return reply.status(403).send({
        success: false,
        error: { code: API_ERROR_CODES.INSUFFICIENT_PERMISSION, message: 'Only administrators and managers can add team members' },
      });
    }

    const { teamId } = request.params as any;
    const body = (request.body as any) || {};
    const { userId, role } = body;

    if (!userId) {
      return reply.status(400).send({
        success: false,
        error: { code: API_ERROR_CODES.VALIDATION_ERROR, message: 'User ID is required' },
      });
    }

    const [team, user] = await Promise.all([
      TeamModel.findOne({ _id: teamId, organizationId: context.organizationId }),
      UserModel.findOne({ _id: userId, organizationId: context.organizationId, isApproved: true }),
    ]);

    if (!team) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' },
      });
    }

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: API_ERROR_CODES.USER_NOT_FOUND, message: 'Approved user not found' },
      });
    }

    // Check if already in team
    const existingIndex = team.members.findIndex((m) => m.userId.toString() === userId);
    if (existingIndex >= 0) {
      // Update existing role
      team.members[existingIndex].role = role || team.members[existingIndex].role || 'Member';
    } else {
      team.members.push({
        userId: user._id,
        role: role || 'Member',
        joinedAt: new Date(),
      });
    }

    await team.save();

    // Look up Manga title for the notification
    let mangaTitle = '';
    if (team.mangaId) {
      const manga = await MangaModel.findById(team.mangaId).lean();
      if (manga) mangaTitle = manga.title;
    }

    // Send In-App Notification to User
    await NotificationModel.create({
      organizationId: context.organizationId,
      userId: user._id,
      title: 'Added to Manga Team',
      message: `You were added to the team "${team.name}"${mangaTitle ? ` for "${mangaTitle}"` : ''} as ${role || 'Team Member'}.`,
      type: 'team',
      linkUrl: '/team',
    });

    // Record Activity
    await ActivityLogModel.create({
      organizationId: context.organizationId,
      actorId: context.user.id,
      actorName: context.user.displayName,
      action: 'Added member to manga team',
      entityType: 'Team',
      entityId: team._id,
      entityName: team.name,
      metadata: { memberName: user.displayName, role: role || 'Member', mangaTitle },
    });

    return reply.send({
      success: true,
      data: {
        message: `${user.displayName} added to ${team.name}`,
        memberCount: team.members.length,
      },
    });
  });

  // 6. Remove Member from Manga Team with Live Notification (Admins & Managers Only)
  fastify.delete('/teams/:teamId/members/:userId', async (request, reply) => {
    const context = await request.requireAuth();

    if (!canManageTeam(context.user)) {
      return reply.status(403).send({
        success: false,
        error: { code: API_ERROR_CODES.INSUFFICIENT_PERMISSION, message: 'Only administrators and managers can remove team members' },
      });
    }

    const { teamId, userId } = request.params as any;

    const [team, user] = await Promise.all([
      TeamModel.findOne({ _id: teamId, organizationId: context.organizationId }),
      UserModel.findOne({ _id: userId, organizationId: context.organizationId }),
    ]);

    if (!team) {
      return reply.status(404).send({
        success: false,
        error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' },
      });
    }

    const initialCount = team.members.length;
    team.members = team.members.filter((m) => m.userId.toString() !== userId);

    if (team.members.length === initialCount) {
      return reply.status(404).send({
        success: false,
        error: { code: 'MEMBER_NOT_IN_TEAM', message: 'User is not a member of this team' },
      });
    }

    await team.save();

    // Look up Manga title for the notification
    let mangaTitle = '';
    if (team.mangaId) {
      const manga = await MangaModel.findById(team.mangaId).lean();
      if (manga) mangaTitle = manga.title;
    }

    // Send In-App Notification to User
    if (user) {
      await NotificationModel.create({
        organizationId: context.organizationId,
        userId: user._id,
        title: 'Removed from Manga Team',
        message: `You were removed from the team "${team.name}"${mangaTitle ? ` for "${mangaTitle}"` : ''}.`,
        type: 'team',
        linkUrl: '/team',
      });

      // Record Activity
      await ActivityLogModel.create({
        organizationId: context.organizationId,
        actorId: context.user.id,
        actorName: context.user.displayName,
        action: 'Removed member from manga team',
        entityType: 'Team',
        entityId: team._id,
        entityName: team.name,
        metadata: { memberName: user.displayName, mangaTitle },
      });
    }

    return reply.send({
      success: true,
      data: {
        message: `Member removed from ${team.name}`,
        memberCount: team.members.length,
      },
    });
  });
}
