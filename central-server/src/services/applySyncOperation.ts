import type {
  PoolClient,
} from 'pg';

import type {
  SyncOperationInput,
} from '../domain';
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

function requiredString(
  payload: Record<string, unknown>,
  key: string
): string {
  const value = payload[key];

  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} is required.`
    );
  }

  return value;
}

function optionalString(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];

  if (
    value === undefined ||
    value === null
  ) {
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

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new InvalidSyncOperationError(
      `Payload field ${key} must be a finite number.`
    );
  }

  return value;
}

function asPayload(
  value: unknown
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidSyncOperationError(
      'Synchronization payload must be an object.'
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

async function applyPatientCreate(
  client: PoolClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(
    operation.payload
  );

  await client.query(
    `
      INSERT INTO patients (
        id,
        source_system,
        source_record_id,
        originating_node_id,
        family_serial_no,
        phic_no,
        last_name,
        first_name,
        middle_name,
        suffix,
        birth_date,
        sex,
        civil_status,
        place_of_birth,
        religion,
        educational_attainment,
        contact_number,
        address_line,
        purok,
        barangay,
        municipality_city,
        province,
        district,
        phic_membership_category,
        phic_membership_type,
        employment_status,
        occupation,
        spouse_name,
        spouse_birth_date,
        spouse_occupation,
        member_maiden_name,
        father_name,
        family_position,
        version,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36
      )
    `,
    [
      requiredString(p, 'id'),

      optionalString(
        p,
        'sourceSystem'
      ),

      optionalString(
        p,
        'sourceRecordId'
      ),

      operation.nodeId,

      optionalString(
        p,
        'familySerialNo'
      ),

      optionalString(
        p,
        'phicNo'
      ),

      requiredString(
        p,
        'lastName'
      ),

      requiredString(
        p,
        'firstName'
      ),

      optionalString(
        p,
        'middleName'
      ),

      optionalString(
        p,
        'suffix'
      ),

      requiredString(
        p,
        'birthDate'
      ),

      requiredString(
        p,
        'sex'
      ),

      optionalString(
        p,
        'civilStatus'
      ),

      optionalString(
        p,
        'placeOfBirth'
      ),

      optionalString(
        p,
        'religion'
      ),

      optionalString(
        p,
        'educationalAttainment'
      ),

      optionalString(
        p,
        'contactNumber'
      ),

      optionalString(
        p,
        'addressLine'
      ),

      optionalString(
        p,
        'purok'
      ),

      optionalString(
        p,
        'barangay'
      ),

      optionalString(
        p,
        'municipalityCity'
      ),

      optionalString(
        p,
        'province'
      ),

      optionalString(
        p,
        'district'
      ),

      optionalString(
        p,
        'phicMembershipCategory'
      ),

      optionalString(
        p,
        'phicMembershipType'
      ),

      optionalString(
        p,
        'employmentStatus'
      ),

      optionalString(
        p,
        'occupation'
      ),

      optionalString(
        p,
        'spouseName'
      ),

      optionalString(
        p,
        'spouseBirthDate'
      ),

      optionalString(
        p,
        'spouseOccupation'
      ),

      optionalString(
        p,
        'memberMaidenName'
      ),

      optionalString(
        p,
        'fatherName'
      ),

      optionalString(
        p,
        'familyPosition'
      ),

      requiredNumber(
        p,
        'version'
      ),

      requiredString(
        p,
        'createdAt'
      ),

      requiredString(
        p,
        'updatedAt'
      ),
    ]
  );
}

async function applyPatientUpdate(
  client: PoolClient,
  operation: SyncOperationInput,
  p: Record<string, unknown>,
  incomingVersion: number
): Promise<void> {
  const current = await client.query<{
    version: number;
  }>(
    `
      SELECT version
      FROM patients
      WHERE id = $1
      FOR UPDATE
    `,
    [operation.entityId]
  );

  const currentVersion =
    current.rows[0]?.version ?? null;

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
      incomingVersion <= currentVersion
        ? 'stale-version'
        : 'version-gap',
      incomingVersion,
      currentVersion,
      expectedVersion
    );
  }

  const result = await client.query(
    `
      UPDATE patients
      SET
        source_system = $2,
        source_record_id = $3,
        family_serial_no = $4,
        phic_no = $5,
        last_name = $6,
        first_name = $7,
        middle_name = $8,
        suffix = $9,
        birth_date = $10,
        sex = $11,
        civil_status = $12,
        place_of_birth = $13,
        religion = $14,
        educational_attainment = $15,
        contact_number = $16,
        address_line = $17,
        purok = $18,
        barangay = $19,
        municipality_city = $20,
        province = $21,
        district = $22,
        phic_membership_category = $23,
        phic_membership_type = $24,
        employment_status = $25,
        occupation = $26,
        spouse_name = $27,
        spouse_birth_date = $28,
        spouse_occupation = $29,
        member_maiden_name = $30,
        father_name = $31,
        family_position = $32,
        version = $33,
        updated_at = $34
      WHERE id = $1
        AND version = $35
    `,
    [
      operation.entityId,
      optionalString(p, 'sourceSystem'),
      optionalString(p, 'sourceRecordId'),
      optionalString(p, 'familySerialNo'),
      optionalString(p, 'phicNo'),
      requiredString(p, 'lastName'),
      requiredString(p, 'firstName'),
      optionalString(p, 'middleName'),
      optionalString(p, 'suffix'),
      requiredString(p, 'birthDate'),
      requiredString(p, 'sex'),
      optionalString(p, 'civilStatus'),
      optionalString(p, 'placeOfBirth'),
      optionalString(p, 'religion'),
      optionalString(p, 'educationalAttainment'),
      optionalString(p, 'contactNumber'),
      optionalString(p, 'addressLine'),
      optionalString(p, 'purok'),
      optionalString(p, 'barangay'),
      optionalString(p, 'municipalityCity'),
      optionalString(p, 'province'),
      optionalString(p, 'district'),
      optionalString(p, 'phicMembershipCategory'),
      optionalString(p, 'phicMembershipType'),
      optionalString(p, 'employmentStatus'),
      optionalString(p, 'occupation'),
      optionalString(p, 'spouseName'),
      optionalString(p, 'spouseBirthDate'),
      optionalString(p, 'spouseOccupation'),
      optionalString(p, 'memberMaidenName'),
      optionalString(p, 'fatherName'),
      optionalString(p, 'familyPosition'),
      incomingVersion,
      requiredString(p, 'updatedAt'),
      currentVersion,
    ]
  );

  if (result.rowCount !== 1) {
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
  client: PoolClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(
    operation.payload
  );

  await client.query(
    `
      INSERT INTO encounters (
        id,
        patient_id,
        source_system,
        source_record_id,
        originating_node_id,
        encounter_date,
        encounter_type,
        chief_complaint,
        history_present_illness,
        assessment_plan,
        outcome,
        facility_id,
        practitioner_id,
        version,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15,$16
      )
    `,
    [
      requiredString(p, 'id'),
      requiredString(p, 'patientId'),

      optionalString(p, 'sourceSystem'),
      optionalString(p, 'sourceRecordId'),

      operation.nodeId,

      requiredString(p, 'encounterDate'),

      optionalString(p, 'encounterType'),
      optionalString(p, 'chiefComplaint'),
      optionalString(
        p,
        'historyPresentIllness'
      ),
      optionalString(p, 'assessmentPlan'),
      optionalString(p, 'outcome'),

      optionalString(p, 'facilityId'),
      optionalString(p, 'practitionerId'),

      requiredNumber(p, 'version'),

      requiredString(p, 'createdAt'),
      requiredString(p, 'updatedAt'),
    ]
  );
}

async function applyObservationCreate(
  client: PoolClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(
    operation.payload
  );

  const valueNumeric =
    p.valueNumeric === undefined
      ? null
      : requiredNumber(
          p,
          'valueNumeric'
        );

  await client.query(
    `
      INSERT INTO observations (
        id,
        patient_id,
        encounter_id,
        source_system,
        source_record_id,
        originating_node_id,
        code,
        value_text,
        value_numeric,
        unit,
        observed_at,
        version,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14
      )
    `,
    [
      requiredString(p, 'id'),
      requiredString(p, 'patientId'),

      optionalString(p, 'encounterId'),

      optionalString(p, 'sourceSystem'),
      optionalString(p, 'sourceRecordId'),

      operation.nodeId,

      requiredString(p, 'code'),

      optionalString(p, 'valueText'),
      valueNumeric,
      optionalString(p, 'unit'),

      requiredString(p, 'observedAt'),

      requiredNumber(p, 'version'),

      requiredString(p, 'createdAt'),
      requiredString(p, 'updatedAt'),
    ]
  );
}

async function applyImmunizationCreate(
  client: PoolClient,
  operation: SyncOperationInput
): Promise<void> {
  const p = asPayload(
    operation.payload
  );

  await client.query(
    `
      INSERT INTO immunizations (
        id,
        patient_id,
        encounter_id,
        source_system,
        source_record_id,
        originating_node_id,
        vaccine_code,
        vaccine_name,
        dose_label,
        administered_date,
        status,
        remarks,
        version,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15
      )
    `,
    [
      requiredString(p, 'id'),
      requiredString(p, 'patientId'),

      optionalString(p, 'encounterId'),

      optionalString(p, 'sourceSystem'),
      optionalString(p, 'sourceRecordId'),

      operation.nodeId,

      requiredString(p, 'vaccineCode'),
      optionalString(p, 'vaccineName'),
      optionalString(p, 'doseLabel'),
      optionalString(
        p,
        'administeredDate'
      ),

      requiredString(p, 'status'),
      optionalString(p, 'remarks'),

      requiredNumber(p, 'version'),

      requiredString(p, 'createdAt'),
      requiredString(p, 'updatedAt'),
    ]
  );
}

export async function applySyncMutation(
  client: PoolClient,
  operation: SyncOperationInput
): Promise<void> {
  const payload = asPayload(operation.payload);
  if (requiredString(payload, 'id').toLowerCase() !== operation.entityId.toLowerCase()) {
    throw new InvalidSyncOperationError('Payload id must match entityId.');
  }
  const version = requiredNumber(payload, 'version');
  if (!Number.isInteger(version) || version < 1 || version > 2147483647) {
    throw new InvalidSyncOperationError('Payload version must be a positive PostgreSQL integer.');
  }

  if (operation.operationType === 'update') {
    if (operation.entityType !== 'patient') {
      throw new InvalidSyncOperationError(
        `Update is not implemented for entity type ${operation.entityType}.`
      );
    }

    await applyPatientUpdate(
      client,
      operation,
      payload,
      version
    );
    return;
  }

  if (operation.operationType !== 'create') {
    throw new InvalidSyncOperationError(
      `Operation type ${operation.operationType} is not implemented yet.`
    );
  }

  // A child may reference only an encounter belonging to the same patient.
  if (operation.entityType === 'observation' || operation.entityType === 'immunization') {
    const encounterId = optionalString(payload, 'encounterId');
    if (encounterId !== null) {
      const encounter = await client.query<{ patient_id: string }>(
        'SELECT patient_id FROM encounters WHERE id = $1 FOR KEY SHARE', [encounterId]
      );
      if (encounter.rows[0] && encounter.rows[0].patient_id !== requiredString(payload, 'patientId').toLowerCase()) {
        throw new InvalidSyncOperationError('Encounter must belong to the payload patient.');
      }
    }
  }

  switch (
    operation.entityType
  ) {
    case 'patient':
      await applyPatientCreate(
        client,
        operation
      );
      return;

    case 'encounter':
      await applyEncounterCreate(
        client,
        operation
      );
      return;

    case 'observation':
      await applyObservationCreate(
        client,
        operation
      );
      return;

    case 'immunization':
      await applyImmunizationCreate(
        client,
        operation
      );
      return;

    default: {
      const exhaustive:
        never =
        operation.entityType;

      throw new Error(
        `Unsupported entity type: ${exhaustive}`
      );
    }
  }
}
