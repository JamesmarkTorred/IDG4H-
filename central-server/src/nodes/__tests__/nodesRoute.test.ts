import express from 'express';
import request from 'supertest';

import nodesRouter from '../routes/nodes';
import {
  generateRegistrationCode,
  hashRegistrationCode,
} from '../services/nodeRegistrationCode';
import {
  hashAuthToken,
  verifyAuthToken,
} from '../services/nodeAuthToken';
import { prisma } from '../../db/connection';

const app = express();

app.use(express.json());
app.use('/nodes', nodesRouter);

describe('Node registration API', () => {
  const nodeId = `route-test-node-${Date.now()}`;

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId: {
          in: [
            nodeId,
            'route-test-missing-node',
            'route-test-invalid-code',
          ],
        },
      },
    });

    await prisma.$disconnect();
  });

  it('registers a pending node, returns 201, and issues an auth token', async () => {
    const registrationCode = generateRegistrationCode();

    await prisma.node.create({
      data: {
        nodeId,
        name: 'Pending Node',
        facilityName: 'Pending Facility',
        address: 'Pending Address',
        registrationCodeHash:
          hashRegistrationCode(registrationCode),
        status: 'pending',
      },
    });

    const response = await request(app)
      .post('/nodes/register')
      .send({
        nodeId,
        name: 'Mainit Edge Node',
        facilityName: 'Mainit Rural Health Unit',
        address: 'Mainit, Surigao del Norte',
        registrationCode,
      });

    expect(response.status).toBe(201);

    expect(response.body.node).toMatchObject({
      nodeId,
      name: 'Mainit Edge Node',
      facilityName: 'Mainit Rural Health Unit',
      address: 'Mainit, Surigao del Norte',
      status: 'active',
    });

    expect(response.body.node.registrationCode).toBeUndefined();

    expect(typeof response.body.authToken).toBe('string');
    expect(response.body.authToken).toMatch(/^idg4h_[0-9a-f]+$/);

    const registeredNode = await prisma.node.findUnique({
      where: {
        nodeId,
      },
    });

    expect(registeredNode).not.toBeNull();

    expect(registeredNode?.authTokenHash).toBeTruthy();

    expect(registeredNode?.authTokenHash).not.toBe(
      response.body.authToken,
    );

    expect(
      verifyAuthToken(
        response.body.authToken,
        registeredNode?.authTokenHash ?? '',
      ),
    ).toBe(true);

    expect(
      hashAuthToken(response.body.authToken),
    ).toBe(registeredNode?.authTokenHash);
  });

  it('returns 400 for a missing required field', async () => {
    const response = await request(app)
      .post('/nodes/register')
      .send({
        nodeId: 'route-test-missing-field',
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: '',
        registrationCode: 'IDG4H-TEST',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'address is required.',
    });
  });

  it('returns 404 when no pending node exists', async () => {
    const response = await request(app)
      .post('/nodes/register')
      .send({
        nodeId: 'route-test-missing-node',
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
        registrationCode: generateRegistrationCode(),
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain(
      'No pending registration exists',
    );
  });

  it('returns 401 for an invalid registration code', async () => {
    await prisma.node.create({
      data: {
        nodeId: 'route-test-invalid-code',
        name: 'Pending Node',
        facilityName: 'Pending Facility',
        address: 'Pending Address',
        registrationCodeHash:
          hashRegistrationCode('IDG4H-CORRECT-CODE'),
        status: 'pending',
      },
    });

    const response = await request(app)
      .post('/nodes/register')
      .send({
        nodeId: 'route-test-invalid-code',
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
        registrationCode: 'IDG4H-WRONG-CODE',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid registration code.',
    });
  });

  it('returns 409 when the node is already active', async () => {
    const activeNodeId = `route-test-active-${Date.now()}`;

    await prisma.node.create({
      data: {
        nodeId: activeNodeId,
        name: 'Active Node',
        facilityName: 'Active Facility',
        address: 'Active Address',
        registrationCodeHash:
          hashRegistrationCode('IDG4H-ACTIVE-CODE'),
        status: 'active',
      },
    });

    const response = await request(app)
      .post('/nodes/register')
      .send({
        nodeId: activeNodeId,
        name: 'Test Node',
        facilityName: 'Test Facility',
        address: 'Test Address',
        registrationCode: 'IDG4H-ACTIVE-CODE',
      });

    expect(response.status).toBe(409);

    await prisma.node.delete({
      where: {
        nodeId: activeNodeId,
      },
    });
  });
});