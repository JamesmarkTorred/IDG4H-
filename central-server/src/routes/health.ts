import { Router } from 'express';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Confirms the Central Server HTTP service is running.
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'central-server' });
});

export default router;
