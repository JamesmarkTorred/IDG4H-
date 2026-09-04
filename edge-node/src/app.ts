import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import patientRouter from './routes/patients';

const app = express();

app.use(express.json());

// Swagger docs — paper-confirmed requirement (OpenAPI/Swagger spec)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes mounted here as they're built
app.use('/health', healthRouter);
app.use('/api/patients', patientRouter);

app.use(errorHandler);

export default app;
