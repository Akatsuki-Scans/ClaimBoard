import { FastifyInstance } from 'fastify';
import { UserModel, SessionModel, OrganizationModel } from '@claimboard/database';
import { createSession } from '@claimboard/auth';
import { API_ERROR_CODES } from '@claimboard/shared';

export async function authRoutes(fastify: FastifyInstance) {
  // GET Discord OAuth Entry - Redirects user to Discord Authorization URL
  fastify.get('/oauth/discord', async (request, reply) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const apiUrl = process.env.API_URL || 'http://localhost:4000';
    const redirectUri = `${apiUrl}/api/auth/oauth/discord/callback`;

    if (!clientId) {
      return reply.status(500).send({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'DISCORD_CLIENT_ID is not configured in .env' },
      });
    }

    const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=identify%20email`;

    return reply.redirect(discordAuthUrl);
  });

  // GET Discord OAuth Callback - Receives code from Discord, fetches Discord user profile, creates session
  fastify.get('/oauth/discord/callback', async (request, reply) => {
    const { code } = (request.query as { code?: string }) || {};
    const webUrl = process.env.WEB_URL || 'http://localhost:5173';
    const apiUrl = process.env.API_URL || 'http://localhost:4000';
    const redirectUri = `${apiUrl}/api/auth/oauth/discord/callback`;

    if (!code) {
      return reply.redirect(`${webUrl}/auth/login?error=missing_code`);
    }

    try {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;

      // 1. Exchange code for access token with Discord
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId || '',
          client_secret: clientSecret || '',
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        console.error('[Discord OAuth] Token exchange failed:', tokenData);
        return reply.redirect(`${webUrl}/auth/login?error=discord_token_failed`);
      }

      // 2. Fetch authenticated Discord User profile
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const discordUser = await userResponse.json();

      if (!discordUser.id) {
        return reply.redirect(`${webUrl}/auth/login?error=discord_user_failed`);
      }

      // 3. Find or Create default Organization
      let org = await OrganizationModel.findOne();
      if (!org) {
        org = await OrganizationModel.create({
          name: 'Scanlation Workspace',
          slug: 'scanlation',
        });
      }

      // 4. Construct avatar & username from real Discord data
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(discordUser.discriminator || '0', 10) || 0) % 5}.png`;

      const discordUsername =
        discordUser.discriminator && discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username;

      // Check if user is configured as Bot Administrator in .env
      const botAdminIds = (process.env.BOT_ADMIN_DISCORD_ID || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isBotAdmin = botAdminIds.includes(discordUser.id);

      let user = await UserModel.findOne({ discordId: discordUser.id });

      if (!user) {
        // Check if user was pre-approved by username or Discord tag before logging in
        const cleanUser = (discordUser.username || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        user = await UserModel.findOne({
          $or: [
            { discordUsername },
            { username: cleanUser },
            { displayName: discordUser.username },
          ],
        });

        if (user) {
          // Link Discord ID to pre-existing/pre-approved user
          user.discordId = discordUser.id;
          user.discordUsername = discordUsername;
          user.displayName = discordUser.global_name || discordUser.username;
          user.avatarUrl = avatarUrl;
          if (isBotAdmin) {
            user.isApproved = true;
            user.role = 'Administrator';
          }
          await user.save();
        } else {
          // First user or Bot Admin is Administrator and auto-approved; others are unapproved Workers
          const existingUserCount = await UserModel.countDocuments();
          const shouldAutoApprove = isBotAdmin || existingUserCount === 0;

          user = await UserModel.create({
            organizationId: org._id,
            username: cleanUser || `user_${discordUser.id.slice(-4)}`,
            displayName: discordUser.global_name || discordUser.username,
            email: discordUser.email || `${discordUser.id}@discord.claimboard.dev`,
            role: shouldAutoApprove ? 'Administrator' : 'Worker',
            discordId: discordUser.id,
            discordUsername,
            avatarUrl,
            availability: 'Available',
            workload: 'Normal',
            isApproved: shouldAutoApprove,
            approvedBy: shouldAutoApprove ? (isBotAdmin ? 'Bot Admin Config' : 'System Genesis') : undefined,
            approvedAt: shouldAutoApprove ? new Date() : undefined,
          });
        }
      } else {
        user.displayName = discordUser.global_name || discordUser.username;
        user.avatarUrl = avatarUrl;
        user.discordUsername = discordUsername;
        if (isBotAdmin) {
          user.isApproved = true;
          user.role = 'Administrator';
        }
        await user.save();
      }

      // Check if user is approved to log in
      if (!user.isApproved) {
        console.warn(`[Discord OAuth] Access denied: User ${user.username} (${user.discordId}) is not approved.`);
        return reply.redirect(
          `${webUrl}/auth/login?error=account_not_approved&username=${encodeURIComponent(user.username)}`
        );
      }

      // 5. Create Session in MongoDB Atlas
      const session = await createSession(user._id, user.organizationId, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // 6. Set claimboard_session cookie
      reply.setCookie('claimboard_session', session.token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      });

      // Redirect to frontend dashboard with token
      return reply.redirect(`${webUrl}/dashboard?token=${session.token}`);
    } catch (err: any) {
      console.error('[Discord OAuth] Callback error:', err);
      return reply.redirect(`${webUrl}/auth/login?error=oauth_error`);
    }
  });

  // POST Discord Direct Login
  // Allows frontend to authenticate with user-provided Discord credentials or register their account
  fastify.post('/login-discord', async (request, reply) => {
    const body = (request.body as any) || {};
    const discordUsername = body.username?.trim() || 'discord_user';
    const discordId = body.discordId?.trim() || `discord_${Date.now()}`;

    let org = await OrganizationModel.findOne();
    if (!org) {
      org = await OrganizationModel.create({
        name: 'Scanlation Workspace',
        slug: 'scanlation',
      });
    }

    const botAdminIds = (process.env.BOT_ADMIN_DISCORD_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const isBotAdmin = botAdminIds.includes(discordId) || botAdminIds.includes(discordUsername);

    let user = await UserModel.findOne({
      $or: [{ discordUsername }, { discordId }, { username: discordUsername }],
    });

    if (!user) {
      const existingUserCount = await UserModel.countDocuments();
      const shouldAutoApprove = isBotAdmin || existingUserCount === 0;

      user = await UserModel.create({
        organizationId: org._id,
        username: discordUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        displayName: body.displayName || discordUsername,
        email: `${discordUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_')}@discord.claimboard.dev`,
        role: shouldAutoApprove ? 'Administrator' : 'Worker',
        discordId,
        discordUsername,
        avatarUrl: body.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96',
        availability: 'Available',
        workload: 'Normal',
        isApproved: shouldAutoApprove,
        approvedBy: shouldAutoApprove ? (isBotAdmin ? 'Bot Admin Config' : 'System Genesis') : undefined,
        approvedAt: shouldAutoApprove ? new Date() : undefined,
      });
    } else if (isBotAdmin && !user.isApproved) {
      user.isApproved = true;
      user.role = 'Administrator';
      await user.save();
    }

    // Verify approval
    if (!user.isApproved) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_NOT_APPROVED',
          message: `Your Discord account (${user.username}) is pending administrator approval. Please ask the Bot Administrator to run '/approve username:${user.username}' in Discord.`,
        },
      });
    }

    const session = await createSession(user._id, user.organizationId, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    reply.setCookie('claimboard_session', session.token, {
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      success: true,
      data: {
        token: session.token,
        user: {
          id: user._id.toString(),
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      },
    });
  });

  // Get current authenticated user
  fastify.get('/me', async (request, reply) => {
    const context = await request.requireAuth();
    return reply.send({
      success: true,
      data: {
        user: context.user,
        permissions: context.permissions,
        organizationId: context.organizationId,
      },
    });
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const token = request.cookies?.claimboard_session;
    if (token) {
      await SessionModel.deleteOne({ token });
    }
    reply.clearCookie('claimboard_session', { path: '/' });
    return reply.send({ success: true, data: { message: 'Logged out successfully' } });
  });
}
