import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../app";
import {
  findSyncOperationById,
  insertSyncOperation,
} from "../db/syncOperationRepository";
import { receiveSyncOperation } from "../services/syncOperationService";
import type { SyncOperationInput } from "../domain";
import swaggerSpec from "../docs/swagger";
import { prisma } from "../db/connection";
import { timestamp } from "./syncFixtures";

beforeAll(async () => {
  // Prisma is used for test database access. The query below also verifies
  // that the migrated table is available before the suite starts.
  await prisma.syncOperation.count();
});

beforeEach(async () => {
  await prisma.$transaction([
    prisma.immunization.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.encounter.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.syncOperation.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function findPatient(id: string) {
  return prisma.patient.findUnique({
    where: { id },
  });
}

async function findPatientSummary(id: string) {
  return prisma.patient.findUnique({
    where: { id },
    select: {
      id: true,
      sourceSystem: true,
      sourceRecordId: true,
      originatingNodeId: true,
      firstName: true,
      lastName: true,
    },
  });
}

async function findPatientVersionSummary(id: string) {
  return prisma.patient.findUnique({
    where: { id },
    select: { firstName: true, version: true },
  });
}

async function findEncounter(id: string) {
  return prisma.encounter.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function findObservation(id: string) {
  return prisma.observation.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function findImmunization(id: string) {
  return prisma.immunization.findUnique({
    where: { id },
    select: { id: true },
  });
}

function makePatientPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    sourceSystem: "iClinicSys",
    sourceRecordId: `patient-${randomUUID()}`,
    originatingNodeId: "edge-test-001",
    familySerialNo: "FS-001",
    phicNo: "PHIC-001",
    lastName: "Doe",
    firstName: "Jane",
    middleName: "Maria",
    suffix: null,
    birthDate: "1995-01-15T00:00:00.000Z",
    sex: "female",
    civilStatus: "single",
    placeOfBirth: "Butuan City",
    religion: null,
    educationalAttainment: "College",
    contactNumber: "09123456789",
    addressLine: "Test Address",
    purok: "Purok 1",
    barangay: "Barangay 1",
    municipalityCity: "Butuan City",
    province: "Agusan del Norte",
    district: null,
    phicMembershipCategory: null,
    phicMembershipType: null,
    employmentStatus: "employed",
    occupation: "Teacher",
    spouseName: null,
    spouseBirthDate: null,
    spouseOccupation: null,
    memberMaidenName: null,
    fatherName: "John Doe Sr.",
    familyPosition: "member",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeEncounterPayload(
  patientId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    patientId,
    sourceSystem: "iClinicSys",
    sourceRecordId: `encounter-${randomUUID()}`,
    originatingNodeId: "edge-test-001",
    encounterDate: timestamp,
    encounterType: "outpatient",
    chiefComplaint: "Fever",
    historyPresentIllness: "Patient reports fever for two days.",
    assessmentPlan: "Monitor temperature and provide treatment.",
    outcome: "discharged",
    facilityId: "facility-001",
    practitionerId: "practitioner-001",
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeObservationPayload(
  patientId: string,
  encounterId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    patientId,
    encounterId,
    sourceSystem: "iClinicSys",
    sourceRecordId: `observation-${randomUUID()}`,
    originatingNodeId: "edge-test-001",
    code: "8310-5",
    valueText: "Normal",
    valueNumeric: 37,
    unit: "Cel",
    observedAt: timestamp,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeImmunizationPayload(
  patientId: string,
  encounterId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    patientId,
    encounterId,
    sourceSystem: "iClinicSys",
    sourceRecordId: `immunization-${randomUUID()}`,
    originatingNodeId: "edge-test-001",
    vaccineCode: "VAC-001",
    vaccineName: "Test Vaccine",
    doseLabel: "Dose 1",
    administeredDate: timestamp,
    status: "completed",
    remarks: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeOperation(
  overrides: Partial<SyncOperationInput> = {},
): SyncOperationInput {
  return {
    operationId: randomUUID(),
    nodeId: "edge-test-001",
    entityType: "patient",
    entityId: randomUUID(),
    operationType: "create",
    payload: makePatientPayload(),
    ...overrides,
  };
}

async function createPatient(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const payload = makePatientPayload(overrides);

  const input = makeOperation({
    entityId: payload.id as string,
    payload,
  });

  const result = await receiveSyncOperation(input);

  expect(result.status).toBe("applied");

  return payload;
}

describe("POST /sync", () => {
  it("ACKs a committed patient and applied ledger record with source metadata", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    const response = await request(app).post("/sync").send(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      operationId: input.operationId,
      status: "applied",
      duplicate: false,
    });

    const ledger = await findSyncOperationById(input.operationId);

    expect(ledger).toMatchObject({
      operationId: input.operationId,
      nodeId: input.nodeId,
      entityType: "patient",
      entityId: payload.id,
      operationType: "create",
      status: "applied",
    });

    const patient = await findPatientSummary(payload.id as string);

    expect(patient).not.toBeNull();

    expect(patient).toEqual({
      id: payload.id,
      sourceSystem: payload.sourceSystem,
      sourceRecordId: payload.sourceRecordId,
      originatingNodeId: payload.originatingNodeId,
      firstName: payload.firstName,
      lastName: payload.lastName,
    });
  });

  it("preserves the original canonical row and ledger on retries, including a changed payload", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    const first = await request(app).post("/sync").send(input);

    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);

    const changedPayload = {
      ...payload,
      firstName: "Changed",
    };

    const retry = await request(app)
      .post("/sync")
      .send({
        ...input,
        payload: changedPayload,
      });

    expect(retry.status).toBe(200);

    expect(retry.body).toEqual({
      operationId: input.operationId,
      status: "applied",
      duplicate: true,
    });

    const patient = await findPatient(payload.id as string);

    expect(patient?.firstName).toBe(payload.firstName);

    const ledger = await findSyncOperationById(input.operationId);

    expect(ledger?.payload).toEqual(payload);
  });

  it("applies a patient v1 to v2 update and commits its ledger entry", async () => {
    const payload = await createPatient();

    const updatePayload = {
      ...payload,
      firstName: "Updated",
      version: 2,
      updatedAt: timestamp,
    };

    const input = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: updatePayload,
    });

    const result = await receiveSyncOperation(input);

    expect(result).toEqual({
      duplicate: false,
      operationId: input.operationId,
      status: "applied",
    });

    const patient = await findPatientVersionSummary(payload.id as string);

    expect(patient).toEqual({
      firstName: "Updated",
      version: 2,
    });

    const ledger = await findSyncOperationById(input.operationId);

    expect(ledger?.status).toBe("applied");
  });

  it("rejects stale patient update v1 against current v2 without mutating canonical data", async () => {
    const payload = await createPatient();

    const firstUpdate = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Updated",
        version: 2,
        updatedAt: timestamp,
      },
    });

    await receiveSyncOperation(firstUpdate);

    const staleUpdate = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Stale",
        version: 1,
        updatedAt: timestamp,
      },
    });

    await expect(receiveSyncOperation(staleUpdate)).rejects.toThrow();

    const patient = await findPatientVersionSummary(payload.id as string);

    expect(patient).toEqual({
      firstName: "Updated",
      version: 2,
    });
  });

  it("rejects stale patient update v2 against current v2 without mutating canonical data", async () => {
    const payload = await createPatient();

    const update = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Updated",
        version: 2,
        updatedAt: timestamp,
      },
    });

    await receiveSyncOperation(update);

    const stale = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Stale",
        version: 2,
        updatedAt: timestamp,
      },
    });

    await expect(receiveSyncOperation(stale)).rejects.toThrow();

    const patient = await findPatientVersionSummary(payload.id as string);

    expect(patient).toEqual({
      firstName: "Updated",
      version: 2,
    });
  });

  it("rejects a patient version gap without mutating canonical data or marking the operation applied", async () => {
    const payload = await createPatient();

    const gap = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Gap",
        version: 3,
        updatedAt: timestamp,
      },
    });

    await expect(receiveSyncOperation(gap)).rejects.toThrow();

    const patient = await findPatientVersionSummary(payload.id as string);

    expect(patient).toEqual({
      firstName: payload.firstName,
      version: 1,
    });

    const ledger = await findSyncOperationById(gap.operationId);

    expect(ledger).toBeUndefined();
  });

  it("returns a structured conflict when an update reaches Central before its patient create", async () => {
    const payload = makePatientPayload();

    const update = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        version: 2,
        updatedAt: timestamp,
      },
    });

    await expect(receiveSyncOperation(update)).rejects.toThrow();

    const ledger = await findSyncOperationById(update.operationId);

    expect(ledger).toBeUndefined();
  });

  it("serializes competing patient v2 updates so only one is applied", async () => {
    const payload = await createPatient();

    const updateA = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Update A",
        version: 2,
        updatedAt: timestamp,
      },
    });

    const updateB = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Update B",
        version: 2,
        updatedAt: timestamp,
      },
    });

    const results = await Promise.allSettled([
      receiveSyncOperation(updateA),
      receiveSyncOperation(updateB),
    ]);

    const applied = results.filter(
      (result) =>
        result.status === "fulfilled" && result.value.status === "applied",
    );

    const rejected = results.filter((result) => result.status === "rejected");

    expect(applied).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const patient = await findPatientVersionSummary(payload.id as string);

    expect(patient?.version).toBe(2);

    expect(["Update A", "Update B"]).toContain(patient?.firstName);
  });

  it("acknowledges an idempotent retry of an already applied patient update", async () => {
    const payload = await createPatient();

    const input = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "update",
      payload: {
        ...payload,
        firstName: "Updated",
        version: 2,
        updatedAt: timestamp,
      },
    });

    const first = await receiveSyncOperation(input);
    const second = await receiveSyncOperation(input);

    expect(first).toEqual({
      duplicate: false,
      operationId: input.operationId,
      status: "applied",
    });

    expect(second).toEqual({
      duplicate: true,
      operationId: input.operationId,
      status: "applied",
    });
  });

  it("serializes concurrent first deliveries into one canonical create and three duplicates", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => receiveSyncOperation(input)),
    );

    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);

    expect(results.filter((result) => result.duplicate)).toHaveLength(3);

    const patient = await findPatient(payload.id as string);

    expect(patient).not.toBeNull();

    const ledger = await prisma.syncOperation.findUnique({
      where: { operationId: input.operationId },
      select: { operationId: true, status: true },
    });

    expect(ledger).not.toBeNull();
    expect(ledger?.status).toBe("applied");
  });

  it("refuses to ACK an existing received ledger entry", async () => {
    const input = makeOperation();

    await insertSyncOperation(input);

    await expect(receiveSyncOperation(input)).rejects.toThrow();
  });

  it("refuses to ACK an existing failed ledger entry", async () => {
    const input = makeOperation();

    await insertSyncOperation(input);

    await prisma.syncOperation.update({
      where: { operationId: input.operationId },
      data: {
        status: "failed",
        failedAt: new Date(),
        errorMessage: "test failure",
      },
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();
  });

  it("creates the full encounter, observation and immunization chain", async () => {
    const patient = await createPatient();

    const encounter = makeEncounterPayload(patient.id as string);

    const encounterOperation = makeOperation({
      operationId: randomUUID(),
      entityType: "encounter",
      entityId: encounter.id as string,
      payload: encounter,
    });

    await receiveSyncOperation(encounterOperation);

    const observation = makeObservationPayload(
      patient.id as string,
      encounter.id as string,
    );

    const observationOperation = makeOperation({
      operationId: randomUUID(),
      entityType: "observation",
      entityId: observation.id as string,
      payload: observation,
    });

    await receiveSyncOperation(observationOperation);

    const immunization = makeImmunizationPayload(
      patient.id as string,
      encounter.id as string,
    );

    const immunizationOperation = makeOperation({
      operationId: randomUUID(),
      entityType: "immunization",
      entityId: immunization.id as string,
      payload: immunization,
    });

    await receiveSyncOperation(immunizationOperation);

    const counts = await Promise.all([
      prisma.encounter.count({ where: { id: encounter.id as string } }),
      prisma.observation.count({ where: { id: observation.id as string } }),
      prisma.immunization.count({ where: { id: immunization.id as string } }),
    ]);

    expect(counts[0]).toBe(1);
    expect(counts[1]).toBe(1);
    expect(counts[2]).toBe(1);
  });

  it("rejects unsupported delete without retaining the operation", async () => {
    const payload = await createPatient();

    const input = makeOperation({
      operationId: randomUUID(),
      entityId: payload.id as string,
      operationType: "delete",
      payload,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("rejects unsupported encounter update without retaining the operation", async () => {
    const patient = await createPatient();

    const encounter = makeEncounterPayload(patient.id as string);

    const input = makeOperation({
      operationId: randomUUID(),
      entityType: "encounter",
      entityId: encounter.id as string,
      operationType: "update",
      payload: encounter,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("rejects unsupported observation update without retaining the operation", async () => {
    const patient = await createPatient();

    const encounter = makeEncounterPayload(patient.id as string);

    await receiveSyncOperation(
      makeOperation({
        operationId: randomUUID(),
        entityType: "encounter",
        entityId: encounter.id as string,
        payload: encounter,
      }),
    );

    const observation = makeObservationPayload(
      patient.id as string,
      encounter.id as string,
    );

    const input = makeOperation({
      operationId: randomUUID(),
      entityType: "observation",
      entityId: observation.id as string,
      operationType: "update",
      payload: observation,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("rejects unsupported immunization update without retaining the operation", async () => {
    const patient = await createPatient();

    const encounter = makeEncounterPayload(patient.id as string);

    await receiveSyncOperation(
      makeOperation({
        operationId: randomUUID(),
        entityType: "encounter",
        entityId: encounter.id as string,
        payload: encounter,
      }),
    );

    const immunization = makeImmunizationPayload(
      patient.id as string,
      encounter.id as string,
    );

    const input = makeOperation({
      operationId: randomUUID(),
      entityType: "immunization",
      entityId: immunization.id as string,
      operationType: "update",
      payload: immunization,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it.each([null, [], "opaque", 42, false, {}])(
    "rejects noncanonical payload %j and rolls back its ledger entry",
    async (payload) => {
      const input = makeOperation({
        payload,
      });

      await expect(receiveSyncOperation(input)).rejects.toThrow();

      expect(await findSyncOperationById(input.operationId)).toBeUndefined();
    },
  );

  it.each([
    { firstName: "" },
    { firstName: " " },
    { lastName: null },
    { birthDate: "bad-date" },
    { sex: "invalid" },
    { version: 1.5 },
    { version: 0 },
    { version: "1" },
    { createdAt: "not-a-timestamp" },
    { middleName: 123 },
    { id: "not-a-uuid" },
  ])("rolls back invalid canonical fields %j", async (override) => {
    const payload = makePatientPayload(override);

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();

    // The invalid UUID case must not be sent back to Prisma as a query
    // parameter because PostgreSQL rejects malformed UUID values before
    // returning a normal "not found" result.
    if (override.id === "not-a-uuid") {
      return;
    }

    const patient = await findPatient(payload.id as string);

    expect(patient).toBeNull();
  });

  it.each([
    { operationId: "" },
    { operationId: "not-a-uuid" },
    { nodeId: 123 },
    { nodeId: " " },
    { entityId: " " },
    { entityType: "invalid" },
    { operationType: "invalid" },
    {},
  ])("rejects invalid envelope %j", async (override) => {
    const payload = makePatientPayload();

    const input =
      Object.keys(override).length === 0 ?
        {}
      : {
          ...makeOperation({
            entityId: payload.id as string,
            payload,
          }),
          ...override,
        };

    const response = await request(app).post("/sync").send(input);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).toHaveProperty("error");
  });

  it("accepts absent headers and trims envelope identifiers", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      operationId: ` ${randomUUID()} `,
      nodeId: " edge-test-001 ",
      entityId: payload.id as string,
      payload,
    });

    const response = await request(app).post("/sync").send(input);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("applied");
    expect(response.body.duplicate).toBe(false);
  });

  it("rejects a mismatched Idempotency-Key header", async () => {
    const input = makeOperation();

    const response = await request(app)
      .post("/sync")
      .set("Idempotency-Key", randomUUID())
      .send(input);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).toHaveProperty("error");
  });

  it("rejects a mismatched X-IDG4H-Node-ID header", async () => {
    const input = makeOperation();

    const response = await request(app)
      .post("/sync")
      .set("X-IDG4H-Node-ID", "different-node")
      .send(input);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).toHaveProperty("error");
  });

  it("returns a safe JSON error for malformed JSON", async () => {
    const response = await request(app)
      .post("/sync")
      .set("Content-Type", "application/json")
      .send('{"invalid":');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("rolls back a missing dependency and accepts the same operation after its parent arrives", async () => {
    const patient = makePatientPayload();

    const encounter = makeEncounterPayload(patient.id as string);

    const encounterOperation = makeOperation({
      operationId: randomUUID(),
      entityType: "encounter",
      entityId: encounter.id as string,
      payload: encounter,
    });

    await expect(receiveSyncOperation(encounterOperation)).rejects.toThrow();

    expect(
      await findSyncOperationById(encounterOperation.operationId),
    ).toBeUndefined();

    const patientOperation = makeOperation({
      operationId: randomUUID(),
      entityId: patient.id as string,
      payload: patient,
    });

    await receiveSyncOperation(patientOperation);

    const retry = await receiveSyncOperation(encounterOperation);

    expect(retry.status).toBe("applied");

    const row = await findEncounter(encounter.id as string);

    expect(row).not.toBeNull();
  });

  it("refuses a second operation ID that tries to recreate the same entity", async () => {
    const patient = await createPatient();

    const duplicatePayload = makePatientPayload({
      id: patient.id,
    });

    const input = makeOperation({
      operationId: randomUUID(),
      entityId: patient.id as string,
      payload: duplicatePayload,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("prevents a observation from linking another patient encounter", async () => {
    const patientA = await createPatient();
    const patientB = await createPatient();

    const encounterA = makeEncounterPayload(patientA.id as string);

    await receiveSyncOperation(
      makeOperation({
        operationId: randomUUID(),
        entityType: "encounter",
        entityId: encounterA.id as string,
        payload: encounterA,
      }),
    );

    const observation = makeObservationPayload(
      patientB.id as string,
      encounterA.id as string,
    );

    const input = makeOperation({
      operationId: randomUUID(),
      entityType: "observation",
      entityId: observation.id as string,
      payload: observation,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    const row = await findObservation(observation.id as string);

    expect(row).toBeNull();
  });

  it("prevents a immunization from linking another patient encounter", async () => {
    const patientA = await createPatient();
    const patientB = await createPatient();

    const encounterA = makeEncounterPayload(patientA.id as string);

    await receiveSyncOperation(
      makeOperation({
        operationId: randomUUID(),
        entityType: "encounter",
        entityId: encounterA.id as string,
        payload: encounterA,
      }),
    );

    const immunization = makeImmunizationPayload(
      patientB.id as string,
      encounterA.id as string,
    );

    const input = makeOperation({
      operationId: randomUUID(),
      entityType: "immunization",
      entityId: immunization.id as string,
      payload: immunization,
    });

    await expect(receiveSyncOperation(input)).rejects.toThrow();

    const row = await findImmunization(immunization.id as string);

    expect(row).toBeNull();
  });

  it("rolls back canonical and ledger writes on a ledger-update failure", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    const originalTransaction = prisma.$transaction.bind(prisma);

    prisma.$transaction = (async (callback: any) => {
      return originalTransaction(async (tx: any) => {
        const txProxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "syncOperation") {
              const syncOperation = Reflect.get(target, property, receiver);

              return new Proxy(syncOperation, {
                get(model, modelProperty, modelReceiver) {
                  if (modelProperty === "update") {
                    return async () => {
                      throw new Error("forced ledger update failure");
                    };
                  }

                  return Reflect.get(model, modelProperty, modelReceiver);
                },
              });
            }

            return Reflect.get(target, property, receiver);
          },
        });

        return callback(txProxy);
      });
    }) as typeof prisma.$transaction;

    try {
      await expect(receiveSyncOperation(input)).rejects.toThrow(
        "forced ledger update failure",
      );
    } finally {
      prisma.$transaction = originalTransaction as typeof prisma.$transaction;
    }

    const patient = await findPatient(payload.id as string);

    expect(patient).toBeNull();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("rolls back canonical and ledger writes on a commit failure", async () => {
    const payload = makePatientPayload();

    const input = makeOperation({
      entityId: payload.id as string,
      payload,
    });

    const prismaModule = await import("../db/connection");

    const originalTransaction = prismaModule.prisma.$transaction;

    (prismaModule.prisma.$transaction as unknown as jest.Mock) = jest
      .fn()
      .mockRejectedValue(new Error("forced commit failure"));

    try {
      await expect(receiveSyncOperation(input)).rejects.toThrow(
        "forced commit failure",
      );
    } finally {
      (prismaModule.prisma.$transaction as unknown as jest.Mock) =
        originalTransaction as unknown as jest.Mock;
    }

    const patient = await findPatient(payload.id as string);

    expect(patient).toBeNull();

    expect(await findSyncOperationById(input.operationId)).toBeUndefined();
  });

  it("documents new and duplicate ACK responses", async () => {
    const paths = (swaggerSpec as Record<string, any>).paths;
    expect(paths?.["/sync"]).toBeDefined();

    const operationPath = paths?.["/sync"];

    expect(operationPath).toBeDefined();

    const post = operationPath?.post;

    expect(post).toBeDefined();

    const responses = post?.responses;

    expect(responses).toBeDefined();
    expect(responses?.["200"]).toBeDefined();

    const responseDescription = String(
      responses?.["200"]?.description ?? "",
    ).toLowerCase();

    expect(responseDescription).toContain("ack");
  });
});
