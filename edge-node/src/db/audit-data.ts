import { db } from './connection';

interface CheckResult {
  category: string;
  passed: boolean;
  details: string;
}

const results: CheckResult[] = [];

function check(
  category: string,
  passed: boolean,
  details: string
): void {
  results.push({
    category,
    passed,
    details,
  });
}

function section(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
}

function auditForeignKeys(): void {
  section('1. FOREIGN KEY INTEGRITY');

  const violations = db
    .pragma('foreign_key_check') as Array<{
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
  }>;

  if (violations.length === 0) {
    console.log('[OK] No foreign-key violations found.');
    check(
      'Foreign keys',
      true,
      'No foreign-key violations.'
    );
    return;
  }

  console.log(
    `[ERROR] ${violations.length} foreign-key violation(s) found.`
  );

  for (const violation of violations) {
    console.log(
      `  - ${violation.table} rowid=${violation.rowid} ` +
      `references missing ${violation.parent}`
    );
  }

  check(
    'Foreign keys',
    false,
    `${violations.length} violation(s) found.`
  );
}

function auditRequiredFields(): void {
  section('2. REQUIRED FIELD INTEGRITY');

  const checks: Array<{
    table: string;
    column: string;
  }> = [
    { table: 'patients', column: 'node_id' },
    { table: 'patients', column: 'last_name' },
    { table: 'patients', column: 'first_name' },
    { table: 'patients', column: 'birth_date' },
    { table: 'patients', column: 'sex' },
    { table: 'patients', column: 'version' },
    { table: 'patients', column: 'created_at' },
    { table: 'patients', column: 'updated_at' },

    { table: 'encounters', column: 'patient_id' },
    { table: 'encounters', column: 'node_id' },
    { table: 'encounters', column: 'encounter_date' },
    { table: 'encounters', column: 'version' },
    { table: 'encounters', column: 'created_at' },
    { table: 'encounters', column: 'updated_at' },

    { table: 'observations', column: 'patient_id' },
    { table: 'observations', column: 'node_id' },
    { table: 'observations', column: 'code' },
    { table: 'observations', column: 'observed_at' },
    { table: 'observations', column: 'version' },
    { table: 'observations', column: 'created_at' },
    { table: 'observations', column: 'updated_at' },

    { table: 'immunizations', column: 'patient_id' },
    { table: 'immunizations', column: 'node_id' },
    { table: 'immunizations', column: 'vaccine_code' },
    { table: 'immunizations', column: 'status' },
    { table: 'immunizations', column: 'version' },
    { table: 'immunizations', column: 'created_at' },
    { table: 'immunizations', column: 'updated_at' },

    { table: 'outbox', column: 'operation_id' },
    { table: 'outbox', column: 'node_id' },
    { table: 'outbox', column: 'entity_type' },
    { table: 'outbox', column: 'entity_id' },
    { table: 'outbox', column: 'operation_type' },
    { table: 'outbox', column: 'payload' },
    { table: 'outbox', column: 'status' },
    { table: 'outbox', column: 'attempt_count' },
    { table: 'outbox', column: 'created_at' },
    { table: 'outbox', column: 'updated_at' },

    { table: 'import_jobs', column: 'source_system' },
    { table: 'import_jobs', column: 'file_name' },
    { table: 'import_jobs', column: 'file_type' },
    { table: 'import_jobs', column: 'status' },
    { table: 'import_jobs', column: 'total_rows' },
    { table: 'import_jobs', column: 'imported_rows' },
    { table: 'import_jobs', column: 'candidate_rows' },
    { table: 'import_jobs', column: 'failed_rows' },
    { table: 'import_jobs', column: 'started_at' },

    { table: 'import_row_results', column: 'import_job_id' },
    { table: 'import_row_results', column: 'row_number' },
    { table: 'import_row_results', column: 'status' },
    { table: 'import_row_results', column: 'raw_data' },
    { table: 'import_row_results', column: 'created_at' },

    { table: 'users', column: 'username' },
    { table: 'users', column: 'password_hash' },
    { table: 'users', column: 'is_active' },
    { table: 'users', column: 'created_at' },
    { table: 'users', column: 'updated_at' },

    { table: 'roles', column: 'name' },

    { table: 'permissions', column: 'permission_key' },

    { table: 'user_roles', column: 'user_id' },
    { table: 'user_roles', column: 'role_id' },

    { table: 'role_permissions', column: 'role_id' },
    { table: 'role_permissions', column: 'permission_id' },

    { table: 'auth_sessions', column: 'user_id' },
    { table: 'auth_sessions', column: 'token_hash' },
    { table: 'auth_sessions', column: 'created_at' },
    { table: 'auth_sessions', column: 'expires_at' },
    { table: 'auth_sessions', column: 'last_seen_at' },
  ];

  let allPassed = true;

  for (const { table, column } of checks) {
    const result = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM ${table}
        WHERE ${column} IS NULL
        `,
      )
      .get() as { count: number };

    if (result.count > 0) {
      allPassed = false;

      console.log(
        `[ERROR] ${table}.${column}: ` +
        `${result.count} NULL value(s)`
      );
    }
  }

  if (allPassed) {
    console.log('[OK] No NULL values found in required fields.');
  }

  check(
    'Required fields',
    allPassed,
    allPassed
      ? 'All required fields contain values.'
      : 'One or more required fields contain NULL.'
  );
}

function auditVersions(): void {
  section('3. VERSION INTEGRITY');

  const tables = [
    'patients',
    'encounters',
    'observations',
    'immunizations',
  ];

  let allPassed = true;

  for (const table of tables) {
    const invalid = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM ${table}
        WHERE version < 1
        `,
      )
      .get() as { count: number };

    if (invalid.count > 0) {
      allPassed = false;

      console.log(
        `[ERROR] ${table}: ${invalid.count} ` +
        `record(s) with version < 1`
      );
    }
  }

  if (allPassed) {
    console.log(
      '[OK] All clinical records have version >= 1.'
    );
  }

  check(
    'Versions',
    allPassed,
    allPassed
      ? 'All versions are valid.'
      : 'Invalid version values found.'
  );
}

