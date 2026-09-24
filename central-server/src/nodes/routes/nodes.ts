import { Router, type Request, type Response } from 'express';

import {
  NodeAlreadyRegisteredError,
  NodeNotFoundError,
  NodeRegistrationCodeInvalidError,
  NodeRegistrationValidationError,
  registerNode,
} from '../services/nodeRegistrationService';

import {
  issueNodeRegistrationCode,
  NodeRegistrationCodeConflictError,
  NodeRegistrationCodeValidationError,
} from '../services/nodeRegistrationCodeService';

import {
  getNode,
  listNodes,
} from '../services/nodeManagementService';

import {
  authenticateAdminSession,
  AdminSessionError,
} from '../../auth/services/adminSessionService';

const router = Router();

const SESSION_COOKIE_NAME = 'idg4h_session';

interface NodeRegistrationRequestBody {
  nodeId?: unknown;
  registrationCode?: unknown;
}

/**
 * Authenticate an administrator using the server-side session cookie.
 *
 * This is intentionally kept inside the node routes for now.
 * The node registration endpoint itself remains public because
 * an Edge Node must be able to register using its registration code.
 */
async function requireAdminSession(
  req: Request,
  res: Response,
): Promise<boolean> {
  const sessionToken =
    req.cookies?.[SESSION_COOKIE_NAME];

  if (
    typeof sessionToken !== 'string' ||
    sessionToken.trim().length === 0
  ) {
    res.status(401).json({
      error: 'Administrator session required.',
    });

    return false;
  }

  try {
    await authenticateAdminSession(sessionToken);

    return true;
  } catch (error) {
    if (error instanceof AdminSessionError) {
      res.status(401).json({
        error: error.message,
      });

      return false;
    }

    console.error(
      '[node-management] administrator session authentication failed:',
      error,
    );

    res.status(503).json({
      error:
        'Administrator authentication service is unavailable.',
    });

    return false;
  }
}

/**
 * @openapi
 * /nodes:
 *   get:
 *     summary: List Edge Nodes
 *     description: Returns all Edge Nodes managed by the central server. Requires administrator authentication.
 *     security:
 *       - adminSession: []
 *     responses:
 *       200:
 *         description: List of Edge Nodes
 *       401:
 *         description: Administrator session required
 *       503:
 *         description: Node management service unavailable
 */
router.get('/', async (req, res) => {
  if (!(await requireAdminSession(req, res))) {
    return;
  }

  try {
    const nodes = await listNodes();

    res.status(200).json({
      nodes,
    });
  } catch (error) {
    console.error(
      '[node-management] failed to list nodes:',
      error,
    );

    res.status(503).json({
      error: 'Node management service is unavailable.',
    });
  }
});

/**
 * @openapi
 * /nodes/{nodeId}:
 *   get:
 *     summary: Get an Edge Node
 *     description: Returns information about a specific Edge Node. Requires administrator authentication.
 *     security:
 *       - adminSession: []
 *     parameters:
 *       - in: path
 *         name: nodeId
 *         required: true
 *         schema:
 *           type: string
 *         example: edge-mainit-001
 *     responses:
 *       200:
 *         description: Edge Node found
 *       401:
 *         description: Administrator session required
 *       404:
 *         description: Edge Node not found
 *       503:
 *         description: Node management service unavailable
 */
router.get('/:nodeId', async (req, res) => {
  if (!(await requireAdminSession(req, res))) {
    return;
  }

  try {
    const node = await getNode(req.params.nodeId);

    if (!node) {
      res.status(404).json({
        error: `Node ${req.params.nodeId} not found.`,
      });

      return;
    }

    res.status(200).json({
      node,
    });
  } catch (error) {
    console.error(
      '[node-management] failed to get node:',
      error,
    );

    res.status(503).json({
      error: 'Node management service is unavailable.',
    });
  }
});

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
 *               - registrationCode
 *             properties:
 *               nodeId:
 *                 type: string
 *                 example: edge-mainit-001
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
router.post('/register', async (req, res) => {
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
      registrationCode:
        body.registrationCode as string,
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
    if (
      error instanceof NodeRegistrationValidationError
    ) {
      res.status(400).json({
        error: error.message,
      });

      return;
    }

    if (
      error instanceof NodeRegistrationCodeInvalidError
    ) {
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

    if (
      error instanceof NodeAlreadyRegisteredError
    ) {
      res.status(409).json({
        error: error.message,
      });

      return;
    }

    console.error(
      '[node-registration] unexpected error:',
      error,
    );

    res.status(503).json({
      error:
        'Node registration service is unavailable.',
    });
  }
});

/**
 * @openapi
 * /nodes/registration-code:
 *   post:
 *     summary: Issue an Edge Node registration code
 *     description: Creates a registration code for a pending Edge Node. Requires administrator authentication.
 *     security:
 *       - adminSession: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nodeId
 *             properties:
 *               nodeId:
 *                 type: string
 *                 example: edge-mainit-001
 *     responses:
 *       201:
 *         description: Registration code issued
 *       400:
 *         description: Invalid registration-code request
 *       401:
 *         description: Administrator session required
 *       409:
 *         description: Registration code conflict
 *       503:
 *         description: Registration code service unavailable
 */
router.post('/registration-code', async (req, res) => {
  if (!(await requireAdminSession(req, res))) {
    return;
  }

  try {
    const body = req.body as {
      nodeId?: unknown;
    };

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

    if (
      typeof body.nodeId !== 'string' ||
      body.nodeId.trim().length === 0
    ) {
      res.status(400).json({
        error: 'nodeId is required.',
      });

      return;
    }

    const registration =
      await issueNodeRegistrationCode(
        body.nodeId,
      );

    res.status(201).json(registration);
  } catch (error) {
    if (
      error instanceof NodeRegistrationCodeValidationError
    ) {
      res.status(400).json({
        error: error.message,
      });

      return;
    }

    if (
      error instanceof NodeRegistrationCodeConflictError
    ) {
      res.status(409).json({
        error: error.message,
      });

      return;
    }

    console.error(
      '[node-registration-code] unexpected error:',
      error,
    );

    res.status(503).json({
      error:
        'Node registration code service is unavailable.',
    });
  }
});

export default router;