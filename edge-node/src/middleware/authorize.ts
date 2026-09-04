import type { RequestHandler } from 'express';

import type { PermissionKey } from '../auth/permissions';
import { ApiError } from './errorHandler';

export function requirePermission(permission: PermissionKey): RequestHandler {
  return (req, _res, next) => {
    if (!req.authenticatedUser) {
      next(new ApiError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required.'
      ));
      return;
    }

    if (!req.authenticatedUser.permissions.includes(permission)) {
      next(new ApiError(
        403,
        'FORBIDDEN',
        'You do not have permission to perform this action.'
      ));
      return;
    }

    next();
  };
}