function auditPatientSex(): void {
  section('4. PATIENT SEX CONSTRAINT');

  const invalid = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM patients
      WHERE sex NOT IN (
        'male',
        'female',
        'other',
        'unknown'
      )
    `)
    .get() as { count: number };

  if (invalid.count === 0) {
    console.log('[OK] All patient sex values are valid.');
  } else {
    console.log(
      `[ERROR] ${invalid.count} patient(s) ` +
      `have invalid sex values.`
    );
  }

  check(
    'Patient sex',
    invalid.count === 0,
    `${invalid.count} invalid value(s).`
  );
}

function auditImportValues(): void {
  section('5. IMPORT VALUE CONSTRAINTS');

  let passed = true;

  const invalidFileTypes = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM import_jobs
      WHERE file_type NOT IN ('csv', 'xlsx')
    `)
    .get() as { count: number };

  const invalidJobStatuses = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM import_jobs
      WHERE status NOT IN (
        'processing',
        'completed',
        'completed_with_issues',
        'failed'
      )
    `)
    .get() as { count: number };

  const invalidRowStatuses = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM import_row_results
      WHERE status NOT IN (
        'imported',
        'candidate',
        'rejected'
      )
    `)
    .get() as { count: number };

  if (invalidFileTypes.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid import file types: ${invalidFileTypes.count}`
    );
  }

  if (invalidJobStatuses.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid import job statuses: ${invalidJobStatuses.count}`
    );
  }

  if (invalidRowStatuses.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid import row statuses: ${invalidRowStatuses.count}`
    );
  }

  if (passed) {
    console.log('[OK] All import values are valid.');
  }

  check(
    'Import constraints',
    passed,
    passed
      ? 'All import enum-like values are valid.'
      : 'Invalid import values found.'
  );
}

function auditOutboxValues(): void {
  section('6. OUTBOX VALUE CONSTRAINTS');

  let passed = true;

  const invalidEntityTypes = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM outbox
      WHERE entity_type NOT IN (
        'patient',
        'encounter',
        'observation',
        'immunization'
      )
    `)
    .get() as { count: number };

  const invalidOperationTypes = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM outbox
      WHERE operation_type NOT IN (
        'create',
        'update',
        'delete'
      )
    `)
    .get() as { count: number };

  const invalidStatuses = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM outbox
      WHERE status NOT IN (
        'pending',
        'processing',
        'failed',
        'acknowledged'
      )
    `)
    .get() as { count: number };

  const invalidAttempts = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM outbox
      WHERE attempt_count < 0
    `)
    .get() as { count: number };

  if (invalidEntityTypes.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid entity types: ${invalidEntityTypes.count}`
    );
  }

  if (invalidOperationTypes.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid operation types: ${invalidOperationTypes.count}`
    );
  }

  if (invalidStatuses.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Invalid outbox statuses: ${invalidStatuses.count}`
    );
  }

  if (invalidAttempts.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Negative attempt counts: ${invalidAttempts.count}`
    );
  }

  if (passed) {
    console.log('[OK] All outbox values are valid.');
  }

  check(
    'Outbox constraints',
    passed,
    passed
      ? 'All outbox values are valid.'
      : 'Invalid outbox values found.'
  );
}

function auditJSON(): void {
  section('7. JSON DATA INTEGRITY');

  let passed = true;

  const outboxRows = db
    .prepare(`
      SELECT id, payload
      FROM outbox
    `)
    .all() as Array<{
    id: string;
    payload: string;
  }>;

  for (const row of outboxRows) {
    try {
      JSON.parse(row.payload);
    } catch {
      passed = false;

      console.log(
        `[ERROR] outbox ${row.id}: invalid JSON payload`
      );
    }
  }

  const importRows = db
    .prepare(`
      SELECT id, raw_data
      FROM import_row_results
    `)
    .all() as Array<{
    id: string;
    raw_data: string;
  }>;

  for (const row of importRows) {
    try {
      JSON.parse(row.raw_data);
    } catch {
      passed = false;

      console.log(
        `[ERROR] import_row_results ${row.id}: invalid JSON raw_data`
      );
    }
  }

  if (passed) {
    console.log('[OK] All JSON payloads are valid.');
  }

  check(
    'JSON integrity',
    passed,
    passed
      ? 'All JSON fields contain valid JSON.'
      : 'Invalid JSON found.'
  );
}

function auditDuplicateSourceRecords(): void {
  section('8. DUPLICATE SOURCE RECORDS');

  const tables = [
    'patients',
    'encounters',
    'observations',
    'immunizations',
  ];

  let passed = true;

  for (const table of tables) {
    const duplicates = db
      .prepare(
        `
        SELECT
          source_system,
          source_record_id,
          COUNT(*) AS count
        FROM ${table}
        WHERE source_system IS NOT NULL
          AND source_record_id IS NOT NULL
        GROUP BY source_system, source_record_id
        HAVING COUNT(*) > 1
        `,
      )
      .all() as Array<{
      source_system: string;
      source_record_id: string;
      count: number;
    }>;

    if (duplicates.length > 0) {
      passed = false;

      console.log(
        `[ERROR] ${table}: ${duplicates.length} ` +
        `duplicate source-record group(s)`
      );

      for (const duplicate of duplicates) {
        console.log(
          `  - ${duplicate.source_system} / ` +
          `${duplicate.source_record_id}: ` +
          `${duplicate.count} records`
        );
      }
    }
  }

  if (passed) {
    console.log(
      '[OK] No duplicate source records found.'
    );
  }

  check(
    'Source uniqueness',
    passed,
    passed
      ? 'No duplicate source records.'
      : 'Duplicate source records found.'
  );
}

function auditImportCounters(): void {
  section('9. IMPORT COUNTER CONSISTENCY');

  const jobs = db
    .prepare(`
      SELECT
        id,
        total_rows,
        imported_rows,
        candidate_rows,
        failed_rows
      FROM import_jobs
    `)
    .all() as Array<{
    id: string;
    total_rows: number;
    imported_rows: number;
    candidate_rows: number;
    failed_rows: number;
  }>;

  let passed = true;

  for (const job of jobs) {
    const calculated = db
      .prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(
            CASE
              WHEN status = 'imported'
              THEN 1
              ELSE 0
            END
          ) AS imported,
          SUM(
            CASE
              WHEN status = 'candidate'
              THEN 1
              ELSE 0
            END
          ) AS candidate,
          SUM(
            CASE
              WHEN status = 'rejected'
              THEN 1
              ELSE 0
            END
          ) AS rejected
        FROM import_row_results
        WHERE import_job_id = ?
      `)
      .get(job.id) as {
      total: number;
      imported: number | null;
      candidate: number | null;
      rejected: number | null;
    };

    const imported = calculated.imported ?? 0;
    const candidate = calculated.candidate ?? 0;
    const rejected = calculated.rejected ?? 0;

    if (
      job.total_rows !== calculated.total ||
      job.imported_rows !== imported ||
      job.candidate_rows !== candidate ||
      job.failed_rows !== rejected
    ) {
      passed = false;

      console.log(
        `[ERROR] Import job ${job.id}: counter mismatch`
      );

      console.log(
        `  Stored:    total=${job.total_rows}, ` +
        `imported=${job.imported_rows}, ` +
        `candidate=${job.candidate_rows}, ` +
        `failed=${job.failed_rows}`
      );

      console.log(
        `  Calculated: total=${calculated.total}, ` +
        `imported=${imported}, ` +
        `candidate=${candidate}, ` +
        `rejected=${rejected}`
      );
    }
  }

  if (passed) {
    console.log(
      '[OK] Import counters match row results.'
    );
  }

  check(
    'Import counters',
    passed,
    passed
      ? 'All import counters are consistent.'
      : 'Import counter mismatches found.'
  );
}

