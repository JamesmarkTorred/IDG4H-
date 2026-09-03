import {
  createPatientWithOutbox,
} from '../services/patientWriteService';

import { db } from '../db/connection';

const suffix = Date.now().toString();

const patient = createPatientWithOutbox({
  sourceSystem: 'synthetic-test',
  sourceRecordId: `E2E-${suffix}`,
  familySerialNo: `FAMILY-${suffix}`,
  lastName: 'SyncTest',
  firstName: 'Patient',
  birthDate: '1990-01-01',
  sex: 'unknown',
  barangay: 'Synthetic Barangay',
  municipalityCity: 'Butuan City',
});

console.log('Created local patient:');
console.log(patient);

db.close();
