import fs from 'node:fs';
import path from 'node:path';

import ExcelJS from 'exceljs';

import { parseXlsx } from '../import/xlsxParser';

async function createWorkbookBuffer(
  sheets: Array<{
    name: string;
    rows: Array<Array<ExcelJS.CellValue>>;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(new Uint8Array(data));
}

function readSyntheticFixture(): Buffer {
  return fs.readFileSync(path.resolve(
    __dirname,
    '../../test-fixtures/synthetic-patient-import.xlsx'
  ));
}

describe('parseXlsx', () => {
  test('parses the synthetic workbook headers and valid rows', async () => {
    await expect(parseXlsx(readSyntheticFixture())).resolves.toEqual([
      {
        rowNumber: 2,
        data: {
          source_record_id: 'E2E-XLSX-001',
          last_name: 'ExcelImport',
          first_name: 'Alpha',
          birth_date: '1990-01-01',
          sex: 'male',
          barangay: 'Synthetic Barangay',
          municipality_city: 'Butuan City',
        },
      },
      {
        rowNumber: 4,
        data: {
          source_record_id: 'E2E-XLSX-002',
          last_name: 'ExcelImport',
          first_name: 'Beta',
          birth_date: '1995-05-15',
          sex: 'female',
          barangay: 'Synthetic Barangay',
          municipality_city: 'Butuan City',
        },
      },
    ]);
  });

  test('ignores blank rows while preserving physical Excel row numbers', async () => {
    const rows = await parseXlsx(readSyntheticFixture());

    expect(rows.map(row => row.rowNumber)).toEqual([2, 4]);
  });

  test('normalizes numbers, booleans, dates, and surrounding whitespace to strings', async () => {
    const workbook = await createWorkbookBuffer([
      {
        name: 'Values',
        rows: [
          ['text', 'number', 'boolean', 'date'],
          ['  Patient  ', 42, true, new Date('2001-02-03T00:00:00.000Z')],
        ],
      },
    ]);

    await expect(parseXlsx(workbook)).resolves.toEqual([
      {
        rowNumber: 2,
        data: {
          text: 'Patient',
          number: '42',
          boolean: 'true',
          date: '2001-02-03',
        },
      },
    ]);
  });

  test('rejects duplicate headers without regard to case', async () => {
    const workbook = await createWorkbookBuffer([
      {
        name: 'Patients',
        rows: [
          ['last_name', 'LAST_NAME'],
          ['Reyes', 'Pedro'],
        ],
      },
    ]);

    await expect(parseXlsx(workbook)).rejects.toThrow(
      'XLSX contains duplicate column headers.'
    );
  });

  test('rejects an empty worksheet', async () => {
    const workbook = await createWorkbookBuffer([
      { name: 'Patients', rows: [] },
    ]);

    await expect(parseXlsx(workbook)).rejects.toThrow(
      'XLSX worksheet is empty.'
    );
  });

  test('uses the first worksheet deterministically', async () => {
    const workbook = await createWorkbookBuffer([
      {
        name: 'First',
        rows: [
          ['source_record_id'],
          ['FIRST-001'],
        ],
      },
      {
        name: 'Second',
        rows: [
          ['source_record_id'],
          ['SECOND-001'],
        ],
      },
    ]);

    await expect(parseXlsx(workbook)).resolves.toEqual([
      {
        rowNumber: 2,
        data: { source_record_id: 'FIRST-001' },
      },
    ]);
  });
});
