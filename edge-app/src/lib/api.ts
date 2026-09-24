const EDGE_NODE_URL = "http://localhost:4000";

export interface HealthResponse {
  status: "ok";
  db: "connected";
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${EDGE_NODE_URL}/health`);

  if (!response.ok) {
    throw new Error(
      `Edge Node health check failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<HealthResponse>;
}