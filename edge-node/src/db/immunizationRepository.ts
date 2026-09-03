import { randomUUID } from 'crypto';
import { db } from './connection';
import type {
  Immunization,
  ImmunizationInput,
} from '../domain';

interface ImmunizationRow {
  id: string;

  patient_id: string;
  encounter_id: string | null;

  source_system: string | null;
  source_record_id: string | null;
  node_id: string;

  vaccine_code: string;
  vaccine_name: string | null;
  dose_label: string | null;
  administered_date: string | null;
  status: Immunization['status'];
  remarks: string | null;

  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: string | undefined): string | null {
  return value?.trim() || null;
}

function mapImmunizationRow(
  row: ImmunizationRow
): Immunization {
  return {
    id: row.id,

    patientId: row.patient_id,
    encounterId: row.encounter_id ?? undefined,
    nodeId: row.node_id,

    sourceSystem: row.source_system ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,

    vaccineCode: row.vaccine_code,
    vaccineName: row.vaccine_name ?? undefined,
    doseLabel: row.dose_label ?? undefined,
    administeredDate: row.administered_date ?? undefined,

    status: row.status ?? undefined,
    remarks: row.remarks ?? undefined,

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
      `Cannot create immunization: patient ${patientId} does not exist.`
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
      `Cannot create immunization: encounter ${encounterId} does not belong to patient ${patientId}.`
    );
  }
}

export function createImmunization(
  input: ImmunizationInput
): Immunization {
  ensurePatientExists(input.patientId);

  if (input.encounterId) {
    ensureEncounterBelongsToPatient(
      input.encounterId,
      input.patientId
    );
  }

  if (!input.vaccineCode.trim()) {
    throw new Error('vaccineCode is required.');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO immunizations (
      id,
      patient_id,
      encounter_id,
      source_system,
      source_record_id,
      node_id,
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
      @id,
      @patientId,
      @encounterId,
      @sourceSystem,
      @sourceRecordId,
      @nodeId,
      @vaccineCode,
      @vaccineName,
      @doseLabel,
      @administeredDate,
      @status,
      @remarks,
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
    nodeId: input.nodeId,

    vaccineCode: input.vaccineCode.trim(),
    vaccineName: nullable(input.vaccineName),
    doseLabel: nullable(input.doseLabel),
    administeredDate:
      nullable(input.administeredDate),

    status: input.status ?? 'completed',
    remarks: nullable(input.remarks),

    createdAt: now,
    updatedAt: now,
  });

  const immunization = findImmunizationById(id);

  if (!immunization) {
    throw new Error(
      `Immunization ${id} was inserted but could not be retrieved.`
    );
  }

  return immunization;
}

export function findImmunizationById(
  id: string
): Immunization | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM immunizations
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as ImmunizationRow | undefined;

  return row ? mapImmunizationRow(row) : undefined;
}

export function findImmunizationsByPatientId(
  patientId: string
): Immunization[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM immunizations
      WHERE patient_id = ?
      ORDER BY administered_date DESC, created_at DESC
    `)
    .all(patientId) as ImmunizationRow[];

  return rows.map(mapImmunizationRow);
}

export function findImmunizationsByEncounterId(
  encounterId: string
): Immunization[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM immunizations
      WHERE encounter_id = ?
      ORDER BY administered_date ASC, created_at ASC
    `)
    .all(encounterId) as ImmunizationRow[];

  return rows.map(mapImmunizationRow);
}

export function findImmunizationsByPatientAndVaccine(
  patientId: string,
  vaccineCode: string
): Immunization[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM immunizations
      WHERE patient_id = ?
        AND vaccine_code = ? COLLATE NOCASE
      ORDER BY administered_date ASC, created_at ASC
    `)
    .all(
      patientId,
      vaccineCode.trim()
    ) as ImmunizationRow[];

  return rows.map(mapImmunizationRow);
}

export function findImmunizationBySourceRecord(
  sourceSystem: string,
  sourceRecordId: string
): Immunization | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM immunizations
      WHERE source_system = ?
        AND source_record_id = ?
      LIMIT 1
    `)
    .get(
      sourceSystem.trim(),
      sourceRecordId.trim()
    ) as ImmunizationRow | undefined;

  return row ? mapImmunizationRow(row) : undefined;
}
