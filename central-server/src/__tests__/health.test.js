const request = require('supertest');
const app = require('../app');
const { initSchema, pool } = require('../db/connection');

beforeAll(async () => {
  await initSchema();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  it('returns 200 and confirms DB connection', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body).toHaveProperty('lastCheckId');
  });
});