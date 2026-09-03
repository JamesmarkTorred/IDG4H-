import { randomUUID } from 'node:crypto';

// Each Jest suite gets a fresh PostgreSQL namespace, never the public schema.
process.env.IDG4H_TEST_SCHEMA = `idg4h_test_${randomUUID().replace(/-/g, '')}`;
process.env.PGOPTIONS = `-c search_path=${process.env.IDG4H_TEST_SCHEMA}`;
