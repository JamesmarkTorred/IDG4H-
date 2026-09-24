import type { RequestHandler } from 'express';

import {
  authenticateAdminSession,
} from '../services/adminSessionService';

export interface AuthenticatedAdmin {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  expiresAt: Date;
}

export const requireAdminAuthentication: RequestHandler =
  async (req, res, next) => {
    try {
      const sessionToken =
        req.cookies?.idg4h_session;

      if (
        typeof sessionToken !== 'string' ||
        sessionToken.trim().length === 0
      ) {
        res.status(401).json({
          error: 'Administrator session required.',
        });
        return;
      }

      const session =
        await authenticateAdminSession(
          sessionToken,
        );

      res.locals.admin = {
        userId: session.userId,
        email: session.email,
        role: session.role,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
      } satisfies AuthenticatedAdmin;

      next();
    } catch (error) {
      console.error(
        '[admin-auth] middleware authentication failed:',
        error,
      );

      res.status(401).json({
        error:
          'Invalid or expired administrator session.',
      });
    }
  };