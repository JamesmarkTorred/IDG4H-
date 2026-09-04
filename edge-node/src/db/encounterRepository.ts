import { randomUUID } from 'crypto';
import config from '../config';
import { db } from './connection';
import type { Encounter, EncounterInput } from '../domain';
import { PatientNotFoundError } from '../domain/patientErrors';

interface EncounterRow {
  id: string;
  patient_id: string;

  source_system: string | null;
  source_record_id: string | null;
  node_id: string;

  encounter_date: string;
  encounter_type: string | null;

  chief_complaint: string | null;
  history_present_illness: string | null;
  assessment_plan: string | null;
  outcome: string | null;

  facility_id: string | null;
  practitioner_id: string | null;

  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: string | undefined): string | null {
  return value?.trim() || null;
}

function mapEncounterRow(row: EncounterRow): Encounter {
  return {
    id: row.id,

    patientId: row.patient_id,
    nodeId: row.node_id,

    sourceSystem: row.source_system ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,

    encounterDate: row.encounter_date,
    encounterType: row.encounter_type ?? undefined,

    chiefComplaint: row.chief_complaint ?? undefined,
    historyPresentIllness:
      row.history_present_illness ?? undefined,
    assessmentPlan: row.assessment_plan ?? undefined,
    outcome: row.outcome ?? undefined,

    facilityId: row.facility_id ?? undefined,
    practitionerId: row.practitioner_id ?? undefined,

    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createEncounter(
  input: EncounterInput
): Encounter {
  const patientExists = db
    .prepare(`
      SELECT id
      FROM patients
      WHERE id = ?
      LIMIT 1
    `)
    .get(input.patientId);

  if (!patientExists) {
    throw new PatientNotFoundError(input.patientId, 'encounter');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO encounters (
      id,
      patient_id,
      source_system,
      source_record_id,
      node_id,
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
      @id,
      @patientId,
      @sourceSystem,
      @sourceRecordId,
      @nodeId,
      @encounterDate,
      @encounterType,
      @chiefComplaint,
      @historyPresentIllness,
      @assessmentPlan,
      @outcome,
      @facilityId,
      @practitionerId,
      1,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,

    patientId: input.patientId,

    sourceSystem: nullable(input.sourceSystem),
    sourceRecordId: nullable(input.sourceRecordId),
    nodeId: config.nodeId,

    encounterDate: input.encounterDate,
    encounterType: nullable(input.encounterType),

    chiefComplaint: nullable(input.chiefComplaint),
    historyPresentIllness:
      nullable(input.historyPresentIllness),
    assessmentPlan: nullable(input.assessmentPlan),
    outcome: nullable(input.outcome),

    facilityId: nullable(input.facilityId),
    practitionerId: nullable(input.practitionerId),

    createdAt: now,
    updatedAt: now,
  });

  const encounter = findEncounterById(id);

  if (!encounter) {
    throw new Error(
      `Encounter ${id} was inserted but could not be retrieved.`
    );
  }

  return encounter;
}

export function findEncounterById(
  id: string
): Encounter | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM encounters
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as EncounterRow | undefined;

  return row ? mapEncounterRow(row) : undefined;
}

export function findEncountersByPatientId(
  patientId: string
): Encounter[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM encounters
      WHERE patient_id = ?
      ORDER BY encounter_date DESC, created_at DESC
    `)
    .all(patientId) as EncounterRow[];

  return rows.map(mapEncounterRow);
}

export function findEncounterBySourceRecord(
  sourceSystem: string,
  sourceRecordId: string
): Encounter | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM encounters
      WHERE source_system = ?
        AND source_record_id = ?
      LIMIT 1
    `)
    .get(
      sourceSystem.trim(),
      sourceRecordId.trim()
    ) as EncounterRow | undefined;

  return row ? mapEncounterRow(row) : undefined;
}
