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

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `Central sync failed with HTTP ${response.status}: ${body}`
      );
    }

    const body =
      (await response.json()) as {
        operationId?: string;
      };

    if (!body.operationId) {
      throw new Error(
        'Central server acknowledgement did not include operationId.'
      );
    }

    return {
      operationId:
        body.operationId,
    };
  }
}
