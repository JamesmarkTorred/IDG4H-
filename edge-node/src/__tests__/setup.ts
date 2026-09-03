// Never open or modify the development database from a test run.
process.env.DB_PATH = ':memory:';
