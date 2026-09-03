import { Router } from 'express';
import { db } from '../db/connection';

const router = Router();

type HealthResponse =
  | { status: 'ok'; db: 'connected' }
  | { status: 'error'; message: string };

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
router.get<Record<string, never>, HealthResponse>('/', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();

    res.json({
      status: 'ok',
      db: 'connected',
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err instanceof Error ? err.message : 'Database health check failed',
    });
  }
});

export default router;
