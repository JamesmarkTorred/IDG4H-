import { Router } from 'express';
import { ingestSyncOperation, SyncOperationConflictError } from '../db/syncOperationRepository';
import { InvalidSyncOperationError, parseSyncOperation } from '../services/syncOperationValidation';
import type { SyncAcknowledgement } from '../domain/syncOperation';

const router = Router();

/**
 * @openapi
 * /api/sync/operations:
 *   post:
 *     summary: Durably accept an Edge synchronization operation
 *     description: Identical retries are acknowledged without inserting another receipt. A reused operation ID with different content returns 409.
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: X-IDG4H-Node-ID
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [operationId, nodeId, entityType, entityId, operationType, payload]
 *             properties:
 *               operationId: { type: string }
 *               nodeId: { type: string }
 *               entityType: { type: string, enum: [patient, encounter, observation, immunization] }
 *               entityId: { type: string }
 *               operationType: { type: string, enum: [create, update, delete] }
 *               payload: { type: object, additionalProperties: true }
 *     responses:
 *       200:
 *         description: Operation durably received, or identical receipt already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [operationId]
 *               properties:
 *                 operationId: { type: string }
 *       400:
 *         description: Invalid operation or mismatched headers
 *       409:
 *         description: Operation ID already used for different content
 *       503:
 *         description: Storage unavailable; retry with the same operation ID
 */
router.post<Record<string, never>, SyncAcknowledgement | { error: string }, unknown>(
  '/operations',
  async (req, res) => {
    try {
      const operation = parseSyncOperation(
        req.body, req.get('Idempotency-Key'), req.get('X-IDG4H-Node-ID')
      );
      await ingestSyncOperation(operation);
      res.status(200).json({ operationId: operation.operationId });
    } catch (error) {
      if (error instanceof InvalidSyncOperationError) {
        res.status(400).json({ error: error.message });
      } else if (error instanceof SyncOperationConflictError) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(503).json({ error: 'Synchronization storage is unavailable.' });
      }
    }
  }
);

export default router;
