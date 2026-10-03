import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateSessionToken, AuthenticatedUserContext } from '@claimboard/auth';
import { API_ERROR_CODES, Permission } from '@claimboard/shared';

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: AuthenticatedUserContext;
    requireAuth: () => Promise<AuthenticatedUserContext>;
    requirePermission: (permission: Permission) => Promise<AuthenticatedUserContext>;
  }
}

async function authPluginHandler(fastify: FastifyInstance) {
  fastify.decorateRequest('userContext', undefined);

  fastify.decorateRequest('requireAuth', async function (this: FastifyRequest) {
    if (this.userContext) return this.userContext;

    // Check cookie or Authorization header
    let token = this.cookies?.claimboard_session;
    if (!token && this.headers.authorization) {
      const parts = this.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw {
        statusCode: 401,
        code: API_ERROR_CODES.AUTH_REQUIRED,
        message: 'Authentication required. Please log in.',
      };
    }

    const context = await validateSessionToken(token);
    if (!context) {
      throw {
        statusCode: 401,
        code: API_ERROR_CODES.AUTH_REQUIRED,
        message: 'Session has expired or is invalid. Please log in again.',
      };
    }

    this.userContext = context;
    return context;
  });

  fastify.decorateRequest('requirePermission', async function (this: FastifyRequest, permission: Permission) {
    const context = await this.requireAuth();

    if (!context.permissions.includes(permission)) {
      throw {
        statusCode: 403,
        code: API_ERROR_CODES.INSUFFICIENT_PERMISSION,
        message: `Forbidden: Missing required permission '${permission}'.`,
      };
    }

    return context;
  });
}

export const authPlugin = fp(authPluginHandler, {
  name: 'auth-plugin',
});
