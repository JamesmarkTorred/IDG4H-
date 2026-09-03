import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IDG4H Central Server API',
      version: '0.1.0',
      description: 'Central server API — provisional, pre-audit-validation',
    },
  },
  apis: [path.join(__dirname, '../routes/*.{ts,js}').replace(/\\/g, '/')],
};

export default swaggerJsdoc(options);
