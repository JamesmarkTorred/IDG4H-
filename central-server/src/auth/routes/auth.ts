import { Router } from 'express';

import {
  authenticateAdmin,
  AdminAuthenticationError,
} from '../services/adminAuthenticationService';

import {
  createAdminSession,
  authenticateAdminSession,
  revokeAdminSession,
  AdminSessionError,
} from '../services/adminSessionService';

const router = Router();

const SESSION_COOKIE_NAME = 'idg4h_session';

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate an administrator
 *     description: Authenticates an administrator and creates a server-side session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@idg4h.local
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Administrator authenticated successfully
 *       401:
 *         description: Invalid administrator credentials
 */
router.post('/login', async (req, res) => {
  try {
    const body = req.body as LoginRequestBody;

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      res.status(400).json({
        error: 'A JSON login object is required.',
      });
      return;
    }

    if (
      typeof body.email !== 'string' ||
      body.email.trim().length === 0
    ) {
      res.status(400).json({
        error: 'Email is required.',
      });
      return;
    }

    if (
      typeof body.password !== 'string' ||
      body.password.length === 0
    ) {
      res.status(400).json({
        error: 'Password is required.',
      });
      return;
    }

    const admin = await authenticateAdmin(
      body.email,
      body.password,
    );

    const session = await createAdminSession(admin.id);

    res.cookie(SESSION_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: session.expiresAt,
      path: '/',
    });

    res.status(200).json({
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    if (error instanceof AdminAuthenticationError) {
      res.status(401).json({
        error: error.message,
      });
      return;
    }

    if (error instanceof AdminSessionError) {
      res.status(503).json({
        error: error.message,
      });
      return;
    }

    console.error(
      '[admin-auth] login failed:',
      error,
    );

    res.status(503).json({
      error: 'Administrator authentication service is unavailable.',
    });
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the authenticated administrator
 *     responses:
 *       200:
 *         description: Authenticated administrator
 *       401:
 *         description: Administrator session required
 */
router.get('/me', async (req, res) => {
  try {
    const sessionToken = req.cookies?.[
      SESSION_COOKIE_NAME
    ];

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
      await authenticateAdminSession(sessionToken);

    res.status(200).json({
      admin: {
        id: session.userId,
        email: session.email,
        role: session.role,
      },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    if (error instanceof AdminSessionError) {
      res.status(401).json({
        error: error.message,
      });
      return;
    }

    console.error(
      '[admin-auth] session authentication failed:',
      error,
    );

    res.status(503).json({
      error: 'Administrator authentication service is unavailable.',
    });
  }
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out the administrator
 *     description: Revokes the current administrator session.
 *     responses:
 *       204:
 *         description: Administrator session revoked
 */
router.post('/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies?.[
      SESSION_COOKIE_NAME
    ];

    if (typeof sessionToken === 'string') {
      await revokeAdminSession(sessionToken);
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.status(204).send();
  } catch (error) {
    console.error(
      '[admin-auth] logout failed:',
      error,
    );

    res.status(503).json({
      error: 'Administrator logout service is unavailable.',
    });
  }
});

export default router;