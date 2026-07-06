const express = require('express');
const { pool } = require('../db/connection');

const router = express.Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Confirms central-server is running and PostgreSQL is reachable.
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'INSERT INTO _health_check (checked_at) VALUES ($1) RETURNING id',
      [new Date().toISOString()]
    );
    res.json({
      status: 'ok',
      db: 'connected',
      lastCheckId: result.rows[0].id,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;