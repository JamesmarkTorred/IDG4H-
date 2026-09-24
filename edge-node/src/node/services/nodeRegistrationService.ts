import config from "../../config";

import type {
  NodeRegistrationRequest,
  NodeRegistrationResponse,
} from "../type";

export async function registerNode(
  input: NodeRegistrationRequest,
): Promise<NodeRegistrationResponse> {
  const nodeId = input.nodeId.trim();
  const registrationCode = input.registrationCode.trim();

  if (!nodeId) {
    throw new Error("Node ID is required.");
  }

  if (!registrationCode) {
    throw new Error("Registration code is required.");
  }

  const response = await fetch(
    `${config.centralServerUrl}/nodes/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nodeId,
        registrationCode,
      }),
    },
  );

  const text = await response.text();

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      "Central server returned invalid JSON.",
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new Error(
      "Central server returned an invalid registration response.",
    );
  }

  if (!response.ok) {
    const errorBody = body as {
      error?: unknown;
    };

    const message =
      typeof errorBody.error === "string" &&
      errorBody.error.trim()
        ? errorBody.error
        : `Node registration failed with HTTP ${response.status}.`;

    throw new Error(message);
  }

  const registration =
    body as NodeRegistrationResponse;

  if (
    typeof registration.authToken !== "string" ||
    !registration.authToken.trim()
  ) {
    throw new Error(
      "Central server did not return an authentication token.",
    );
  }

  if (
    typeof registration.node !== "object" ||
    registration.node === null ||
    Array.isArray(registration.node)
  ) {
    throw new Error(
      "Central server did not return valid node information.",
    );
  }

  return registration;
}