import ExcelJS from 'exceljs';

import type { ParsedImportRow } from './parsedImportRow';

interface PhysicalRow {
  rowNumber: number;
  values: string[];
}

function normalizeCell(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return cell.text.trim();
}

export async function parseXlsx(
  input: Buffer
): Promise<ParsedImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  const workbookData = Uint8Array.from(input).buffer;
  await workbook.xlsx.load(workbookData);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('XLSX workbook contains no worksheets.');
  }

  const physicalRows: PhysicalRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, row => {
    const values = Array.from(
      { length: row.cellCount },
      (_, columnIndex) => normalizeCell(row.getCell(columnIndex + 1))
    );

    if (values.some(value => value.length > 0)) {
      physicalRows.push({
        rowNumber: row.number,
        values,
      });
    }
  });

  if (physicalRows.length === 0) {
    throw new Error('XLSX worksheet is empty.');
  }

  const headers = physicalRows[0].values;

  if (headers.some(header => header.length === 0)) {
    throw new Error('XLSX contains an empty column header.');
  }

  const normalizedHeaders = headers.map(header => header.toLowerCase());

  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('XLSX contains duplicate column headers.');
  }

  return physicalRows.slice(1).map(row => {
    const extraValues = row.values.slice(headers.length);

    if (extraValues.some(value => value.length > 0)) {
      throw new Error(
        `XLSX row ${row.rowNumber} has values beyond the ${headers.length} declared columns.`
      );
    }

    const data: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      data[header] = row.values[columnIndex] ?? '';
    });

    return {
      rowNumber: row.rowNumber,
      data,
    };
  });
}
