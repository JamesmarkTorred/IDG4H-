import type { PrismaClient, Prisma } from '../generated/prisma/client';

import type { SyncOperationInput } from '../domain';
import { InvalidSyncOperationError } from './syncValidation';

export type PatientVersionConflictReason =
  | 'missing-patient'
  | 'stale-version'
  | 'version-gap';

export class PatientVersionConflictError extends Error {
  readonly code = 'PATIENT_VERSION_CONFLICT';

  constructor(
    readonly entityId: string,
    readonly reason: PatientVersionConflictReason,
    readonly incomingVersion: number,
    readonly currentVersion: number | null,
    readonly expectedVersion: number | null
  ) {
    const detail =
      currentVersion === null
        ? 'the patient does not exist centrally'
        : `Central is at version ${currentVersion} and expected version ${expectedVersion}`;

    super(
      `Patient ${entityId} update version ${incomingVersion} conflicts because ${detail}.`
    );
    this.name = 'PatientVersionConflictError';
  }
}

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

function requiredString(
  payload: Record<string, unknown>,
  key: string
): string {
  const value = payload[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} is required.`
    );
  }

  return value;
}

function requiredUuid(
  payload: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(payload, key);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuid.test(value.trim())) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a UUID.`,
    );
  }

  return value.trim();
}

function requiredSex(
  payload: Record<string, unknown>,
): string {
  const value = requiredString(payload, 'sex').trim().toLowerCase();

  if (value !== 'male' && value !== 'female' && value !== 'other' && value !== 'unknown') {
    throw new InvalidSyncOperationError(
      'Payload field sex must be one of: male, female, other, unknown.',
    );
  }

  return value;
}

function optionalUuid(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a UUID.`,
    );
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuid.test(value.trim())) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a UUID.`,
    );
  }

  return value.trim();
}

function optionalString(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a string.`
    );
  }

  return value;
}

function requiredNumber(
  payload: Record<string, unknown>,
  key: string
): number {
  const value = payload[key];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a finite number.`
    );
  }

  return value;
}

