import test from "node:test";
import assert from "node:assert/strict";
import { app, pool, normalizeJob } from "../functions/jobs.js";

const validJob = {
  id: "engiadda-test-001",
  title: "Graduate Engineer Trainee",
  company: "Example Industries",
  url: "https://careers.example.com/jobs/1",
  source: "Example Careers",
  deadline: "2099-12-31",
  category: "private",
  engineering_discipline: "electrical",
  qualification: "B.Tech Electrical Engineering",
  official: true,
};

test("liveness endpoint works without a database query", async () => {
  const response = await app.request("/api/live");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "engiadda-jobs-api" });
});

test("job normalization accepts verified HTTPS job data", () => {
  const normalized = normalizeJob(validJob);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.official, true);
  assert.equal(normalized.id, validJob.id);
});

test("job normalization rejects unverified jobs", () => {
  const normalized = normalizeJob({ ...validJob, official: false });
  assert.match(normalized.error, /official source/);
});

test("job normalization rejects HTTP URLs and embedded URL credentials", () => {
  assert.match(normalizeJob({ ...validJob, url: "http://careers.example.com/jobs/1" }).error, /HTTPS/);
  assert.match(normalizeJob({ ...validJob, url: "https://user:pass@careers.example.com/jobs/1" }).error, /credentials/);
});

test("job normalization rejects expired deadlines", () => {
  assert.match(normalizeJob({ ...validJob, deadline: "2000-01-01" }).error, /Expired/);
});

test("ingestion rejects missing configuration and invalid bearer tokens", async () => {
  const previous = process.env.WEBSITE_WEBHOOK_TOKEN;
  delete process.env.WEBSITE_WEBHOOK_TOKEN;
  const missing = await app.request("/api/jobs/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validJob),
  });
  assert.equal(missing.status, 503);

  process.env.WEBSITE_WEBHOOK_TOKEN = "expected-secret";
  const invalid = await app.request("/api/jobs/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-secret" },
    body: JSON.stringify(validJob),
  });
  assert.equal(invalid.status, 401);

  if (previous === undefined) delete process.env.WEBSITE_WEBHOOK_TOKEN;
  else process.env.WEBSITE_WEBHOOK_TOKEN = previous;
});

test("authenticated ingestion upserts a verified job", async () => {
  const previousToken = process.env.WEBSITE_WEBHOOK_TOKEN;
  const originalQuery = pool.query;
  process.env.WEBSITE_WEBHOOK_TOKEN = "expected-secret";
  pool.query = async (query, values) => {
    assert.match(query, /INSERT INTO jobs/);
    assert.match(query, /ON CONFLICT \(id\) DO UPDATE/);
    assert.equal(values[0], validJob.id);
    return { rows: [{ id: validJob.id }], rowCount: 1 };
  };

  try {
    const response = await app.request("/api/jobs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer expected-secret" },
      body: JSON.stringify(validJob),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { status: "accepted", id: validJob.id });
  } finally {
    pool.query = originalQuery;
    if (previousToken === undefined) delete process.env.WEBSITE_WEBHOOK_TOKEN;
    else process.env.WEBSITE_WEBHOOK_TOKEN = previousToken;
  }
});

test("public feed filters official and unexpired jobs", async () => {
  const originalQuery = pool.query;
  let receivedQuery = "";
  let receivedParams = [];
  pool.query = async (query, params) => {
    receivedQuery = query;
    receivedParams = params;
    return { rows: [{ id: validJob.id }], rowCount: 1 };
  };

  try {
    const response = await app.request("/api/jobs?q=engineer&category=private&discipline=electrical&limit=10");
    assert.equal(response.status, 200);
    assert.match(receivedQuery, /official = TRUE/);
    assert.match(receivedQuery, /deadline >= CURRENT_DATE/);
    assert.match(receivedQuery, /published_at::date >= CURRENT_DATE - INTERVAL '60 days'/);
    assert.deepEqual(receivedParams, ["%engineer%", "private", "%electrical%", 10, 0]);
    assert.equal((await response.json()).count, 1);
  } finally {
    pool.query = originalQuery;
  }
});

test("production website origin is allowed by CORS", async () => {
  const response = await app.request("/api/live", {
    headers: { Origin: "https://engiadda.github.io" },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://engiadda.github.io");
});
