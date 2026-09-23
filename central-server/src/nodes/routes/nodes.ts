import { Router } from 'express';

import {
  NodeAlreadyRegisteredError,
  NodeNotFoundError,
  NodeRegistrationCodeInvalidError,
  NodeRegistrationValidationError,
  registerNode,
} from '../services/nodeRegistrationService';

const router = Router();

interface NodeRegistrationRequestBody {
  nodeId?: unknown;
  name?: unknown;
  facilityName?: unknown;
  address?: unknown;
  registrationCode?: unknown;
}

/**
 * @openapi
 * /nodes/register:
 *   post:
 *     summary: Register an authorized Edge Node
 *     description: Activates a pending Edge Node using its pre-issued registration code and returns a one-time authentication token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nodeId
 *               - name
 *               - facilityName
 *               - address
 *               - registrationCode
 *             properties:
 *               nodeId:
 *                 type: string
 *                 example: edge-mainit-001
 *               name:
 *                 type: string
 *                 example: Mainit Edge Node
 *               facilityName:
 *                 type: string
 *                 example: Mainit Rural Health Unit
 *               address:
 *                 type: string
 *                 example: Mainit, Surigao del Norte
 *               registrationCode:
 *                 type: string
 *                 example: IDG4H-7K2M9Q4P8Z
 *     responses:
 *       201:
 *         description: Edge Node successfully registered and issued an authentication token
 *       400:
 *         description: Invalid or incomplete registration request
 *       401:
 *         description: Invalid registration code
 *       404:
 *         description: No pending registration exists for the node
 *       409:
 *         description: Node is already registered
 */
router.post(
  '/register',
  async (req, res) => {
    try {
      const body = req.body as NodeRegistrationRequestBody;

      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body)
      ) {
        res.status(400).json({
          error: 'A JSON registration object is required.',
        });
        return;
      }

      const fields = [
        ['nodeId', body.nodeId],
        ['name', body.name],
        ['facilityName', body.facilityName],
        ['address', body.address],
        ['registrationCode', body.registrationCode],
      ] as const;

      for (const [fieldName, value] of fields) {
        if (
          typeof value !== 'string' ||
          value.trim().length === 0
        ) {
          res.status(400).json({
            error: `${fieldName} is required.`,
          });
          return;
        }
      }

      const node = await registerNode({
        nodeId: body.nodeId as string,
        name: body.name as string,
        facilityName: body.facilityName as string,
        address: body.address as string,
        registrationCode: body.registrationCode as string,
      });

      res.status(201).json({
        node: {
          id: node.id,
          nodeId: node.nodeId,
          name: node.name,
          facilityName: node.facilityName,
          address: node.address,
          status: node.status,
          registeredAt: node.registeredAt,
        },
        authToken: node.authToken,
      });
    } catch (error) {
      if (error instanceof NodeRegistrationValidationError) {
        res.status(400).json({
          error: error.message,
        });
        return;
      }

      if (error instanceof NodeRegistrationCodeInvalidError) {
        res.status(401).json({
          error: error.message,
        });
        return;
      }

      if (error instanceof NodeNotFoundError) {
        res.status(404).json({
          error: error.message,
        });
        return;
      }

      if (error instanceof NodeAlreadyRegisteredError) {
        res.status(409).json({
          error: error.message,
        });
        return;
      }

      res.status(503).json({
        error: 'Node registration service is unavailable.',
      });
    }
  },
);

export default router;