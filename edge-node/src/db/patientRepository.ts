import { randomUUID } from 'crypto';
import config from '../config';
import { db } from './connection';
import type { Patient, PatientInput } from '../domain';

interface PatientRow {
  id: string;

  source_system: string | null;
  source_record_id: string | null;
  node_id: string;

  family_serial_no: string | null;
  phic_no: string | null;

  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;

  birth_date: string;
  sex: Patient['sex'];

  civil_status: string | null;
  place_of_birth: string | null;
  religion: string | null;
  educational_attainment: string | null;

  contact_number: string | null;
  address_line: string | null;
  purok: string | null;
  barangay: string | null;
  municipality_city: string | null;
  province: string | null;
  district: string | null;

  phic_membership_category: string | null;
  phic_membership_type: string | null;

  employment_status: string | null;
  occupation: string | null;

  spouse_name: string | null;
  spouse_birth_date: string | null;
  spouse_occupation: string | null;
  member_maiden_name: string | null;
  father_name: string | null;
  family_position: string | null;

  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: string | undefined): string | null {
  return value?.trim() || null;
}

function mapPatientRow(row: PatientRow): Patient {
  return {
    id: row.id,

    sourceSystem: row.source_system ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,
    nodeId: row.node_id,

    familySerialNo: row.family_serial_no ?? undefined,
    phicNo: row.phic_no ?? undefined,

    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name ?? undefined,
    suffix: row.suffix ?? undefined,

    birthDate: row.birth_date,
    sex: row.sex,

    civilStatus: row.civil_status ?? undefined,
    placeOfBirth: row.place_of_birth ?? undefined,
    religion: row.religion ?? undefined,
    educationalAttainment:
      row.educational_attainment ?? undefined,

    contactNumber: row.contact_number ?? undefined,
    addressLine: row.address_line ?? undefined,
    purok: row.purok ?? undefined,
    barangay: row.barangay ?? undefined,
    municipalityCity: row.municipality_city ?? undefined,
    province: row.province ?? undefined,
    district: row.district ?? undefined,

    phicMembershipCategory:
      row.phic_membership_category ?? undefined,
    phicMembershipType:
      row.phic_membership_type ?? undefined,

    employmentStatus: row.employment_status ?? undefined,
    occupation: row.occupation ?? undefined,

    spouseName: row.spouse_name ?? undefined,
    spouseBirthDate: row.spouse_birth_date ?? undefined,
    spouseOccupation: row.spouse_occupation ?? undefined,
    memberMaidenName: row.member_maiden_name ?? undefined,
    fatherName: row.father_name ?? undefined,
    familyPosition: row.family_position ?? undefined,

    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPatient(input: PatientInput): Patient {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO patients (
      id,
      source_system,
      source_record_id,
      node_id,
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
      @id,
      @sourceSystem,
      @sourceRecordId,
      @nodeId,
      @familySerialNo,
      @phicNo,
      @lastName,
      @firstName,
      @middleName,
      @suffix,
      @birthDate,
      @sex,
      @civilStatus,
      @placeOfBirth,
      @religion,
      @educationalAttainment,
      @contactNumber,
      @addressLine,
      @purok,
      @barangay,
      @municipalityCity,
      @province,
      @district,
      @phicMembershipCategory,
      @phicMembershipType,
      @employmentStatus,
      @occupation,
      @spouseName,
      @spouseBirthDate,
      @spouseOccupation,
      @memberMaidenName,
      @fatherName,
      @familyPosition,
      1,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,

    sourceSystem: nullable(input.sourceSystem),
    sourceRecordId: nullable(input.sourceRecordId),
    nodeId: config.nodeId,

    familySerialNo: nullable(input.familySerialNo),
    phicNo: nullable(input.phicNo),

    lastName: input.lastName.trim(),
    firstName: input.firstName.trim(),
    middleName: nullable(input.middleName),
    suffix: nullable(input.suffix),

    birthDate: input.birthDate,
    sex: input.sex,

    civilStatus: nullable(input.civilStatus),
    placeOfBirth: nullable(input.placeOfBirth),
    religion: nullable(input.religion),
    educationalAttainment:
      nullable(input.educationalAttainment),

    contactNumber: nullable(input.contactNumber),
    addressLine: nullable(input.addressLine),
    purok: nullable(input.purok),
    barangay: nullable(input.barangay),
    municipalityCity: nullable(input.municipalityCity),
    province: nullable(input.province),
    district: nullable(input.district),

    phicMembershipCategory:
      nullable(input.phicMembershipCategory),
    phicMembershipType:
      nullable(input.phicMembershipType),

    employmentStatus: nullable(input.employmentStatus),
    occupation: nullable(input.occupation),

    spouseName: nullable(input.spouseName),
    spouseBirthDate: nullable(input.spouseBirthDate),
    spouseOccupation: nullable(input.spouseOccupation),
    memberMaidenName: nullable(input.memberMaidenName),
    fatherName: nullable(input.fatherName),
    familyPosition: nullable(input.familyPosition),

    createdAt: now,
    updatedAt: now,
  });

  const patient = findPatientById(id);

  if (!patient) {
    throw new Error(
      `Patient ${id} was inserted but could not be retrieved.`
    );
  }

  return patient;
}

export function findPatientById(
  id: string
): Patient | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM patients
      WHERE id = ?
      LIMIT 1
    `)
    .get(id) as PatientRow | undefined;

  return row ? mapPatientRow(row) : undefined;
}

export function findPatientByPhicNo(
  phicNo: string
): Patient | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM patients
      WHERE phic_no = ?
      LIMIT 1
    `)
    .get(phicNo.trim()) as PatientRow | undefined;

  return row ? mapPatientRow(row) : undefined;
}

export function findPatientByFamilySerialNo(
  familySerialNo: string
): Patient[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM patients
      WHERE family_serial_no = ?
      ORDER BY last_name, first_name, birth_date
    `)
    .all(familySerialNo.trim()) as PatientRow[];

  return rows.map(mapPatientRow);
}

export function searchPatientsByDemographics(
  lastName: string,
  firstName: string,
  birthDate: string
): Patient[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM patients
      WHERE last_name = ? COLLATE NOCASE
        AND first_name = ? COLLATE NOCASE
        AND birth_date = ?
      ORDER BY last_name, first_name
    `)
    .all(
      lastName.trim(),
      firstName.trim(),
      birthDate
    ) as PatientRow[];

  return rows.map(mapPatientRow);
}

export function findPatientBySourceRecord(
  sourceSystem: string,
  sourceRecordId: string
): Patient | undefined {
  const row = db
    .prepare(`
      SELECT *
      FROM patients
      WHERE source_system = ?
        AND source_record_id = ?
      LIMIT 1
    `)
    .get(
      sourceSystem.trim(),
      sourceRecordId.trim()
    ) as PatientRow | undefined;

  return row ? mapPatientRow(row) : undefined;
}
