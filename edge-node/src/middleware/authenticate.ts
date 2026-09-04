import type { RequestHandler } from 'express';

import type { AuthenticatedUser } from '../auth/permissions';
import {
  sessionCookieName,
  sessionService,
} from '../auth/sessionService';
import { ApiError } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
      authSessionToken?: string;
    }
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');

    if (separator < 0 || segment.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = segment.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = readCookie(req.headers.cookie, sessionCookieName);
  const user = token ? sessionService.authenticate(token) : undefined;

  if (!token || !user) {
    next(new ApiError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.'
    ));
    return;
  }

  req.authSessionToken = token;
  req.authenticatedUser = user;
  next();
};
