import request from "supertest";

import app from "../../app";
import {
  generateRegistrationCode,
  hashRegistrationCode,
} from "../services/nodeRegistrationCode";
import { verifyAuthToken } from "../services/nodeAuthToken";
import { prisma } from "../../db/connection";

import {
  createAdmin,
} from "../../auth/services/adminAuthenticationService";

import {
  createAdminSession,
} from "../../auth/services/adminSessionService";

function getSetCookieHeaders(
  value: string | string[] | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

describe("Node registration API", () => {
  const nodeId = `route-test-node-${Date.now()}`;

  afterAll(async () => {
    await prisma.node.deleteMany({
      where: {
        nodeId,
      },
    });
  });

  it("registers a pending node, returns 201, and issues an auth token", async () => {
    const registrationCode = generateRegistrationCode();

    await prisma.node.create({
      data: {
        nodeId,
        name: "Pending Node",
        facilityName: "Pending Facility",
        address: "Pending Address",
        registrationCodeHash:
          hashRegistrationCode(registrationCode),
        status: "pending",
      },
    });

    const response = await request(app)
      .post("/nodes/register")
      .send({
        nodeId,
        registrationCode,
      });

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      node: {
        nodeId,
        name: "Pending Node",
        facilityName: "Pending Facility",
        address: "Pending Address",
        status: "active",
      },
    });

    expect(response.body.node.registrationCode).toBeUndefined();

    expect(typeof response.body.authToken).toBe("string");
    expect(response.body.authToken).toMatch(
      /^idg4h_[0-9a-f]+$/,
    );

    const registeredNode =
      await prisma.node.findUnique({
        where: {
          nodeId,
        },
      });

    expect(registeredNode).not.toBeNull();

    expect(registeredNode?.status).toBe("active");

    expect(
      registeredNode?.registeredAt,
    ).not.toBeNull();

    expect(
      registeredNode?.authTokenHash,
    ).toBeTruthy();

    expect(
      verifyAuthToken(
        response.body.authToken,
        registeredNode?.authTokenHash ?? "",
      ),
    ).toBe(true);
  });

  it("returns 400 for a missing nodeId", async () => {
    const response = await request(app)
      .post("/nodes/register")
      .send({
        registrationCode: "IDG4H-TEST-CODE",
      });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "nodeId is required.",
    });
  });

  it("returns 400 for a missing registrationCode", async () => {
    const response = await request(app)
      .post("/nodes/register")
      .send({
        nodeId: "missing-registration-code-node",
      });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "registrationCode is required.",
    });
  });

  it("returns 404 when the node does not exist", async () => {
    const response = await request(app)
      .post("/nodes/register")
      .send({
        nodeId: "nonexistent-route-node",
        registrationCode: "IDG4H-TEST-CODE",
      });

    expect(response.status).toBe(404);

    expect(response.body).toEqual({
      error:
        "No pending registration exists for node nonexistent-route-node.",
    });
  });

  it("returns 401 for an invalid registration code", async () => {
    const invalidCodeNodeId =
      `invalid-code-route-node-${Date.now()}`;

    await prisma.node.create({
      data: {
        nodeId: invalidCodeNodeId,
        name: "Pending Node",
        facilityName: "Pending Facility",
        address: "Pending Address",
        registrationCodeHash:
          hashRegistrationCode(
            "IDG4H-CORRECT-CODE",
          ),
        status: "pending",
      },
    });

    const response = await request(app)
      .post("/nodes/register")
      .send({
        nodeId: invalidCodeNodeId,
        registrationCode: "IDG4H-WRONG-CODE",
      });

    expect(response.status).toBe(401);

    expect(response.body).toEqual({
      error: "Invalid registration code.",
    });

    await prisma.node.delete({
      where: {
        nodeId: invalidCodeNodeId,
      },
    });
  });

  it("returns 409 when the node is already registered", async () => {
    const activeNodeId =
      `active-route-node-${Date.now()}`;

    await prisma.node.create({
      data: {
        nodeId: activeNodeId,
        name: "Active Node",
        facilityName: "Active Facility",
        address: "Active Address",
        registrationCodeHash:
          hashRegistrationCode(
            "IDG4H-ACTIVE-CODE",
          ),
        status: "active",
      },
    });

    const response = await request(app)
      .post("/nodes/register")
      .send({
        nodeId: activeNodeId,
        registrationCode:
          "IDG4H-ACTIVE-CODE",
      });

    expect(response.status).toBe(409);

    expect(response.body).toEqual({
      error:
        `Node ${activeNodeId} is already registered.`,
    });

    await prisma.node.delete({
      where: {
        nodeId: activeNodeId,
      },
    });
  });
});

