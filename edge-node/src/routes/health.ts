import { Router } from 'express';
import { db } from '../db/connection';

const router = Router();

type HealthResponse = { status: 'ok'; db: 'connected' };

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Confirms the edge-node server is running and SQLite is reachable.
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get<Record<string, never>, HealthResponse>('/', (_req, res, next) => {
  try {
    db.prepare('SELECT 1').get();

    res.json({
      status: 'ok',
      db: 'connected',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
