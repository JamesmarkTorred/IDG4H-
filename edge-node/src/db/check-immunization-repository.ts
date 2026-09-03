import config from '../config';
import { createPatient } from './patientRepository';
import { createEncounter } from './encounterRepository';

import {
  createImmunization,
  findImmunizationById,
  findImmunizationsByEncounterId,
  findImmunizationsByPatientAndVaccine,
} from './immunizationRepository';

import { db } from './connection';

const suffix = Date.now().toString();
const now = new Date().toISOString();

const patient = createPatient({
  nodeId: config.nodeId,

  familySerialNo: `TEST-FAMILY-${suffix}`,

  lastName: 'Reyes',
  firstName: 'Pedro',

  birthDate: '2025-01-15',
  sex: 'male',

  barangay: 'Baan 3',
  municipalityCity: 'Butuan City',
});

const encounter = createEncounter({
  patientId: patient.id,
  nodeId: config.nodeId,

  sourceSystem: 'offline-form',
  sourceRecordId: `ENC-IMM-${suffix}`,

  encounterDate: now,
  encounterType: 'immunization',
});

const immunization = createImmunization({
  patientId: patient.id,
  encounterId: encounter.id,
  nodeId: config.nodeId,

  sourceSystem: 'offline-form',
  sourceRecordId: `IMM-${suffix}`,

  vaccineCode: 'BCG',
  vaccineName: 'BCG',
  doseLabel: 'dose-1',
  administeredDate: now,
  status: 'completed',
});

console.log('\nCreated immunization:');
console.log(immunization);

console.log('\nFind by ID:');
console.log(
  findImmunizationById(immunization.id)
);

console.log('\nEncounter immunizations:');
console.log(
  findImmunizationsByEncounterId(encounter.id)
);

console.log('\nPatient BCG history:');
console.log(
  findImmunizationsByPatientAndVaccine(
    patient.id,
    'BCG'
  )
);

if (!findImmunizationById(immunization.id)) {
  throw new Error('Immunization lookup failed.');
}

if (
  findImmunizationsByEncounterId(encounter.id).length !== 1
) {
  throw new Error(
    'Expected one immunization for the encounter.'
  );
}

console.log(
  '\nImmunization repository validation successful.'
);

db.close();
