const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'IDG4H Edge Node API',
      version: '0.1.0',
      description: 'Offline-first edge node API — provisional, pre-audit-validation',
    },
  },
  apis: ['./src/routes/*.js'], // JSDoc comments in route files generate the spec
};

module.exports = swaggerJsdoc(options);