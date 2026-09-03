import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger';
import healthRouter from './routes/health';

const app = express();

app.use(express.json());

// Swagger docs — paper-confirmed requirement (OpenAPI/Swagger spec)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes mounted here as they're built
app.use('/health', healthRouter);

export default app;