describe("Node management API", () => {
  const adminEmail =
    `nodes-route-admin-${Date.now()}@idg4h.local`;

  const adminPassword =
    "TestPassword123!";

  let adminSessionCookie: string;

  beforeAll(async () => {
    const admin = await createAdmin(
      adminEmail,
      adminPassword,
    );

    const session =
      await createAdminSession(admin.id);

    adminSessionCookie =
      `idg4h_session=${session.sessionToken}`;
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({
      where: {
        user: {
          email: adminEmail,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: adminEmail,
      },
    });

    await prisma.$disconnect();
  });

  it("lists managed nodes without exposing credentials", async () => {
    const managedNodeId =
      `managed-list-node-${Date.now()}`;

    await prisma.node.create({
      data: {
        nodeId: managedNodeId,
        name: "Mainit Edge Node",
        facilityName:
          "Mainit Rural Health Unit",
        address:
          "Mainit, Surigao del Norte",
        registrationCodeHash:
          hashRegistrationCode(
            "IDG4H-LIST-TEST-CODE",
          ),
        authTokenHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "active",
        registeredAt: new Date(),
      },
    });

    try {
      const response = await request(app)
        .get("/nodes")
        .set(
          "Cookie",
          adminSessionCookie,
        );

      expect(response.status).toBe(200);

      expect(response.body.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId: managedNodeId,
            name: "Mainit Edge Node",
            facilityName:
              "Mainit Rural Health Unit",
            address:
              "Mainit, Surigao del Norte",
            status: "active",
          }),
        ]),
      );

      const returnedNode =
        response.body.nodes.find(
          (node: { nodeId: string }) =>
            node.nodeId === managedNodeId,
        );

      expect(returnedNode).toBeDefined();

      expect(
        returnedNode.registrationCodeHash,
      ).toBeUndefined();

      expect(
        returnedNode.authTokenHash,
      ).toBeUndefined();

      expect(
        returnedNode.authToken,
      ).toBeUndefined();
    } finally {
      await prisma.node.delete({
        where: {
          nodeId: managedNodeId,
        },
      });
    }
  });

  it("gets a managed node by nodeId without exposing credentials", async () => {
    const managedNodeId =
      `managed-get-node-${Date.now()}`;

    await prisma.node.create({
      data: {
        nodeId: managedNodeId,
        name: "Mainit Edge Node",
        facilityName:
          "Mainit Rural Health Unit",
        address:
          "Mainit, Surigao del Norte",
        registrationCodeHash:
          hashRegistrationCode(
            "IDG4H-GET-TEST-CODE",
          ),
        authTokenHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        status: "active",
        registeredAt: new Date(),
      },
    });

    try {
      const response = await request(app)
        .get(`/nodes/${managedNodeId}`)
        .set(
          "Cookie",
          adminSessionCookie,
        );

      expect(response.status).toBe(200);

      expect(response.body).toMatchObject({
        node: {
          nodeId: managedNodeId,
          name: "Mainit Edge Node",
          facilityName:
            "Mainit Rural Health Unit",
          address:
            "Mainit, Surigao del Norte",
          status: "active",
        },
      });

      expect(
        response.body.node.registrationCodeHash,
      ).toBeUndefined();

      expect(
        response.body.node.authTokenHash,
      ).toBeUndefined();

      expect(
        response.body.node.authToken,
      ).toBeUndefined();
    } finally {
      await prisma.node.delete({
        where: {
          nodeId: managedNodeId,
        },
      });
    }
  });

  it("returns 404 when getting a node that does not exist", async () => {
    const response = await request(app)
      .get(
        "/nodes/nonexistent-management-node",
      )
      .set(
        "Cookie",
        adminSessionCookie,
      );

    expect(response.status).toBe(404);

    expect(response.body).toEqual({
      error:
        "Node nonexistent-management-node not found.",
    });
  });

  it("returns 401 when listing nodes without an admin session", async () => {
    const response = await request(app)
      .get("/nodes");

    expect(response.status).toBe(401);
  });

  it("returns 401 when getting a node without an admin session", async () => {
    const response = await request(app)
      .get("/nodes/nonexistent-management-node");

    expect(response.status).toBe(401);
  });
});