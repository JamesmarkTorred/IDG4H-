import { createPatient } from './patientRepository';
import {
  createEncounter,
  findEncounterById,
  findEncountersByPatientId,
} from './encounterRepository';
import { db } from './connection';

const suffix = Date.now().toString();

const patient = createPatient({
  nodeId: 'edge-baan3-001',

  familySerialNo: `TEST-FAMILY-${suffix}`,

  lastName: 'Dela Cruz',
  firstName: 'Maria',

  birthDate: '1995-06-15',
  sex: 'female',

  barangay: 'Baan 3',
  municipalityCity: 'Butuan City',
});

const encounter = createEncounter({
  patientId: patient.id,
  nodeId: 'edge-baan3-001',

  sourceSystem: 'offline-form',
  sourceRecordId: `ENC-${suffix}`,

  encounterDate: new Date().toISOString(),

  encounterType: 'consultation',
  chiefComplaint: 'Fever',
  historyPresentIllness:
    'Patient reports fever for two days.',
  assessmentPlan:
    'Clinical assessment recorded for test purposes.',
  outcome: 'follow-up',

  facilityId: 'baan3-bhs',
});

console.log('\nCreated encounter:');
console.log(encounter);

console.log('\nFind by ID:');
console.log(findEncounterById(encounter.id));

console.log('\nPatient encounter history:');
console.log(findEncountersByPatientId(patient.id));

if (!findEncounterById(encounter.id)) {
  throw new Error('Encounter lookup failed.');
}

if (
  findEncountersByPatientId(patient.id).length === 0
) {
  throw new Error('Patient encounter history is empty.');
}

console.log('\nEncounter repository validation successful.');

db.close();
