import fs from 'node:fs';
import path from 'node:path';

import { db } from '../db/connection';
import { findImportRowsByJobId } from '../db/importRepository';
import { importPatientsFromCsv } from './patientImportService';
import { SyntheticPatientCsvMapper } from './syntheticPatientCsvMapper';

async function main(): Promise<void> {
  const filePath = path.resolve(
    __dirname,
    '../../test-fixtures/synthetic-patient-import.csv'
  );
  const csv = fs.readFileSync(filePath, 'utf8');
  const mapper = new SyntheticPatientCsvMapper('iClinicSys-synthetic');
  const job = importPatientsFromCsv({
    fileName: 'synthetic-patient-import.csv',
    sourceSystem: 'iClinicSys-synthetic',
    csv,
    mapper,
  });

  console.log('\nImport job:');
  console.log(job);
  console.log('\nRow results:');
  console.log(findImportRowsByJobId(job.id));

  if (job.status === 'failed') {
    throw new Error(job.errorMessage ?? 'Synthetic import job failed.');
  }
}

main()
  .catch((error) => {
    console.error('Synthetic import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
