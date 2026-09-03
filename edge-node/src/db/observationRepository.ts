import { randomUUID } from 'crypto';
import config from '../config';
import { db } from './connection';
import type {
  Observation,
  ObservationInput,
} from '../domain';

interface ObservationRow {
  id: string;

  patient_id: string;
  encounter_id: string | null;

  source_system: string | null;
  source_record_id: string | null;
  node_id: string;

  code: string;
  value_text: string | null;
  value_numeric: number | null;
  unit: string | null;

  observed_at: string;

  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: string | undefined): string | null {
  return value?.trim() || null;
}

function mapObservationRow(
  row: ObservationRow
): Observation {
  return {
    id: row.id,

    patientId: row.patient_id,
    encounterId: row.encounter_id ?? undefined,
    nodeId: row.node_id,

    sourceSystem: row.source_system ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,

    code: row.code,

    valueText: row.value_text ?? undefined,
    valueNumeric: row.value_numeric ?? undefined,
    unit: row.unit ?? undefined,

    observedAt: row.observed_at,

    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensurePatientExists(patientId: string): void {
  const patient = db
    .prepare(`
      SELECT id
      FROM patients
      WHERE id = ?
      LIMIT 1
    `)
    .get(patientId);

  if (!patient) {
    throw new Error(
      `Cannot create observation: patient ${patientId} does not exist.`
    );
  }
}

function ensureEncounterBelongsToPatient(
  encounterId: string,
  patientId: string
): void {
  const encounter = db
    .prepare(`
      SELECT id
      FROM encounters
      WHERE id = ?
        AND patient_id = ?
      LIMIT 1
    `)
    .get(encounterId, patientId);

  if (!encounter) {
    throw new Error(
      `Cannot create observation: encounter ${encounterId} does not belong to patient ${patientId}.`
    );
  }
}

function validateObservationValue(
  input: ObservationInput
): void {
  const hasText =
    input.valueText !== undefined &&
    input.valueText.trim().length > 0;

  const hasNumeric =
    input.valueNumeric !== undefined;

  if (!hasText && !hasNumeric) {
    throw new Error(
      'Observation must contain valueText or valueNumeric.'
    );
  }

  if (hasText && hasNumeric) {
    throw new Error(
      'Observation cannot contain both valueText and valueNumeric.'
    );
  }

  if (
    hasNumeric &&
    !Number.isFinite(input.valueNumeric)
  ) {
    throw new Error(
      'Observation valueNumeric must be a finite number.'
    );
  }
}

export function createObservation(
  input: ObservationInput
): Observation {
  ensurePatientExists(input.patientId);

  if (input.encounterId) {
    ensureEncounterBelongsToPatient(
      input.encounterId,
      input.patientId
    );
  }

  validateObservationValue(input);

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO observations (
      id,
      patient_id,
      encounter_id,
      source_system,
      source_record_id,
      node_id,
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
      @id,
      @patientId,
      @encounterId,
      @sourceSystem,
      @sourceRecordId,
      @nodeId,
      @code,
      @valueText,
      @valueNumeric,
      @unit,
      @observedAt,
      1,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,

    patientId: input.patientId,
    encounterId: nullable(input.encounterId),

    sourceSystem: nullable(input.sourceSystem),
    sourceRecordId: nullable(input.sourceRecordId),
    nodeId: config.nodeId,

    code: input.code.trim(),
    valueText: nullable(input.valueText),
    valueNumeric:
      input.valueNumeric ?? null,
    unit: nullable(input.unit),

    observedAt: input.observedAt,

    createdAt: now,
    updatedAt: now,
  });

  const observation = findObservationById(id);

  if (!observation) {
    throw new Error(
      `Observation ${id} was inserted but could not be retrieved.`
    );
  }

  return observation;
}

export function findObservationById(
  id: string
): Observation | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as ObservationRow | undefined;

  return row ? mapObservationRow(row) : undefined;
}

export function findObservationsByPatientId(
  patientId: string
): Observation[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM observations
      WHERE patient_id = ?
      ORDER BY observed_at DESC, created_at DESC
    `)
    .all(patientId) as ObservationRow[];

  return rows.map(mapObservationRow);
}

export function findObservationsByEncounterId(
  encounterId: string
): Observation[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM observations
      WHERE encounter_id = ?
      ORDER BY observed_at ASC, created_at ASC
    `)
    .all(encounterId) as ObservationRow[];

  return rows.map(mapObservationRow);
}

export function findObservationsByPatientAndCode(
  patientId: string,
  code: string
): Observation[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM observations
      WHERE patient_id = ?
        AND code = ? COLLATE NOCASE
      ORDER BY observed_at DESC, created_at DESC
    `)
    .all(
      patientId,
      code.trim()
    ) as ObservationRow[];

  return rows.map(mapObservationRow);
}

export function findObservationBySourceRecord(
  sourceSystem: string,
  sourceRecordId: string
): Observation | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM observations
      WHERE source_system = ?
        AND source_record_id = ?
      LIMIT 1
    `)
    .get(
      sourceSystem.trim(),
      sourceRecordId.trim()
    ) as ObservationRow | undefined;

  return row ? mapObservationRow(row) : undefined;
}
