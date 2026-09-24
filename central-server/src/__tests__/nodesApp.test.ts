import request from "supertest";

import app from "../app";
import {
  generateRegistrationCode,
  hashRegistrationCode,
} from "../nodes/services/nodeRegistrationCode";
import {
  hashAuthToken,
  verifyAuthToken,
} from "../nodes/services/nodeAuthToken";
import { prisma } from "../db/connection";

describe("Node registration through the application", () => {
  const nodeId = `app-test-node-${Date.now()}`;

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId,
      },
    });

    await prisma.$disconnect();
  });

  it("registers a pending node through POST /nodes/register and issues an auth token", async () => {
    const registrationCode = generateRegistrationCode();

    await prisma.node.create({
      data: {
        nodeId,
        name: "Pending App Test Node",
        facilityName: "Pending App Test Facility",
        address: "Pending App Test Address",
        registrationCodeHash: hashRegistrationCode(registrationCode),
        status: "pending",
      },
    });

    const response = await request(app).post("/nodes/register").send({
      nodeId,
      registrationCode,
    });

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      node: {
        nodeId,
        name: "Pending App Test Node",
        facilityName: "Pending App Test Facility",
        address: "Pending App Test Address",
        status: "active",
      },
    });

    expect(response.body.node.registrationCode).toBeUndefined();

    expect(typeof response.body.authToken).toBe("string");
    expect(response.body.authToken).toMatch(/^idg4h_[0-9a-f]+$/);

    const registeredNode = await prisma.node.findUnique({
      where: {
        nodeId,
      },
    });

    expect(registeredNode).not.toBeNull();
    expect(registeredNode?.status).toBe("active");
    expect(registeredNode?.registeredAt).not.toBeNull();

    expect(registeredNode?.authTokenHash).toBeTruthy();

    expect(registeredNode?.authTokenHash).not.toBe(response.body.authToken);

    expect(
      verifyAuthToken(
        response.body.authToken,
        registeredNode?.authTokenHash ?? "",
      ),
    ).toBe(true);

    expect(hashAuthToken(response.body.authToken)).toBe(
      registeredNode?.authTokenHash,
    );
  });
});
