import config from '../config';

import type {
  OutboxRecord,
} from '../domain';

import type {
  SyncAcknowledgement,
  SyncTransport,
} from './syncTransport';

export class HttpSyncTransport
  implements SyncTransport
{
  async send(
    operation: OutboxRecord
  ): Promise<SyncAcknowledgement> {
    const response = await fetch(
      `${config.centralServerUrl}/api/sync/operations`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'Idempotency-Key':
            operation.operationId,

          'X-IDG4H-Node-ID':
            operation.nodeId,
        },

        body: JSON.stringify({
          operationId:
            operation.operationId,

          nodeId:
            operation.nodeId,

          entityType:
            operation.entityType,

          entityId:
            operation.entityId,

          operationType:
            operation.operationType,

          payload:
            operation.payload,
        }),
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Central sync failed with HTTP ${response.status}: ${text}`
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('Central server returned invalid JSON.');
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Central server returned invalid acknowledgement.');
    }

    const acknowledgement = body as {
      operationId?: unknown;
      status?: unknown;
    };

    if (typeof acknowledgement.operationId !== 'string' || !acknowledgement.operationId.trim()) {
      throw new Error(
        'Central acknowledgement did not include operationId.'
      );
    }

    // A durable receipt is not an ACK. Central must commit the canonical
    // mutation before the Edge outbox can be marked acknowledged.
    if (acknowledgement.status !== 'applied') {
      throw new Error(`Central operation was not applied. Status: ${String(acknowledgement.status)}`);
    }

    return {
      operationId:
        acknowledgement.operationId,
    };
  }
}
