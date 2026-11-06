import test from "node:test";
import assert from "node:assert/strict";
import { createCmsApp } from "../functions/cms.js";

const ORIGIN = "https://engiadda.github.io";
function makeDb(handler = async () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  return { calls, query: async (sql, params = []) => { calls.push({ sql, params }); return handler(sql, params, calls.length); } };
}
function request(app, path, { method = "GET", body, headers = {} } = {}) {
  return app.request(path, {
    method,
    headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("CMS liveness route does not require a database query", async () => {
  const app = createCmsApp({ db: makeDb() });
  const response = await app.request("/api/cms/live");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, "engiadda-cms-api");
});

test("CMS setup rejects an incorrect setup token", async () => {
  const db = makeDb();
  const app = createCmsApp({ db, env: { CMS_SETUP_TOKEN: "expected" } });
  const response = await request(app, "/api/cms/auth/setup", { method: "POST", body: { email: "admin@example.com", password: "a-very-long-password" }, headers: { "x-cms-setup-token": "wrong" } });
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test("CMS setup is single-use and stores a password hash, not plaintext", async () => {
  const db = makeDb(async (sql, params) => {
    if (sql.includes("SELECT id FROM cms_admins")) return { rows: [], rowCount: 0 };
    if (sql.includes("INSERT INTO cms_admins")) {
      assert.notEqual(params[1], "a-very-long-password-value");
      assert.match(params[1], /^scrypt:/);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const app = createCmsApp({ db, env: { CMS_SETUP_TOKEN: "expected" } });
  const response = await request(app, "/api/cms/auth/setup", { method: "POST", body: { email: "admin@example.com", password: "a-very-long-password-value" }, headers: { "x-cms-setup-token": "expected" } });
  assert.equal(response.status, 201);
});

test("CMS setup rejects weak passwords", async () => {
  const db = makeDb();
  const app = createCmsApp({ db, env: { CMS_SETUP_TOKEN: "expected" } });
  const response = await request(app, "/api/cms/auth/setup", { method: "POST", body: { email: "admin@example.com", password: "short" }, headers: { "x-cms-setup-token": "expected" } });
  assert.equal(response.status, 400);
  assert.equal(db.calls.length, 0);
});

test("public content endpoint only selects published content", async () => {
  const db = makeDb(async (sql) => ({ rows: [], rowCount: 0 }));
  const app = createCmsApp({ db });
  const response = await app.request("/api/cms/content");
  assert.equal(response.status, 200);
  assert.match(db.calls[0].sql, /status='published'/);
  assert.match(db.calls[0].sql, /published_at IS NOT NULL/);
});

test("admin content endpoint rejects requests without a session", async () => {
  const db = makeDb();
  const app = createCmsApp({ db });
  const response = await app.request("/api/cms/admin/content");
  assert.equal(response.status, 401);
});

test("CMS login rejects requests from untrusted origins", async () => {
  const db = makeDb();
  const app = createCmsApp({ db });
  const response = await app.request("/api/cms/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: "admin@example.com", password: "anything" }) });
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});
