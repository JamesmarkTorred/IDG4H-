const express = require('express');
const { db } = require('../db/connection');

const router = express.Router();

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
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare(
      'INSERT INTO _health_check (checked_at) VALUES (?)'
    );
    const result = stmt.run(new Date().toISOString());

    res.json({
      status: 'ok',
      db: 'connected',
      lastCheckId: result.lastInsertRowid,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;