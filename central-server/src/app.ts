import express, { type ErrorRequestHandler } from 'express';

import swaggerUi from 'swagger-ui-express';

import swaggerSpec from './docs/swagger';

import healthRouter from './routes/health';

import syncRouter from './routes/sync';

import nodesRouter from './nodes/routes/nodes';

import cookieParser from 'cookie-parser';

import authRouter from './auth/routes/auth';

const app = express();

app.use(express.json());

app.use(cookieParser());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/health', healthRouter);

app.use('/sync', syncRouter);

app.use('/nodes', nodesRouter);

app.use('/auth', authRouter);


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