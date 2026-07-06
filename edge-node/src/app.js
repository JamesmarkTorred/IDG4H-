const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');

const app = express();

app.use(express.json());

// Swagger docs — paper-confirmed requirement (OpenAPI/Swagger spec)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes mounted here as they're built
const healthRouter = require('./routes/health');
app.use('/health', healthRouter);

module.exports = app;