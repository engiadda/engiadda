import test from "node:test";
import assert from "node:assert/strict";
import { scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createCmsApp } from "../functions/cms.js";

const scrypt = promisify(scryptCallback);
const ORIGIN = "https://engiadda.github.io";
const PASSWORD = "a-unique-admin-password-2026";
const SALT = "0123456789abcdef0123456789abcdef";
const SECRET = "test-only-cms-session-secret-that-is-long-enough";
async function passwordHash(password = PASSWORD) {
  const digest = await scrypt(password, Buffer.from(SALT, "hex"), 64);
  return `scrypt$${SALT}$${Buffer.from(digest).toString("hex")}`;
}
function fakeDb(handler = async () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  return { calls, query: async (sql, params = []) => { calls.push({ sql, params }); return handler(sql, params, calls.length); } };
}
function req(app, path, { method = "GET", body, token, origin = ORIGIN } = {}) {
  return app.request(path, {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(app) {
  const response = await req(app, "/api/admin/login", { method: "POST", body: { password: PASSWORD } });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}
function appFor(db, extra = {}) {
  return createCmsApp({ db, env: { CMS_ADMIN_PASSWORD_HASH: extra.hash || "", CMS_SESSION_SECRET: SECRET }, ...extra });
}

test("CMS liveness endpoint works without querying the database", async () => {
  const db = fakeDb();
  const app = appFor(db);
  const response = await app.request("/api/live");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, "engiadda-cms-api");
  assert.equal(db.calls.length, 0);
});

test("CMS admin endpoints reject missing and invalid bearer tokens", async () => {
  const db = fakeDb();
  const app = appFor(db);
  assert.equal((await app.request("/api/admin/session")).status, 401);
  assert.equal((await req(app, "/api/admin/session", { token: "invalid.token" })).status, 401);
  assert.equal(db.calls.length, 0);
});

test("CMS login verifies scrypt password hash and issues a signed two-hour token", async () => {
  const hash = await passwordHash();
  const db = fakeDb(async (sql) => {
    if (sql.includes("SELECT attempts")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  });
  const app = appFor(db, { hash });
  const token = await login(app);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const session = await req(app, "/api/admin/session", { token });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);
});

test("CMS login rejects incorrect passwords and records a failed attempt", async () => {
  const db = fakeDb(async (sql) => {
    if (sql.includes("SELECT attempts")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  });
  const app = appFor(db, { hash: await passwordHash() });
  const response = await req(app, "/api/admin/login", { method: "POST", body: { password: "incorrect-password" } });
  assert.equal(response.status, 401);
  assert.ok(db.calls.some((call) => call.sql.includes("INSERT INTO cms.cms_login_attempts")));
});

test("CMS login enforces the database-backed temporary lockout", async () => {
  const db = fakeDb(async (sql) => {
    if (sql.includes("SELECT attempts")) return { rows: [{ attempts: 8, locked_until: new Date(Date.now() + 60_000).toISOString() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const app = appFor(db, { hash: await passwordHash() });
  const response = await req(app, "/api/admin/login", { method: "POST", body: { password: PASSWORD } });
  assert.equal(response.status, 429);
});

test("CMS public list only selects published content whose publish time has arrived", async () => {
  const db = fakeDb(async () => ({ rows: [{ id: "1", title: "Published", file_key: "resources/test.pdf" }], rowCount: 1 }));
  const app = appFor(db);
  const response = await app.request("/api/content");
  assert.equal(response.status, 200);
  assert.match(db.calls[0].sql, /status = 'published'/);
  assert.match(db.calls[0].sql, /published_at IS NOT NULL AND published_at <= NOW\(\)/);
  const data = await response.json();
  assert.equal(data.items[0].file_key, undefined);
  assert.equal(data.items[0].file_url, null);
});

test("CMS public detail endpoint excludes scheduled content and hides object keys", async () => {
  const db = fakeDb(async () => ({ rows: [{ id: "1", title: "Published", file_key: "resources/private.pdf" }], rowCount: 1 }));
  const app = appFor(db);
  const response = await app.request("/api/content/example");
  assert.equal(response.status, 200);
  assert.match(db.calls[0].sql, /published_at IS NOT NULL AND published_at <= NOW\(\)/);
  const data = await response.json();
  assert.equal(data.item.file_key, undefined);
});

test("CMS content creation requires authentication and validates payload", async () => {
  const db = fakeDb(async (sql) => {
    if (sql.includes("SELECT attempts")) return { rows: [], rowCount: 0 };
    if (sql.includes("INSERT INTO cms.content_items")) return { rows: [{ id: "new-id", title: "Test", status: "draft" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const app = appFor(db, { hash: await passwordHash() });
  assert.equal((await req(app, "/api/admin/content", { method: "POST", body: {} })).status, 401);
  const token = await login(app);
  const invalid = await req(app, "/api/admin/content", { method: "POST", token, body: { title: "Missing type" } });
  assert.equal(invalid.status, 400);
  const valid = await req(app, "/api/admin/content", {
    method: "POST", token,
    body: { contentType: "article", title: "Test Article", slug: "test-article", category: "Electrical Engineering", bodyMarkdown: "# Test", status: "draft" },
  });
  assert.equal(valid.status, 201);
});

test("CMS CORS does not authorize unknown browser origins", async () => {
  const app = appFor(fakeDb());
  const response = await app.request("/api/admin/login", {
    method: "OPTIONS",
    headers: { origin: "https://untrusted.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
