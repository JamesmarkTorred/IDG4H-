import config from '../config';
import {
  createPatient,
  findPatientById,
  findPatientByPhicNo,
  findPatientByFamilySerialNo,
  searchPatientsByDemographics,
} from './patientRepository';

import { db } from './connection';

const suffix = Date.now().toString();

const patient = createPatient({
  nodeId: config.nodeId,

  familySerialNo: `TEST-FAMILY-${suffix}`,
  phicNo: `TEST-PHIC-${suffix}`,

  lastName: 'Dela Cruz',
  firstName: 'Juan',
  middleName: 'Santos',

  birthDate: '1990-05-10',
  sex: 'male',

  civilStatus: 'married',

  contactNumber: '09123456789',

  purok: 'Purok 1',
  barangay: 'Baan 3',
  municipalityCity: 'Butuan City',
  province: 'Agusan del Norte',

  occupation: 'Farmer',
});

console.log('\nCreated:');
console.log(patient);

console.log('\nFind by ID:');
console.log(findPatientById(patient.id));

console.log('\nFind by PHIC:');
console.log(findPatientByPhicNo(patient.phicNo!));

console.log('\nFind family members:');
console.log(
  findPatientByFamilySerialNo(patient.familySerialNo!)
);

console.log('\nSearch demographics:');
console.log(
  searchPatientsByDemographics(
    'dela cruz',
    'juan',
    '1990-05-10'
  )
);

db.close();
