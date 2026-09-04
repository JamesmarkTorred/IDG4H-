import fs from 'node:fs';
import path from 'node:path';

import { db } from '../db/connection';
import { findImportRowsByJobId } from '../db/importRepository';
import { importPatientsFromXlsx } from './patientImportService';
import { SyntheticPatientMapper } from './syntheticPatientMapper';

async function main(): Promise<void> {
  const filePath = path.resolve(
    __dirname,
    '../../test-fixtures/synthetic-patient-import.xlsx'
  );
  const mapper = new SyntheticPatientMapper('synthetic-xlsx');
  const job = await importPatientsFromXlsx({
    fileName: 'synthetic-patient-import.xlsx',
    sourceSystem: 'synthetic-xlsx',
    xlsx: fs.readFileSync(filePath),
    mapper,
  });

  console.log('\nXLSX import job:');
  console.log(job);
  console.log('\nRow results:');
  console.log(findImportRowsByJobId(job.id));

  if (job.status === 'failed') {
    throw new Error(job.errorMessage ?? 'Synthetic XLSX import job failed.');
  }
}

main()
  .catch((error) => {
    console.error('Synthetic XLSX import failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
