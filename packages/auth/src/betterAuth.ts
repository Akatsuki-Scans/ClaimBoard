import { betterAuth } from 'better-auth';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '@claimboard/config';
import { SessionModel, UserModel, RoleModel } from '@claimboard/database';
import { Permission, User, DEFAULT_ROLE_PERMISSIONS } from '@claimboard/shared';

// Better Auth Discord-Only Configuration
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET || 'claimboard_better_auth_production_secret_key_12345678',
  baseURL: env.API_URL || 'http://localhost:4000',
  socialProviders: {
    discord: {
      clientId: env.DISCORD_CLIENT_ID || '123456789012345678',
      clientSecret: env.DISCORD_CLIENT_SECRET || 'mock_discord_client_secret',
    },
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
});

export type Auth = typeof auth;

export interface AuthenticatedUserContext {
  user: User;
  sessionToken: string;
  organizationId: string;
  permissions: Permission[];
}

export async function createSession(
  userId: string | mongoose.Types.ObjectId,
  organizationId: string | mongoose.Types.ObjectId,
  metadata?: { ipAddress?: string; userAgent?: string; durationDays?: number }
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const durationDays = metadata?.durationDays ?? 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  await SessionModel.create({
    token,
    userId: new mongoose.Types.ObjectId(userId),
    organizationId: new mongoose.Types.ObjectId(organizationId),
    expiresAt,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
  });

  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<AuthenticatedUserContext | null> {
  if (!token) return null;

  const session: any = await SessionModel.findOne({
    token,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return null;
  }

  const user: any = await UserModel.findById(session.userId).lean();
  if (!user) {
    return null;
  }

  const permissions: Permission[] = (DEFAULT_ROLE_PERMISSIONS as any)[user.role] || [];

  const mappedUser: User = {
    id: user._id.toString(),
    organizationId: user.organizationId.toString(),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    discordId: user.discordId,
    role: user.role,
    permissions,
    availability: user.availability as any,
    workload: user.workload as any,
    activeClaimsCount: user.activeClaimsCount || 0,
    completedTasksCount: user.completedTasksCount || 0,
    isApproved: user.isApproved ?? false,
    createdAt: (user as any).createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: (user as any).updatedAt?.toISOString() || new Date().toISOString(),
  };

  return {
    user: mappedUser,
    sessionToken: token,
    organizationId: user.organizationId.toString(),
    permissions,
  };
}

export async function revokeSession(token: string): Promise<boolean> {
  const result = await SessionModel.deleteOne({ token });
  return result.deletedCount > 0;
}
