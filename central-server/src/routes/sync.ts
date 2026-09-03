import { Router } from 'express';
import { receiveSyncOperation, SyncOperationStateError, type ReceiveSyncOperationResult } from '../services/syncOperationService';
import { InvalidSyncOperationError, parseSyncOperation } from '../services/syncValidation';

const router = Router();

/**
 * @openapi
 * /api/sync/operations:
 *   post:
 *     summary: Atomically apply an Edge create operation
 *     description: Commits the ledger and canonical create together before acknowledging. Already applied operation IDs are acknowledged without reapplying. Update and delete are not implemented.
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
 *               payload: { type: object, additionalProperties: true }
 *     responses:
 *       201:
 *         description: Canonical create and applied ledger status committed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [operationId, status, duplicate]
 *               properties:
 *                 operationId: { type: string }
 *                 status: { type: string, enum: [applied] }
 *                 duplicate: { type: boolean }
 *       200:
 *         description: Previously applied operation acknowledged without reprocessing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [operationId, status, duplicate]
 *               properties:
 *                 operationId: { type: string }
 *                 status: { type: string, enum: [applied] }
 *                 duplicate: { type: boolean }
 *       400:
 *         description: Invalid payload, unsupported operation type, or mismatched headers
 *       409:
 *         description: Unapplied existing ledger entry, missing dependency, or duplicate canonical entity
 *       503:
 *         description: Storage unavailable; retry with the same operation ID
 */
router.post<Record<string, never>, ReceiveSyncOperationResult | { error: string }, unknown>(
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
        operationId: result.operationId,
        status: result.status,
        duplicate: result.duplicate,
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (error instanceof InvalidSyncOperationError) {
        res.status(400).json({ error: error.message });
      } else if (error instanceof SyncOperationStateError) {
        res.status(409).json({ error: error.message });
      } else if (code === '23503' || code === '23505') {
        res.status(409).json({ error: 'Canonical dependency is missing or the entity already exists.' });
      } else if (typeof code === 'string' && (code.startsWith('22') || code === '23502' || code === '23514')) {
        res.status(400).json({ error: 'Canonical payload contains an invalid field value.' });
      } else {
        res.status(503).json({ error: 'Synchronization storage is unavailable.' });
      }
    }
  }
);

export default router;
