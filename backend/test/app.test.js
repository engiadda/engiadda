process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/engiadda_test';
process.env.CORS_ORIGIN = 'http://localhost:5500,https://engiadda.github.io';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('root endpoint identifies the API without exposing configuration', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { name: 'EngiAdda API', version: '1.0.0' });
  assert.equal(JSON.stringify(response.body).includes('postgres'), false);
});

test('liveness endpoint does not require a database connection', async () => {
  const response = await request(app).get('/api/live');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok', service: 'engiadda-api' });
});

test('unknown routes return a safe JSON 404', async () => {
  const response = await request(app).get('/api/not-a-route');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Route not found' });
});

test('security headers are enabled and x-powered-by is disabled', async () => {
  const response = await request(app).get('/');
  assert.ok(response.headers['x-content-type-options']);
  assert.ok(response.headers['x-frame-options']);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('configured frontend origin is allowed by CORS', async () => {
  const response = await request(app).get('/').set('Origin', 'https://engiadda.github.io');
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'https://engiadda.github.io');
});

test('unconfigured browser origin is rejected', async () => {
  const response = await request(app).get('/').set('Origin', 'https://example.com');
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { error: 'Origin not allowed' });
});

test('malformed JSON returns a client error without a stack trace', async () => {
  const response = await request(app)
    .post('/api/nonexistent')
    .set('Content-Type', 'application/json')
    .send('{"broken":');
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid JSON body' });
  assert.equal(response.text.includes('SyntaxError'), false);
});
