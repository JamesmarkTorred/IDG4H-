import http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  decideFault,
  type NetworkProfile,
} from './networkProfiles';

export interface FaultProxyStats {
  transportAttempts: number;
  rejectedBeforeForward: number;
  lostAcknowledgements: number;
  requestBytes: number;
}

export interface FaultProxy {
  url: string;
  stats: FaultProxyStats;
  close(): Promise<void>;
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function readBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.once('end', () => resolve(Buffer.concat(chunks)));
    request.once('error', reject);
  });
}

export async function startFaultProxy(input: {
  centralUrl: string;
  profile: NetworkProfile;
  totalOperations: number;
}): Promise<FaultProxy> {
  const target = new URL(input.centralUrl);
  const attemptsByOperation = new Map<string, number>();
  const operationOrdinals = new Map<string, number>();
  const stats: FaultProxyStats = {
    transportAttempts: 0,
    rejectedBeforeForward: 0,
    lostAcknowledgements: 0,
    requestBytes: 0,
  };

  const server = http.createServer(async (request, response) => {
    try {
      const body = await readBody(request);
      const operationId = String(
        request.headers['idempotency-key'] ?? `request-${stats.transportAttempts}`
      );
      const operationOrdinal = operationOrdinals.get(operationId) ??
        operationOrdinals.size + 1;
      operationOrdinals.set(operationId, operationOrdinal);
      const operationAttempt = (attemptsByOperation.get(operationId) ?? 0) + 1;
      attemptsByOperation.set(operationId, operationAttempt);
      stats.transportAttempts += 1;
      stats.requestBytes += body.length;

      const decision = decideFault(input.profile, {
        operationOrdinal,
        operationAttempt,
        globalAttempt: stats.transportAttempts,
        totalOperations: input.totalOperations,
      });
      const bandwidthDelay = input.profile.bandwidthBytesPerSecond === undefined
        ? 0
        : Math.ceil(
            (body.length / input.profile.bandwidthBytesPerSecond) * 1000
          );
      await wait(input.profile.fixedLatencyMs + bandwidthDelay);

      if (decision.rejectBeforeForward) {
        stats.rejectedBeforeForward += 1;
        response.destroy(new Error('Injected transport interruption.'));
        return;
      }

      const upstream = http.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.url,
        headers: {
          ...request.headers,
          host: target.host,
          'content-length': body.length,
        },
      }, upstreamResponse => {
        const responseChunks: Buffer[] = [];
        upstreamResponse.on('data', chunk => {
          responseChunks.push(Buffer.from(chunk));
        });
        upstreamResponse.once('end', () => {
          if (decision.loseAcknowledgement) {
            stats.lostAcknowledgements += 1;
            response.destroy(new Error('Injected lost acknowledgement.'));
            return;
          }

          response.writeHead(
            upstreamResponse.statusCode ?? 502,
            upstreamResponse.headers
          );
          response.end(Buffer.concat(responseChunks));
        });
      });

      upstream.once('error', error => {
        response.destroy(error);
      });
      upstream.end(body);
    } catch (error) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    stats,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}
