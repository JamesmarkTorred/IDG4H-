import config from '../config';
import { registerPatient } from './patientRegistrationService';
import { db } from '../db/connection';

const suffix = Date.now().toString();

const basePatient = {
  nodeId: config.nodeId,
  sourceSystem: 'offline-form',
  sourceRecordId: `SRC-${suffix}`,
  phicNo: `PHIC-${suffix}`,

  lastName: 'Dela Cruz',
  firstName: 'Juan',
  birthDate: '1990-05-10',

  sex: 'male' as const,
};

const first = registerPatient(basePatient);

console.log('First registration:');
console.log(first);

const second = registerPatient({
  ...basePatient,
  sourceRecordId: `DIFFERENT-${suffix}`,
});

console.log('\nSecond registration:');
console.log(second);

if (!first.created) {
  throw new Error('First patient should have been created.');
}

if (second.created) {
  throw new Error('Duplicate candidate should not be auto-created.');
}

if (second.candidates.length === 0) {
  throw new Error('Expected duplicate candidate.');
}

console.log('\nPatient identity validation successful.');

db.close();
