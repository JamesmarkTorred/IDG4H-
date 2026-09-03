import { createPatientWithOutbox } from './patientWriteService';
import { findPendingOutbox } from '../db/outboxRepository';

import {
  findEncountersByPatientId,
} from '../db/encounterRepository';

import {
  findObservationsByPatientId,
} from '../db/observationRepository';

import {
  findImmunizationsByPatientId,
} from '../db/immunizationRepository';

import {
  saveClinicalEncounter,
} from './clinicalEncounterService';

import { db } from '../db/connection';

const suffix = Date.now().toString();
const now = new Date().toISOString();

const patient = createPatientWithOutbox({

  familySerialNo: `TEST-FAMILY-${suffix}`,

  lastName: 'Garcia',
  firstName: 'Elena',

  birthDate: '1992-08-12',
  sex: 'female',

  barangay: 'Baan 3',
  municipalityCity: 'Butuan City',
});

console.log('\nPatient created:');
console.log(patient.id);

/*
 * TEST 1
 * Successful complete clinical encounter
 */

const result = saveClinicalEncounter({
  patientId: patient.id,

  encounter: {

    sourceSystem: 'offline-form',
    sourceRecordId: `VISIT-${suffix}`,

    encounterDate: now,
    encounterType: 'consultation',

    chiefComplaint: 'Routine consultation',
    outcome: 'completed',
  },

  observations: [
    {

      code: 'systolic-blood-pressure',
      valueNumeric: 118,
      unit: 'mmHg',

      observedAt: now,
    },
    {

      code: 'diastolic-blood-pressure',
      valueNumeric: 76,
      unit: 'mmHg',

      observedAt: now,
    },
    {

      code: 'body-temperature',
      valueNumeric: 36.7,
      unit: 'Cel',

      observedAt: now,
    },
  ],

  immunizations: [
    {

      vaccineCode: 'TEST-VACCINE',
      vaccineName: 'Synthetic Test Vaccine',
      doseLabel: 'dose-1',

      administeredDate: now,
      status: 'completed',
    },
  ],
});

console.log('\nClinical encounter saved:');
console.log(result);

if (result.observations.length !== 3) {
  throw new Error(
    'Expected three observations.'
  );
}

if (result.immunizations.length !== 1) {
  throw new Error(
    'Expected one immunization.'
  );
}

console.log(
  '\n[OK] Successful transaction committed.'
);

/*
 * TEST 2
 * Deliberately cause a failure.
 *
 * This observation is invalid because it contains
 * both valueText and valueNumeric.
 *
 * The entire encounter must roll back.
 */

const encountersBefore =
  findEncountersByPatientId(patient.id).length;

const observationsBefore =
  findObservationsByPatientId(patient.id).length;

const immunizationsBefore =
  findImmunizationsByPatientId(patient.id).length;

const outboxBefore = findPendingOutbox(Number.MAX_SAFE_INTEGER);

let transactionFailed = false;

try {
  saveClinicalEncounter({
    patientId: patient.id,

    encounter: {

      sourceSystem: 'offline-form',
      sourceRecordId:
        `ROLLBACK-VISIT-${suffix}`,

      encounterDate: now,
      encounterType: 'consultation',
    },

    observations: [
      {

        code: 'invalid-test-observation',

        valueText: 'invalid',
        valueNumeric: 123,

        observedAt: now,
      },
    ],

    immunizations: [],
  });

} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== 'Observation cannot contain both valueText and valueNumeric.'
  ) {
    throw error;
  }

  transactionFailed = true;
  console.log(
    '\nExpected transaction failure detected.'
  );
}

if (!transactionFailed) {
  throw new Error(
    'Invalid clinical encounter unexpectedly succeeded.'
  );
}

const encountersAfter =
  findEncountersByPatientId(patient.id).length;

const observationsAfter =
  findObservationsByPatientId(patient.id).length;

const immunizationsAfter =
  findImmunizationsByPatientId(patient.id).length;

const outboxAfter = findPendingOutbox(Number.MAX_SAFE_INTEGER);

if (JSON.stringify(outboxAfter) !== JSON.stringify(outboxBefore)) {
  throw new Error('Rollback failed: outbox operations changed.');
}

if (encountersAfter !== encountersBefore) {
  throw new Error(
    'Rollback failed: encounter remained in database.'
  );
}

if (observationsAfter !== observationsBefore) {
  throw new Error(
    'Rollback failed: observation remained in database.'
  );
}

if (immunizationsAfter !== immunizationsBefore) {
  throw new Error(
    'Rollback failed: immunization remained in database.'
  );
}

console.log(
  '[OK] Failed transaction completely rolled back.'
);

console.log(
  '\nClinical encounter transaction validation successful.'
);

db.close();
