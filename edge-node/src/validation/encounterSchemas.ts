import { z } from 'zod';

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.optional();
const dateTime = z.iso.datetime({ offset: true });

export const observationRequestSchema = z
  .strictObject({
    sourceSystem: optionalText,
    sourceRecordId: optionalText,
    code: requiredText,
    valueText: optionalText,
    valueNumeric: z.number().finite().optional(),
    unit: optionalText,
    observedAt: dateTime,
  })
  .superRefine((observation, context) => {
    const valueCount = Number(observation.valueText !== undefined) +
      Number(observation.valueNumeric !== undefined);

    if (valueCount !== 1) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'Observation must contain exactly one of valueText or valueNumeric.',
      });
    }
  });

export const immunizationRequestSchema = z.strictObject({
  sourceSystem: optionalText,
  sourceRecordId: optionalText,
  vaccineCode: requiredText,
  vaccineName: optionalText,
  doseLabel: optionalText,
  administeredDate: dateTime.optional(),
  status: z.enum(['completed', 'not-done', 'unknown']).optional(),
  remarks: optionalText,
});

export const clinicalEncounterRequestSchema = z.strictObject({
  sourceSystem: optionalText,
  sourceRecordId: optionalText,
  encounterDate: dateTime,
  encounterType: optionalText,
  chiefComplaint: optionalText,
  historyPresentIllness: optionalText,
  assessmentPlan: optionalText,
  outcome: optionalText,
  facilityId: optionalText,
  practitionerId: optionalText,
  observations: z.array(observationRequestSchema).default([]),
  immunizations: z.array(immunizationRequestSchema).default([]),
});

export const encounterPatientIdSchema = z.uuid();
export const encounterIdSchema = z.uuid();

export type ClinicalEncounterRequest = z.infer<
  typeof clinicalEncounterRequestSchema
>;
