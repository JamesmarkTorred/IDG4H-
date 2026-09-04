import { parse } from 'csv-parse/sync';

import type { ParsedImportRow } from './parsedImportRow';

interface ParsedRecord {
  record: string[];
  info: {
    lines: number;
  };
}

export function parseCsv(
  input: string
): ParsedImportRow[] {
  const records = parse(input, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    info: true,
  }) as unknown as ParsedRecord[];

  if (records.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = records[0].record.map(header => header.trim());

  if (headers.some(header => header.length === 0)) {
    throw new Error('CSV contains an empty column header.');
  }

  const normalizedHeaders = headers.map(header => header.toLowerCase());

  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('CSV contains duplicate column headers.');
  }

  return records.slice(1).map(({ record: values, info }) => {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${info.lines} has ${values.length} columns; expected ${headers.length}.`
      );
    }

    const data: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      data[header] = values[columnIndex] ?? '';
    });

    return {
      rowNumber: info.lines,
      data,
    };
  });
}
