import { z } from 'zod';

const syntheticSourceSystem = z
  .string()
  .trim()
  .min(1)
  .refine(
    value => /^synthetic(?:-|$)/i.test(value) || /-synthetic$/i.test(value),
    'Only an explicitly synthetic source system is currently supported.'
  );

export const patientImportFieldsSchema = z.strictObject({
  mapper: z.literal('synthetic-patient'),
  sourceSystem: syntheticSourceSystem,
});

export const importIdSchema = z.uuid();

export type PatientImportFields = z.infer<typeof patientImportFieldsSchema>;
