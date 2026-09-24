import { registerNode } from "../services/nodeRegistrationService";

describe("nodeRegistrationService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers the edge node successfully", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
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
          }),
          {
            status: 201,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const result = await registerNode({
      nodeId: "edge-mainit-001",
      registrationCode: "IDG4H-TEST-CODE",
    });

    expect(result).toEqual({
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

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("http://localhost:5000/nodes/register");

    expect(options).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(JSON.parse(String(options?.body))).toEqual({
      nodeId: "edge-mainit-001",
      registrationCode: "IDG4H-TEST-CODE",
    });
  });

  it("rejects when node ID is empty", async () => {
    await expect(
      registerNode({
        nodeId: "   ",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow("Node ID is required.");
  });

  it("rejects when registration code is empty", async () => {
    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "   ",
      }),
    ).rejects.toThrow("Registration code is required.");
  });

  it("returns the central server error when registration fails", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "No pending registration exists for node edge-mainit-001.",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow(
      "No pending registration exists for node edge-mainit-001.",
    );
  });

  it("rejects when the central server returns invalid JSON", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", {
        status: 500,
      }),
    );

    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow(
      "Central server returned invalid JSON.",
    );
  });

  it("rejects when the central server does not return an auth token", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          node: {
            id: "node-db-id",
            nodeId: "edge-mainit-001",
            name: "Mainit Edge Node",
            facilityName: "Mainit Rural Health Unit",
            address: "Mainit, Surigao del Norte",
            status: "active",
            registeredAt: "2026-09-24T00:00:00.000Z",
          },
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow(
      "Central server did not return an authentication token.",
    );
  });

  it("rejects when the central server does not return node information", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authToken: "test-auth-token",
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow(
      "Central server did not return valid node information.",
    );
  });

  it("propagates network failures", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("fetch failed"),
    );

    await expect(
      registerNode({
        nodeId: "edge-mainit-001",
        registrationCode: "IDG4H-TEST-CODE",
      }),
    ).rejects.toThrow("fetch failed");
  });
});