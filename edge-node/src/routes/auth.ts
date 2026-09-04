import { Router } from 'express';

import { authenticateCredentials } from '../auth/authService';
import { sessionCookieName, sessionService } from '../auth/sessionService';
import config from '../config';
import { requireAuth } from '../middleware/authenticate';
import { ApiError, validateRequest } from '../middleware/errorHandler';
import { loginSchema } from '../validation/authSchemas';

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.authCookieSecure,
  path: '/',
};

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authenticate against the local Edge user store
 *     responses:
 *       200: { description: Local session created }
 *       401: { description: Invalid credentials }
 */
router.post('/login', async (req, res) => {
  const credentials = validateRequest(loginSchema, req.body);
  const user = await authenticateCredentials(
    credentials.username,
    credentials.password
  );

  if (!user) {
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid username or password.'
    );
  }

  const session = sessionService.createSession(user.id);

  res.cookie(sessionCookieName, session.token, {
    ...cookieOptions,
    expires: new Date(session.record.expiresAt),
  });
  res.status(200).json({ user });
});

router.post('/logout', requireAuth, (req, res) => {
  sessionService.revoke(req.authSessionToken!);
  res.clearCookie(sessionCookieName, cookieOptions);
  res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.authenticatedUser });
});

export default router;
