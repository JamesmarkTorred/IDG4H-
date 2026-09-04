import { z } from 'zod';

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.optional();

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD format.')
  .refine(isCalendarDate, 'Must be a valid calendar date.');

const patientFields = {
  sourceSystem: optionalText,
  sourceRecordId: optionalText,

  familySerialNo: optionalText,
  phicNo: optionalText,

  lastName: requiredText,
  firstName: requiredText,
  middleName: optionalText,
  suffix: optionalText,

  birthDate,
  sex: z.enum(['male', 'female', 'other', 'unknown']),

  civilStatus: optionalText,
  placeOfBirth: optionalText,
  religion: optionalText,
  educationalAttainment: optionalText,

  contactNumber: optionalText,
  addressLine: optionalText,
  purok: optionalText,
  barangay: optionalText,
  municipalityCity: optionalText,
  province: optionalText,
  district: optionalText,

  phicMembershipCategory: optionalText,
  phicMembershipType: optionalText,

  employmentStatus: optionalText,
  occupation: optionalText,

  spouseName: optionalText,
  spouseBirthDate: birthDate.optional(),
  spouseOccupation: optionalText,
  memberMaidenName: optionalText,
  fatherName: optionalText,
  familyPosition: optionalText,
};

export const patientCreateSchema = z.strictObject(patientFields);

const patientUpdateFields = Object.fromEntries(
  Object.entries(patientFields).map(([name, schema]) => [
    name,
    schema.optional(),
  ])
) as {
  [Key in keyof typeof patientFields]: z.ZodOptional<(typeof patientFields)[Key]>;
};

export const patientUpdateSchema = z
  .strictObject({
    expectedVersion: z.number().int().positive(),
    ...patientUpdateFields,
  })
  .refine(
    input => Object.keys(input).some(key => key !== 'expectedVersion'),
    {
      message: 'At least one patient field must be supplied.',
      path: [],
    }
  );

export const patientSearchSchema = z.strictObject({
  lastName: requiredText,
  firstName: requiredText,
  birthDate,
});

export const patientIdSchema = z.uuid();

export type PatientCreateRequest = z.infer<typeof patientCreateSchema>;
export type PatientUpdateRequest = z.infer<typeof patientUpdateSchema>;
export type PatientSearchRequest = z.infer<typeof patientSearchSchema>;
