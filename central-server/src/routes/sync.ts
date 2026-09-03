import { Router } from 'express';
import { receiveSyncOperation } from '../services/syncOperationService';
import { InvalidSyncOperationError, parseSyncOperation } from '../services/syncValidation';
import type { SyncOperationReceipt } from '../domain';

const router = Router();

/**
 * @openapi
 * /api/sync/operations:
 *   post:
 *     summary: Durably accept an Edge synchronization operation
 *     description: Returns the original ledger entry for an existing operation ID. Receipt is not an acknowledgement of canonical application.
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         schema: { type: string }
 *       - in: header
 *         name: X-IDG4H-Node-ID
 *         required: false
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [operationId, nodeId, entityType, entityId, operationType, payload]
 *             properties:
 *               operationId: { type: string, format: uuid }
 *               nodeId: { type: string }
 *               entityType: { type: string, enum: [patient, encounter, observation, immunization] }
 *               entityId: { type: string, format: uuid }
 *               operationType: { type: string, enum: [create, update, delete] }
 *               payload: {}
 *     responses:
 *       201:
 *         description: Operation durably received, not yet applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [operationId, status, duplicate]
 *               properties:
 *                 operationId: { type: string }
 *                 status: { type: string, enum: [received, applied, failed] }
 *                 duplicate: { type: boolean }
 *       200:
 *         description: Existing operation returned without changing or reprocessing it
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [operationId, status, duplicate]
 *               properties:
 *                 operationId: { type: string }
 *                 status: { type: string, enum: [received, applied, failed] }
 *                 duplicate: { type: boolean }
 *       400:
 *         description: Invalid operation or mismatched headers
 *       503:
 *         description: Storage unavailable; retry with the same operation ID
 */
router.post<Record<string, never>, SyncOperationReceipt | { error: string }, unknown>(
  '/operations',
  async (req, res) => {
    try {
      const input = parseSyncOperation(req.body);
      const idempotencyKey = req.get('Idempotency-Key');
      const nodeHeader = req.get('X-IDG4H-Node-ID');
      if (idempotencyKey !== undefined && idempotencyKey !== input.operationId) {
        throw new InvalidSyncOperationError('Idempotency-Key does not match operationId.');
      }
      if (nodeHeader !== undefined && nodeHeader !== input.nodeId) {
        throw new InvalidSyncOperationError('X-IDG4H-Node-ID does not match nodeId.');
      }
      const result = await receiveSyncOperation(input);
      res.status(result.duplicate ? 200 : 201).json({
        operationId: result.operation.operationId,
        status: result.operation.status,
        duplicate: result.duplicate,
      });
    } catch (error) {
      if (error instanceof InvalidSyncOperationError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(503).json({ error: 'Synchronization storage is unavailable.' });
      }
    }
  }
);

export default router;
