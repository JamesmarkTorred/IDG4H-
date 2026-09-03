import request from 'supertest';
import app from '../app';
import { pool } from '../db/connection';

afterAll(() => pool.end());

describe('GET /health', () => {
  it('returns 200 and identifies the service', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'central-server' });
  });
});
