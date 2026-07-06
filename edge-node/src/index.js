const app = require('./app');
const config = require('./config');
const { initSchema } = require('./db/connection');

initSchema();

app.listen(config.port, () => {
  console.log(`[edge-node] listening on port ${config.port}`);
  console.log(`[edge-node] docs available at http://localhost:${config.port}/api-docs`);
});