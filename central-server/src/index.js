const app = require('./app');
const config = require('./config');
const { initSchema } = require('./db/connection');

initSchema()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[central-server] listening on port ${config.port}`);
      console.log(`[central-server] docs at http://localhost:${config.port}/api-docs`);
    });
  })
  .catch((err) => {
    console.error('[central-server] failed to initialize schema:', err.message);
    process.exit(1);
  });