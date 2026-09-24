import { Router } from "express";

import { registerNode } from "../services/nodeRegistrationService";

const router = Router();

interface NodeRegistrationRequestBody {
  nodeId?: unknown;
  registrationCode?: unknown;
}

router.post("/register", async (req, res) => {
  try {
    const rawBody = req.body;

    if (
      rawBody !== undefined &&
      (rawBody === null ||
        typeof rawBody !== "object" ||
        Array.isArray(rawBody))
    ) {
      res.status(400).json({
        error: "A JSON registration object is required.",
      });
      return;
    }

    const body = (rawBody ?? {}) as NodeRegistrationRequestBody;

    const fields = [
      ["nodeId", body.nodeId],
      ["registrationCode", body.registrationCode],
    ] as const;

    for (const [fieldName, value] of fields) {
      if (typeof value !== "string" || value.trim().length === 0) {
        res.status(400).json({
          error: `${fieldName} is required.`,
        });
        return;
      }
    }

    const registration = await registerNode({
      nodeId: body.nodeId as string,
      registrationCode: body.registrationCode as string,
    });

    res.status(201).json(registration);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Node registration failed.";

    console.error("[edge-node-registration]", error);

    res.status(502).json({
      error: message,
    });
  }
});

export default router;
