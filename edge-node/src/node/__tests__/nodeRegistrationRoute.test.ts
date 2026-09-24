import express from "express";
import request from "supertest";

import nodeRegistrationRouter from "../routes/nodeRegistration";
import * as nodeRegistrationService from "../services/nodeRegistrationService";

describe("nodeRegistration route", () => {
  const app = express();

  app.use(express.json());
  app.use("/api/node", nodeRegistrationRouter);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers an edge node successfully", async () => {
    const registerNodeMock = jest
      .spyOn(nodeRegistrationService, "registerNode")
      .mockResolvedValue({
        node: {
          id: "node-db-id",
          nodeId: "edge-mainit-001",
          name: "Mainit Edge Node",
          facilityName: "Mainit Rural Health Unit",
          address: "Mainit, Surigao del Norte",
          status: "active",
          registeredAt: "2026-09-24T00:00:00.000Z",
        },
        authToken: "test-auth-token",
      });

    const response = await request(app).post("/api/node/register").send({
      nodeId: "edge-mainit-001",
      registrationCode: "IDG4H-TEST-CODE",
    });

    expect(response.status).toBe(201);

    expect(response.body).toEqual({
      node: {
        id: "node-db-id",
        nodeId: "edge-mainit-001",
        name: "Mainit Edge Node",
        facilityName: "Mainit Rural Health Unit",
        address: "Mainit, Surigao del Norte",
        status: "active",
        registeredAt: "2026-09-24T00:00:00.000Z",
      },
      authToken: "test-auth-token",
    });

    expect(registerNodeMock).toHaveBeenCalledTimes(1);

    expect(registerNodeMock).toHaveBeenCalledWith({
      nodeId: "edge-mainit-001",
      registrationCode: "IDG4H-TEST-CODE",
    });
  });

  it("rejects a request without nodeId", async () => {
    const registerNodeMock = jest.spyOn(
      nodeRegistrationService,
      "registerNode",
    );

    const response = await request(app).post("/api/node/register").send({
      registrationCode: "IDG4H-TEST-CODE",
    });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "nodeId is required.",
    });

    expect(registerNodeMock).not.toHaveBeenCalled();
  });

  it("rejects a request without registrationCode", async () => {
    const registerNodeMock = jest.spyOn(
      nodeRegistrationService,
      "registerNode",
    );

    const response = await request(app).post("/api/node/register").send({
      nodeId: "edge-mainit-001",
    });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "registrationCode is required.",
    });

    expect(registerNodeMock).not.toHaveBeenCalled();
  });

  it("rejects an empty nodeId", async () => {
    const registerNodeMock = jest.spyOn(
      nodeRegistrationService,
      "registerNode",
    );

    const response = await request(app).post("/api/node/register").send({
      nodeId: "   ",
      registrationCode: "IDG4H-TEST-CODE",
    });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "nodeId is required.",
    });

    expect(registerNodeMock).not.toHaveBeenCalled();
  });

  it("rejects an empty registrationCode", async () => {
    const registerNodeMock = jest.spyOn(
      nodeRegistrationService,
      "registerNode",
    );

    const response = await request(app).post("/api/node/register").send({
      nodeId: "edge-mainit-001",
      registrationCode: "   ",
    });

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "registrationCode is required.",
    });

    expect(registerNodeMock).not.toHaveBeenCalled();
  });

  it("returns the service error when central registration fails", async () => {
    jest
      .spyOn(nodeRegistrationService, "registerNode")
      .mockRejectedValue(
        new Error("No pending registration exists for node edge-mainit-001."),
      );

    const response = await request(app).post("/api/node/register").send({
      nodeId: "edge-mainit-001",
      registrationCode: "IDG4H-TEST-CODE",
    });

    expect(response.status).toBe(502);

    expect(response.body).toEqual({
      error: "No pending registration exists for node edge-mainit-001.",
    });
  });

  it("rejects an empty request body", async () => {
    const registerNodeMock = jest.spyOn(
      nodeRegistrationService,
      "registerNode",
    );

    const response = await request(app).post("/api/node/register").send();

    expect(response.status).toBe(400);

    expect(response.body).toEqual({
      error: "nodeId is required.",
    });

    expect(registerNodeMock).not.toHaveBeenCalled();
  });
});
