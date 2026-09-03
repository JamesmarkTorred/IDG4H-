import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IDG4H Edge Node API',
      version: '0.1.0',
      description: 'Offline-first edge node API — provisional, pre-audit-validation',
    },
  },
  // Resolve source and compiled routes independently of the working directory.
  apis: [path.join(__dirname, '../routes/*.{ts,js}').replace(/\\/g, '/')],
};

export default swaggerJsdoc(options);
