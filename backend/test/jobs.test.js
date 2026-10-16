process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/engiadda_test';
process.env.CORS_ORIGIN = 'http://localhost:5500,https://engiadda.github.io';
process.env.WEBSITE_WEBHOOK_TOKEN = 'test-webhook-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('job ingestion rejects missing/incorrect webhook credentials before touching database', async () => {
  const response = await request(app).post('/api/jobs/ingest').send({ id: 'job-1' });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('job ingestion rejects unverified jobs', async () => {
  const response = await request(app).post('/api/jobs/ingest')
    .set('Authorization', 'Bearer test-webhook-secret')
    .send({ id: 'job-1', title: 'Engineer', source: 'Example', url: 'https://example.com/job', official: false });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /verified as official/i);
});

test('job ingestion rejects non-HTTPS source URLs', async () => {
  const response = await request(app).post('/api/jobs/ingest')
    .set('Authorization', 'Bearer test-webhook-secret')
    .send({ id: 'job-1', title: 'Engineer', source: 'Example', url: 'http://example.com/job', official: true });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /HTTPS/i);
});

test('job ingestion rejects expired postings', async () => {
  const response = await request(app).post('/api/jobs/ingest')
    .set('Authorization', 'Bearer test-webhook-secret')
    .send({ id: 'job-1', title: 'Engineer', source: 'Example', url: 'https://example.com/job', official: true, deadline: '2020-01-01' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Expired/i);
});