function auditAuthRelationships(): void {
  section('10. AUTH RELATIONSHIPS');

  let passed = true;

  const orphanUserRoles = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM user_roles ur
      LEFT JOIN users u ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id IS NULL
         OR r.id IS NULL
    `)
    .get() as { count: number };

  const orphanRolePermissions = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM role_permissions rp
      LEFT JOIN roles r ON r.id = rp.role_id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id IS NULL
         OR p.id IS NULL
    `)
    .get() as { count: number };

  const orphanSessions = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM auth_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE u.id IS NULL
    `)
    .get() as { count: number };

  if (orphanUserRoles.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Orphan user_roles: ${orphanUserRoles.count}`
    );
  }

  if (orphanRolePermissions.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Orphan role_permissions: ${orphanRolePermissions.count}`
    );
  }

  if (orphanSessions.count > 0) {
    passed = false;
    console.log(
      `[ERROR] Orphan auth_sessions: ${orphanSessions.count}`
    );
  }

  if (passed) {
    console.log(
      '[OK] Authentication relationships are valid.'
    );
  }

  check(
    'Auth relationships',
    passed,
    passed
      ? 'No orphaned authentication relationships.'
      : 'Orphaned authentication relationships found.'
  );
}

function printSummary(): void {
  section('AUDIT SUMMARY');

  const passed = results.filter(
    result => result.passed
  ).length;

  const failed = results.length - passed;

  for (const result of results) {
    console.log(
      `${result.passed ? '[PASS]' : '[FAIL]'} ` +
      `${result.category}: ${result.details}`
    );
  }

  console.log('');
  console.log(`Checks passed: ${passed}`);
  console.log(`Checks failed: ${failed}`);

  if (failed === 0) {
    console.log('\nDatabase data integrity audit PASSED.');
  } else {
    console.log(
      '\nDatabase data integrity audit found problems.'
    );

    process.exitCode = 1;
  }
}

function main(): void {
  console.log('Starting read-only SQLite data audit...');
  console.log(`Database: ${db.name}`);

  auditForeignKeys();
  auditRequiredFields();
  auditVersions();
  auditPatientSex();
  auditImportValues();
  auditOutboxValues();
  auditJSON();
  auditDuplicateSourceRecords();
  auditImportCounters();
  auditAuthRelationships();

  printSummary();
}

main();