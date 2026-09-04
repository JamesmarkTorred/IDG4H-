import { parseCsv } from '../import/csvParser';

describe('parseCsv', () => {
  test('parses normal CSV rows and preserves headers', () => {
    expect(parseCsv(
      'last_name,first_name,birth_date\nDela Cruz,Juan,1990-01-01\nSantos,Maria,1995-05-15'
    )).toEqual([
      {
        rowNumber: 2,
        data: {
          last_name: 'Dela Cruz',
          first_name: 'Juan',
          birth_date: '1990-01-01',
        },
      },
      {
        rowNumber: 3,
        data: {
          last_name: 'Santos',
          first_name: 'Maria',
          birth_date: '1995-05-15',
        },
      },
    ]);
  });

  test('parses quoted commas using CSV rules', () => {
    expect(parseCsv('last_name,first_name\n"Garcia, Jr.",Juan')).toEqual([
      {
        rowNumber: 2,
        data: {
          last_name: 'Garcia, Jr.',
          first_name: 'Juan',
        },
      },
    ]);
  });

  test('handles a UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFlast_name,first_name\nReyes,Pedro')[0].data).toEqual({
      last_name: 'Reyes',
      first_name: 'Pedro',
    });
  });

  test('handles CRLF records', () => {
    expect(parseCsv('last_name,first_name\r\nReyes,Pedro\r\n')).toEqual([
      {
        rowNumber: 2,
        data: { last_name: 'Reyes', first_name: 'Pedro' },
      },
    ]);
  });

  test('rejects an empty CSV file', () => {
    expect(() => parseCsv('')).toThrow('CSV file is empty.');
  });

  test('rejects duplicate headers without regard to case', () => {
    expect(() => parseCsv('last_name,LAST_NAME\nReyes,Pedro')).toThrow(
      'CSV contains duplicate column headers.'
    );
  });

  test('rejects an empty column header', () => {
    expect(() => parseCsv('last_name,,first_name\nReyes,x,Pedro')).toThrow(
      'CSV contains an empty column header.'
    );
  });

  test('rejects malformed column counts', () => {
    expect(() => parseCsv('last_name,first_name\nReyes,Pedro,extra')).toThrow();
  });

  test('reports the physical CSV line after skipped empty lines', () => {
    expect(parseCsv('last_name,first_name\n\nReyes,Pedro')[0].rowNumber).toBe(3);
  });
});
