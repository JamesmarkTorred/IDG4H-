import {
  NodeAlreadyRegisteredError,
  NodeNotFoundError,
  NodeRegistrationCodeInvalidError,
  NodeRegistrationValidationError,
  registerNode,
} from '../services/nodeRegistrationService';
import {
  generateRegistrationCode,
  hashRegistrationCode,
} from '../services/nodeRegistrationCode';
import { prisma } from '../../db/connection';

describe('node registration service', () => {
  const pendingNodeId = `registration-test-${Date.now()}`;

  beforeAll(async () => {
    await prisma.node.create({
      data: {
        nodeId: pendingNodeId,
        name: 'Mainit Edge Node',
        facilityName: 'Mainit Rural Health Unit',
        address: 'Mainit, Surigao del Norte',
        registrationCodeHash: hashRegistrationCode(
          'IDG4H-TEST-CODE',
        ),
        status: 'pending',
      },
    });
  });

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId: {
          in: [
            pendingNodeId,
            'missing-registration-node',
            'invalid-code-node',
          ],
        },
      },
    });

    await prisma.$disconnect();
  });

  it('registers a pending node successfully', async () => {
    const node = await registerNode({
      nodeId: pendingNodeId,
      registrationCode: 'IDG4H-TEST-CODE',
    });

    expect(node.nodeId).toBe(pendingNodeId);
    expect(node.name).toBe('Mainit Edge Node');
    expect(node.facilityName).toBe(
      'Mainit Rural Health Unit',
    );
    expect(node.address).toBe(
      'Mainit, Surigao del Norte',
    );
    expect(node.status).toBe('active');
    expect(node.registeredAt).toBeInstanceOf(Date);
    expect(node.updatedAt).toBeInstanceOf(Date);
    expect(node.authToken).toEqual(expect.any(String));
  });

  it('rejects a node that does not exist', async () => {
    await expect(
      registerNode({
        nodeId: 'missing-registration-node',
        registrationCode: generateRegistrationCode(),
      }),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });

  it('rejects an already active node', async () => {
    await expect(
      registerNode({
        nodeId: pendingNodeId,
        registrationCode: 'IDG4H-TEST-CODE',
      }),
    ).rejects.toBeInstanceOf(NodeAlreadyRegisteredError);
  });

  it('rejects an invalid registration code', async () => {
    const invalidCodeNodeId = 'invalid-code-node';

    await prisma.node.create({
      data: {
        nodeId: invalidCodeNodeId,
        name: 'Pending Node',
        facilityName: 'Pending Facility',
        address: 'Pending Address',
        registrationCodeHash: hashRegistrationCode(
          'IDG4H-CORRECT-CODE',
        ),
        status: 'pending',
      },
    });

    await expect(
      registerNode({
        nodeId: invalidCodeNodeId,
        registrationCode: 'IDG4H-WRONG-CODE',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationCodeInvalidError,
    );

    await prisma.node.delete({
      where: {
        nodeId: invalidCodeNodeId,
      },
    });
  });

  it('rejects an empty nodeId', async () => {
    await expect(
      registerNode({
        nodeId: '   ',
        registrationCode: 'IDG4H-TEST-CODE',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationValidationError,
    );
  });

  it('rejects an empty registration code', async () => {
    await expect(
      registerNode({
        nodeId: pendingNodeId,
        registrationCode: '   ',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationValidationError,
    );
  });
});