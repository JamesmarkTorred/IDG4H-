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
        name: 'Pending Node',
        facilityName: 'Pending Facility',
        address: 'Pending Address',
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
      name: 'Mainit Edge Node',
      facilityName: 'Mainit Rural Health Unit',
      address:
        'Mainit, Surigao del Norte',
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
  });

  it('rejects a node that does not exist', async () => {
    await expect(
      registerNode({
        nodeId: 'missing-registration-node',
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
        registrationCode: generateRegistrationCode(),
      }),
    ).rejects.toBeInstanceOf(NodeNotFoundError);
  });

  it('rejects an already active node', async () => {
    await expect(
      registerNode({
        nodeId: pendingNodeId,
        name: 'Duplicate Node',
        facilityName: 'Duplicate Facility',
        address: 'Duplicate Address',
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
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
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
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
        registrationCode: 'IDG4H-TEST-CODE',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationValidationError,
    );
  });

  it('rejects an empty facility name', async () => {
    await expect(
      registerNode({
        nodeId: pendingNodeId,
        name: 'Test Node',
        facilityName: '   ',
        address: 'Test Address',
        registrationCode: 'IDG4H-TEST-CODE',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationValidationError,
    );
  });

  it('rejects an empty address', async () => {
    await expect(
      registerNode({
        nodeId: pendingNodeId,
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: '   ',
        registrationCode: 'IDG4H-TEST-CODE',
      }),
    ).rejects.toBeInstanceOf(
      NodeRegistrationValidationError,
    );
  });
});