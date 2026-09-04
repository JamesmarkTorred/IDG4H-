import type { PatientInput, Sex } from '../domain';

import type { PatientSourceMapper } from './patientSourceMapper';

const validSexValues = new Set<Sex>([
  'male',
  'female',
  'other',
  'unknown',
]);

function optional(
  value: string | undefined
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export class SyntheticPatientMapper
  implements PatientSourceMapper
{
  constructor(
    private readonly sourceSystem: string = 'synthetic-test'
  ) {}

  map(row: Record<string, string>): PatientInput {
    const sex = row.sex?.trim().toLowerCase();

    if (!validSexValues.has(sex as Sex)) {
      throw new Error(`Invalid sex value: ${row.sex ?? ''}`);
    }

    return {
      sourceSystem: this.sourceSystem,
      sourceRecordId: optional(row.source_record_id),
      familySerialNo: optional(row.family_serial_no),
      phicNo: optional(row.phic_no),

      lastName: row.last_name?.trim() ?? '',
      firstName: row.first_name?.trim() ?? '',
      middleName: optional(row.middle_name),
      suffix: optional(row.suffix),

      birthDate: row.birth_date?.trim() ?? '',
      sex: sex as Sex,

      contactNumber: optional(row.contact_number),
      addressLine: optional(row.address_line),
      purok: optional(row.purok),
      barangay: optional(row.barangay),
      municipalityCity: optional(row.municipality_city),
      province: optional(row.province),
    };
  }
}
