import request from 'supertest';
import app from '../app';
import { db } from '../db/connection';

afterAll(() => db.close());

describe('GET /health', () => {
  it('returns 200 and confirms DB connection', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 500 when SQLite is unavailable', async () => {
    const prepare = jest.spyOn(db, 'prepare').mockImplementationOnce(() => {
      throw new Error('SQLite unavailable');
    });

    try {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected server error occurred.',
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('SQLite unavailable');
    } finally {
      prepare.mockRestore();
    }
  });
});
