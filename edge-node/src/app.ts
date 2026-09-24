import express, { type ErrorRequestHandler } from 'express';

import swaggerUi from 'swagger-ui-express';

import swaggerSpec from './docs/swagger';

import healthRouter from './routes/health';
import authRouter from './routes/auth';
import patientRouter from './routes/patients';
import encounterRouter from './routes/encounters';
import importRouter from './routes/imports';

const app = express();

const allowedOrigins = new Set([
  'http://localhost:1420',
  'http://tauri.localhost',
  'tauri://localhost',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  );

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/health', healthRouter);

app.use('/api/auth', authRouter);

app.use('/api/patients', patientRouter);

app.use('/api', encounterRouter);

app.use('/api', importRouter);

const handleRequestError: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error
      ? error.status
      : undefined;

  if (status === 400 || status === 413) {
    res.status(status).json({
      error:
        status === 413
          ? 'Request body is too large.'
          : 'Invalid JSON body.',
    });
  } else {
    res.status(500).json({
      error: 'Internal server error.',
    });
  }
};

app.use(handleRequestError);

export default app;