function requiredDate(
  payload: Record<string, unknown>,
  key: string
): Date {
  const value = requiredString(payload, key);
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a valid timestamp.`
    );
  }

  return date;
}

function optionalDate(
  payload: Record<string, unknown>,
  key: string
): Date | null {
  const value = payload[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a string.`
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a valid timestamp.`
    );
  }

  return date;
}

function asPayload(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidSyncOperationError(
      'Synchronization payload must be an object.'
    );
  }

  return value as Record<string, unknown>;
}


async function applyPatientCreate(
  db: DatabaseClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(operation.payload);

  await db.patient.create({
    data: {
      id: requiredUuid(p, 'id'),
      sourceSystem: optionalString(p, 'sourceSystem'),
      sourceRecordId: optionalString(p, 'sourceRecordId'),
      originatingNodeId: operation.nodeId,
      familySerialNo: optionalString(p, 'familySerialNo'),
      phicNo: optionalString(p, 'phicNo'),
      lastName: requiredString(p, 'lastName'),
      firstName: requiredString(p, 'firstName'),
      middleName: optionalString(p, 'middleName'),
      suffix: optionalString(p, 'suffix'),
      birthDate: requiredDate(p, 'birthDate'),
      sex: requiredSex(p),
      civilStatus: optionalString(p, 'civilStatus'),
      placeOfBirth: optionalString(p, 'placeOfBirth'),
      religion: optionalString(p, 'religion'),
      educationalAttainment: optionalString(p, 'educationalAttainment'),
      contactNumber: optionalString(p, 'contactNumber'),
      addressLine: optionalString(p, 'addressLine'),
      purok: optionalString(p, 'purok'),
      barangay: optionalString(p, 'barangay'),
      municipalityCity: optionalString(p, 'municipalityCity'),
      province: optionalString(p, 'province'),
      district: optionalString(p, 'district'),
      phicMembershipCategory: optionalString(p, 'phicMembershipCategory'),
      phicMembershipType: optionalString(p, 'phicMembershipType'),
      employmentStatus: optionalString(p, 'employmentStatus'),
      occupation: optionalString(p, 'occupation'),
      spouseName: optionalString(p, 'spouseName'),
      spouseBirthDate: optionalDate(p, 'spouseBirthDate'),
      spouseOccupation: optionalString(p, 'spouseOccupation'),
      memberMaidenName: optionalString(p, 'memberMaidenName'),
      fatherName: optionalString(p, 'fatherName'),
      familyPosition: optionalString(p, 'familyPosition'),
      version: requiredNumber(p, 'version'),
      createdAt: requiredDate(p, 'createdAt'),
      updatedAt: requiredDate(p, 'updatedAt'),
    },
  });
}

async function applyPatientUpdate(
  db: DatabaseClient,
  operation: SyncOperationInput,
  p: Record<string, unknown>,
  incomingVersion: number
): Promise<void> {
  // Prisma does not expose SELECT ... FOR UPDATE through its model API.
  // Keep the row lock inside the Prisma-managed transaction so concurrent
  // patient updates retain the same serialization guarantees as before.
  const current = await db.$queryRaw<Array<{ version: number }>>`
    SELECT version
    FROM public.patients
    WHERE id = ${operation.entityId}::uuid
    FOR UPDATE
  `;

  const currentVersion = current[0]?.version ?? null;

  if (currentVersion === null) {
    throw new PatientVersionConflictError(
      operation.entityId,
      'missing-patient',
      incomingVersion,
      null,
      null
    );
  }

  const expectedVersion = currentVersion + 1;

  if (incomingVersion !== expectedVersion) {
    throw new PatientVersionConflictError(
      operation.entityId,
      incomingVersion <= currentVersion ? 'stale-version' : 'version-gap',
      incomingVersion,
      currentVersion,
      expectedVersion
    );
  }

  const result = await db.patient.updateMany({
    where: {
      id: operation.entityId,
      version: currentVersion,
    },
    data: {
      sourceSystem: optionalString(p, 'sourceSystem'),
      sourceRecordId: optionalString(p, 'sourceRecordId'),
      familySerialNo: optionalString(p, 'familySerialNo'),
      phicNo: optionalString(p, 'phicNo'),
      lastName: requiredString(p, 'lastName'),
      firstName: requiredString(p, 'firstName'),
      middleName: optionalString(p, 'middleName'),
      suffix: optionalString(p, 'suffix'),
      birthDate: requiredDate(p, 'birthDate'),
      sex: requiredSex(p),
      civilStatus: optionalString(p, 'civilStatus'),
      placeOfBirth: optionalString(p, 'placeOfBirth'),
      religion: optionalString(p, 'religion'),
      educationalAttainment: optionalString(p, 'educationalAttainment'),
      contactNumber: optionalString(p, 'contactNumber'),
      addressLine: optionalString(p, 'addressLine'),
      purok: optionalString(p, 'purok'),
      barangay: optionalString(p, 'barangay'),
      municipalityCity: optionalString(p, 'municipalityCity'),
      province: optionalString(p, 'province'),
      district: optionalString(p, 'district'),
      phicMembershipCategory: optionalString(p, 'phicMembershipCategory'),
      phicMembershipType: optionalString(p, 'phicMembershipType'),
      employmentStatus: optionalString(p, 'employmentStatus'),
      occupation: optionalString(p, 'occupation'),
      spouseName: optionalString(p, 'spouseName'),
      spouseBirthDate: optionalDate(p, 'spouseBirthDate'),
      spouseOccupation: optionalString(p, 'spouseOccupation'),
      memberMaidenName: optionalString(p, 'memberMaidenName'),
      fatherName: optionalString(p, 'fatherName'),
      familyPosition: optionalString(p, 'familyPosition'),
      version: incomingVersion,
      updatedAt: requiredDate(p, 'updatedAt'),
    },
  });

  if (result.count !== 1) {
    throw new PatientVersionConflictError(
      operation.entityId,
      'stale-version',
      incomingVersion,
      currentVersion,
      expectedVersion
    );
  }
}

async function applyEncounterCreate(
  db: DatabaseClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(operation.payload);

  await db.encounter.create({
    data: {
      id: requiredUuid(p, 'id'),
      patientId: requiredUuid(p, 'patientId'),
      sourceSystem: optionalString(p, 'sourceSystem'),
      sourceRecordId: optionalString(p, 'sourceRecordId'),
      originatingNodeId: operation.nodeId,
      encounterDate: requiredDate(p, 'encounterDate'),
      encounterType: optionalString(p, 'encounterType'),
      chiefComplaint: optionalString(p, 'chiefComplaint'),
      historyPresentIllness: optionalString(p, 'historyPresentIllness'),
      assessmentPlan: optionalString(p, 'assessmentPlan'),
      outcome: optionalString(p, 'outcome'),
      facilityId: optionalString(p, 'facilityId'),
      practitionerId: optionalString(p, 'practitionerId'),
      version: requiredNumber(p, 'version'),
      createdAt: requiredDate(p, 'createdAt'),
      updatedAt: requiredDate(p, 'updatedAt'),
    },
  });
}

async function applyObservationCreate(
  db: DatabaseClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(operation.payload);
  const valueNumeric =
    p.valueNumeric === undefined
      ? null
      : requiredNumber(p, 'valueNumeric');

  await db.observation.create({
    data: {
      id: requiredUuid(p, 'id'),
      patientId: requiredUuid(p, 'patientId'),
      encounterId: optionalUuid(p, 'encounterId'),
      sourceSystem: optionalString(p, 'sourceSystem'),
      sourceRecordId: optionalString(p, 'sourceRecordId'),
      originatingNodeId: operation.nodeId,
      code: requiredString(p, 'code'),
      valueText: optionalString(p, 'valueText'),
      valueNumeric,
      unit: optionalString(p, 'unit'),
      observedAt: requiredDate(p, 'observedAt'),
      version: requiredNumber(p, 'version'),
      createdAt: requiredDate(p, 'createdAt'),
      updatedAt: requiredDate(p, 'updatedAt'),
    },
  });
}

async function applyImmunizationCreate(
  db: DatabaseClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(operation.payload);

  await db.immunization.create({
    data: {
      id: requiredUuid(p, 'id'),
      patientId: requiredUuid(p, 'patientId'),
      encounterId: optionalUuid(p, 'encounterId'),
      sourceSystem: optionalString(p, 'sourceSystem'),
      sourceRecordId: optionalString(p, 'sourceRecordId'),
      originatingNodeId: operation.nodeId,
      vaccineCode: requiredString(p, 'vaccineCode'),
      vaccineName: optionalString(p, 'vaccineName'),
      doseLabel: optionalString(p, 'doseLabel'),
      administeredDate: optionalDate(p, 'administeredDate'),
      status: requiredString(p, 'status'),
      remarks: optionalString(p, 'remarks'),
      version: requiredNumber(p, 'version'),
      createdAt: requiredDate(p, 'createdAt'),
      updatedAt: requiredDate(p, 'updatedAt'),
    },
  });
}

export async function applySyncMutation(
  db: DatabaseClient,
  operation: SyncOperationInput
): Promise<void> {
  const payload = asPayload(operation.payload);

  if (
    requiredUuid(payload, 'id').toLowerCase() !==
    operation.entityId.toLowerCase()
  ) {
    throw new InvalidSyncOperationError('Payload id must match entityId.');
  }

  const version = requiredNumber(payload, 'version');
  if (!Number.isInteger(version) || version < 1 || version > 2147483647) {
    throw new InvalidSyncOperationError(
      'Payload version must be a positive PostgreSQL integer.'
    );
  }

  if (operation.operationType === 'update') {
    if (operation.entityType !== 'patient') {
      throw new InvalidSyncOperationError(
        `Update is not implemented for entity type ${operation.entityType}.`
      );
    }

    await applyPatientUpdate(db, operation, payload, version);
    return;
  }

  if (operation.operationType !== 'create') {
    throw new InvalidSyncOperationError(
      `Operation type ${operation.operationType} is not implemented yet.`
    );
  }

  // A child may reference only an encounter belonging to the same patient.
  if (
    operation.entityType === 'observation' ||
    operation.entityType === 'immunization'
  ) {
    const encounterId = optionalString(payload, 'encounterId');

    if (encounterId !== null) {
      const encounter = await db.$queryRaw<Array<{ patientId: string }>>`
        SELECT patient_id AS "patientId"
        FROM public.encounters
        WHERE id = ${encounterId}::uuid
        FOR KEY SHARE
      `;

      if (
        encounter[0] &&
        encounter[0].patientId.toLowerCase() !==
          requiredString(payload, 'patientId').toLowerCase()
      ) {
        throw new InvalidSyncOperationError(
          'Encounter must belong to the payload patient.'
        );
      }
    }
  }

  switch (operation.entityType) {
    case 'patient':
      await applyPatientCreate(db, operation);
      return;

    case 'encounter':
      await applyEncounterCreate(db, operation);
      return;

    case 'observation':
      await applyObservationCreate(db, operation);
      return;

    case 'immunization':
      await applyImmunizationCreate(db, operation);
      return;

    default: {
      const exhaustive: never = operation.entityType;
      throw new Error(`Unsupported entity type: ${exhaustive}`);
    }
  }
}
