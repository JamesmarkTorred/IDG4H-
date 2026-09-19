import express, { type ErrorRequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';

import swaggerSpec from './docs/swagger';
import healthRouter from './routes/health';
import syncRouter from './routes/sync';

const app = express();

app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/health', healthRouter);

app.use('/sync', syncRouter);

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