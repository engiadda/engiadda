const dotenv = require('dotenv');
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 4000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const configuredOrigins = (process.env.CORS_ORIGIN || (nodeEnv === 'production' ? '' : 'http://localhost:5500'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (nodeEnv === 'production' && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must be configured in production with the exact allowed origin(s)');
}
if (nodeEnv === 'production' && configuredOrigins.includes('*')) {
  throw new Error('Wildcard CORS_ORIGIN is not allowed in production');
}
for (const origin of configuredOrigins) {
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGIN must contain valid origins'); }
  if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('CORS_ORIGIN entries must be origin-only URLs, without paths');
  }
}

module.exports = {
  nodeEnv,
  port,
  databaseUrl,
  corsOrigins: configuredOrigins
};
