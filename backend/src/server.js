const app = require('./app');
const { port } = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(port, () => {
  console.log(`EngiAdda API listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);

  server.close(() => {
    pool.end()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Error closing PostgreSQL pool:', error.message);
        process.exit(1);
      });
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
