import { createPatient } from './patientRepository';
import { createEncounter } from './encounterRepository';

import {
  createObservation,
  findObservationById,
  findObservationsByEncounterId,
  findObservationsByPatientAndCode,
} from './observationRepository';

import { db } from './connection';

const suffix = Date.now().toString();
const now = new Date().toISOString();

const patient = createPatient({
  nodeId: 'edge-baan3-001',

  familySerialNo: `TEST-FAMILY-${suffix}`,

  lastName: 'Santos',
  firstName: 'Ana',

  birthDate: '1987-04-20',
  sex: 'female',

  barangay: 'Baan 3',
  municipalityCity: 'Butuan City',
});

const encounter = createEncounter({
  patientId: patient.id,
  nodeId: 'edge-baan3-001',

  sourceSystem: 'offline-form',
  sourceRecordId: `ENC-OBS-${suffix}`,

  encounterDate: now,
  encounterType: 'consultation',
});

const systolic = createObservation({
  patientId: patient.id,
  encounterId: encounter.id,
  nodeId: 'edge-baan3-001',

  sourceSystem: 'offline-form',
  sourceRecordId: `OBS-SYS-${suffix}`,

  code: 'systolic-blood-pressure',
  valueNumeric: 120,
  unit: 'mmHg',

  observedAt: now,
});

const diastolic = createObservation({
  patientId: patient.id,
  encounterId: encounter.id,
  nodeId: 'edge-baan3-001',

  sourceSystem: 'offline-form',
  sourceRecordId: `OBS-DIA-${suffix}`,

  code: 'diastolic-blood-pressure',
  valueNumeric: 80,
  unit: 'mmHg',

  observedAt: now,
});

console.log('\nCreated systolic observation:');
console.log(systolic);

console.log('\nCreated diastolic observation:');
console.log(diastolic);

console.log('\nFind systolic by ID:');
console.log(findObservationById(systolic.id));

console.log('\nEncounter observations:');
console.log(
  findObservationsByEncounterId(encounter.id)
);

console.log('\nPatient systolic history:');
console.log(
  findObservationsByPatientAndCode(
    patient.id,
    'systolic-blood-pressure'
  )
);

const encounterObservations =
  findObservationsByEncounterId(encounter.id);

if (encounterObservations.length !== 2) {
  throw new Error(
    'Expected two blood-pressure observations.'
  );
}

console.log(
  '\nObservation repository validation successful.'
);

db.close();
