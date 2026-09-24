import {
  getNode,
  listNodes,
} from '../services/nodeManagementService';

import {
  generateRegistrationCode,
  hashRegistrationCode,
} from '../services/nodeRegistrationCode';

import { prisma } from '../../db/connection';

describe('node management service', () => {
  const testNodeId = `management-test-${Date.now()}`;

  beforeAll(async () => {
    await prisma.node.create({
      data: {
        nodeId: testNodeId,
        name: 'Management Test Node',
        facilityName: 'Test Rural Health Unit',
        address: 'Test Address',
        registrationCodeHash: hashRegistrationCode(
          generateRegistrationCode(),
        ),
        status: 'pending',
      },
    });
  });

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId: testNodeId,
      },
    });

    await prisma.$disconnect();
  });

  it('lists nodes without exposing credentials', async () => {
    const nodes = await listNodes();

    const node = nodes.find(
      (item) => item.nodeId === testNodeId,
    );

    expect(node).toBeDefined();

    expect(node).toMatchObject({
      nodeId: testNodeId,
      name: 'Management Test Node',
      facilityName: 'Test Rural Health Unit',
      address: 'Test Address',
      status: 'pending',
    });

    expect(node).not.toHaveProperty('authToken');
    expect(node).not.toHaveProperty(
      'authTokenHash',
    );
    expect(node).not.toHaveProperty(
      'registrationCodeHash',
    );
  });

  it('gets a node by nodeId', async () => {
    const node = await getNode(testNodeId);

    expect(node).not.toBeNull();

    expect(node).toMatchObject({
      nodeId: testNodeId,
      name: 'Management Test Node',
      facilityName: 'Test Rural Health Unit',
      address: 'Test Address',
      status: 'pending',
    });

    expect(node).not.toHaveProperty('authToken');
    expect(node).not.toHaveProperty(
      'authTokenHash',
    );
    expect(node).not.toHaveProperty(
      'registrationCodeHash',
    );
  });

  it('returns null for a node that does not exist', async () => {
    const node = await getNode(
      'node-that-does-not-exist',
    );

    expect(node).toBeNull();
  });

  it('returns null for an empty nodeId', async () => {
    const node = await getNode('   ');

    expect(node).toBeNull();
  });
});