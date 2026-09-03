import config from '../config';

import {
  HttpSyncTransport,
} from '../sync/httpSyncTransport';

import type {
  OutboxRecord,
} from '../domain';

describe('HttpSyncTransport', () => {
  const originalFetch =
    global.fetch;

  function sampleOperation(): OutboxRecord {
    return {
      id: 'outbox-test',
      operationId: 'operation-test',
      nodeId: config.nodeId,
      entityType: 'patient',
      entityId: 'patient-test',
      operationType: 'create',
      payload: { id: 'patient-test', firstName: 'Synthetic' },
      status: 'pending',
      attemptCount: 0,
      createdAt: '2026-09-03T08:00:00.000Z',
      updatedAt: '2026-09-03T08:00:00.000Z',
    };
  }

  afterEach(() => {
    global.fetch =
      originalFetch;

    jest.restoreAllMocks();
  });

  test(
    'sends operation using synchronization contract',
    async () => {
      const operation: OutboxRecord = {
        id: 'outbox-001',

        operationId:
          'operation-001',

        nodeId:
          config.nodeId,

        entityType:
          'patient',

        entityId:
          'patient-001',

        operationType:
          'create',

        payload: {
          id:
            'patient-001',

          firstName:
            'Synthetic',

          lastName:
            'Patient',
        },

        status:
          'pending',

        attemptCount: 0,

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString(),
      };

      global.fetch =
        jest.fn().mockResolvedValue({
          ok: true,
          status: 200,

          text: async () => JSON.stringify({
            status: 'applied',
            operationId:
              operation.operationId,
          }),
        }) as jest.Mock;

      const transport =
        new HttpSyncTransport();

      const result =
        await transport.send(
          operation
        );

      expect(
        result.operationId
      ).toBe(
        operation.operationId
      );

      expect(
        global.fetch
      ).toHaveBeenCalledWith(
        `${config.centralServerUrl}/api/sync/operations`,

        expect.objectContaining({
          method: 'POST',

          headers:
            expect.objectContaining({
              'Idempotency-Key':
                operation.operationId,

              'Content-Type': 'application/json',

              'X-IDG4H-Node-ID':
                operation.nodeId,
            }),
          body: JSON.stringify({
            operationId: operation.operationId,
            nodeId: operation.nodeId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            operationType: operation.operationType,
            payload: operation.payload,
          }),
        })
      );
    }
  );
  test.each([400, 503])('reports HTTP %i and the response body', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Synthetic rejection', { status }));

    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow(`Central sync failed with HTTP ${status}: Synthetic rejection`);
  });

  test('rejects a response without an operation ID', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow('Central acknowledgement did not include operationId.');
  });

  test('reports invalid JSON acknowledgements as failures', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow('Central server returned invalid JSON.');
  });

  test('propagates network errors so the sync engine can schedule retries', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Synthetic connection failure'));

    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow('Synthetic connection failure');
  });

  test('reuses the same idempotency key and body when resending an operation', async () => {
    const operation = sampleOperation();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ operationId: operation.operationId, status: 'applied' }), { status: 200 })
    );
    const transport = new HttpSyncTransport();

    await transport.send(operation);
    await transport.send(operation);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'Idempotency-Key': operation.operationId,
    });
  });
  test.each(['received', 'failed', undefined])('does not acknowledge a %s receipt', async (status) => {
    const operation = sampleOperation();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      operationId: operation.operationId, status, duplicate: false,
    }), { status: 201 }));

    await expect(new HttpSyncTransport().send(operation))
      .rejects.toThrow(`Central operation was not applied. Status: ${String(status)}`);
  });

  test.each([null, [], 123, 'applied', true])('rejects a non-object acknowledgement %j', async (body) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow('Central server returned invalid acknowledgement.');
  });

  test.each([null, 123, {}, '', ' '])('rejects an invalid operationId %j', async (operationId) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      operationId, status: 'applied',
    }), { status: 200 }));
    await expect(new HttpSyncTransport().send(sampleOperation()))
      .rejects.toThrow('Central acknowledgement did not include operationId.');
  });
});
