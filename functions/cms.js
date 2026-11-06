import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { attachDatabasePool } from "@neon/functions";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const ALLOWED_ORIGINS = new Set(["https://engiadda.github.io", "http://localhost:5500"]);
const SESSION_DAYS = 7;
const COOKIE_NAME = "engiadda_cms_session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [scheme, salt, storedHex] = String(encoded || "").split(":");
  if (scheme !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(storedHex || "")) return false;
  const derived = Buffer.from(await scrypt(password, salt, 64));
  const stored = Buffer.from(storedHex, "hex");
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

function cookie(value, maxAge, secure) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function getCookie(header, name) {
  const part = (header || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

function safeSlug(value) {
  return String(value || "").normalize("NFKD").toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
}

function validContent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "A content object is required" };
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 240) : "";
  const slug = safeSlug(input.slug || title);
  const contentType = input.content_type;
  const status = input.status || "draft";
  if (!title || !slug) return { error: "Title and a valid slug are required" };
  if (!["article", "resource", "technology"].includes(contentType)) return { error: "Invalid content type" };
  if (!["draft", "published", "archived"].includes(status)) return { error: "Invalid content status" };
  const body = typeof input.body_markdown === "string" ? input.body_markdown : "";
  if (body.length > 500_000) return { error: "Content body exceeds 500 KB" };
  const optional = (key, max) => typeof input[key] === "string" ? input[key].trim().slice(0, max) || null : null;
  return {
    title, slug, summary: optional("summary", 1_000), body_markdown: body,
    content_type: contentType, status,
    subject: optional("subject", 120), topic: optional("topic", 160),
    cover_image_url: optional("cover_image_url", 2_048),
    seo_title: optional("seo_title", 240), seo_description: optional("seo_description", 320),
    category_id: input.category_id || null,
  };
}

export function createCmsApp({ db, env = process.env, clock = () => new Date() } = {}) {
  if (!db || typeof db.query !== "function") throw new Error("CMS database adapter is required");
  const app = new Hono();
  const secureCookie = env.NODE_ENV === "production";

  app.use("/api/cms/*", cors({
    origin: (origin) => ALLOWED_ORIGINS.has(origin) ? origin : "",
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  }));

  const requireOrigin = (c) => {
    const origin = c.req.header("origin");
    return Boolean(origin && ALLOWED_ORIGINS.has(origin));
  };

  async function currentAdmin(c) {
    const token = getCookie(c.req.header("cookie"), COOKIE_NAME);
    if (!/^[a-f0-9]{64}$/i.test(token)) return null;
    const result = await db.query(
      "SELECT a.id, a.email FROM cms_sessions s JOIN cms_admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at > $2 AND a.is_active=TRUE LIMIT 1",
      [sha256(token), clock()],
    );
    return result.rows[0] || null;
  }

  async function requireAdmin(c, next) {
    try {
      const admin = await currentAdmin(c);
      if (!admin) return c.json({ error: "Authentication required" }, 401);
      c.set("cmsAdmin", admin);
      await next();
    } catch (error) {
      console.error("CMS session validation failed:", error.message);
      return c.json({ error: "Authentication service unavailable" }, 503);
    }
  }

  app.get("/api/cms/live", (c) => c.json({ status: "ok", service: "engiadda-cms-api" }));

  app.post("/api/cms/auth/setup", async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    if (!env.CMS_SETUP_TOKEN || c.req.header("x-cms-setup-token") !== env.CMS_SETUP_TOKEN) {
      return c.json({ error: "Setup authorization failed" }, 403);
    }
    let input;
    try { input = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = input.password;
    if (!EMAIL_RE.test(email) || typeof password !== "string" || password.length < 14 || password.length > 256) {
      return c.json({ error: "Provide a valid email and a password of 14–256 characters" }, 400);
    }
    try {
      const existing = await db.query("SELECT id FROM cms_admins LIMIT 1");
      if (existing.rowCount) return c.json({ error: "Administrator setup is already complete" }, 409);
      const passwordHash = await hashPassword(password);
      await db.query("INSERT INTO cms_admins(email,password_hash) VALUES($1,$2)", [email, passwordHash]);
      return c.json({ status: "created", message: "Administrator created. You can now log in." }, 201);
    } catch (error) {
      console.error("CMS administrator setup failed:", error.message);
      return c.json({ error: "Administrator setup failed" }, 503);
    }
  });

  app.post("/api/cms/auth/login", async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    let input;
    try { input = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!EMAIL_RE.test(email) || !password || password.length > 256) return c.json({ error: "Invalid email or password" }, 400);
    try {
      const result = await db.query("SELECT id,email,password_hash FROM cms_admins WHERE email=$1 AND is_active=TRUE LIMIT 1", [email]);
      const admin = result.rows[0];
      if (!admin || !(await verifyPassword(password, admin.password_hash))) return c.json({ error: "Invalid email or password" }, 401);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(clock().getTime() + SESSION_DAYS * 86_400_000);
      await db.query("INSERT INTO cms_sessions(admin_id,token_hash,expires_at) VALUES($1,$2,$3)", [admin.id, sha256(token), expiresAt]);
      await db.query("UPDATE cms_admins SET last_login_at=$2 WHERE id=$1", [admin.id, clock()]);
      c.header("Set-Cookie", cookie(token, SESSION_DAYS * 86_400, secureCookie));
      return c.json({ status: "ok", admin: { id: admin.id, email: admin.email } });
    } catch (error) {
      console.error("CMS login failed:", error.message);
      return c.json({ error: "Login service unavailable" }, 503);
    }
  });

  app.get("/api/cms/auth/me", requireAdmin, (c) => c.json({ admin: c.get("cmsAdmin") }));

  app.post("/api/cms/auth/logout", async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    const token = getCookie(c.req.header("cookie"), COOKIE_NAME);
    if (/^[a-f0-9]{64}$/i.test(token)) {
      try { await db.query("DELETE FROM cms_sessions WHERE token_hash=$1", [sha256(token)]); }
      catch (error) { console.error("CMS logout failed:", error.message); return c.json({ error: "Logout failed" }, 503); }
    }
    c.header("Set-Cookie", cookie("", 0, secureCookie));
    return c.json({ status: "ok" });
  });

  app.get("/api/cms/content", async (c) => {
    try {
      const type = c.req.query("type");
      const params = [];
      let filter = "status='published' AND published_at IS NOT NULL AND published_at <= NOW()";
      if (["article", "resource", "technology"].includes(type)) {
        params.push(type);
        filter += ` AND content_type=$${params.length}`;
      }
      const result = await db.query(
        `SELECT id,title,slug,summary,body_markdown,content_type,subject,topic,cover_image_url,published_at,updated_at FROM cms_content WHERE ${filter} ORDER BY published_at DESC LIMIT 100`,
        params,
      );
      c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return c.json({ content: result.rows });
    } catch (error) {
      console.error("CMS public content query failed:", error.message);
      return c.json({ error: "Unable to load content" }, 503);
    }
  });

  app.get("/api/cms/admin/content", requireAdmin, async (c) => {
    try {
      const result = await db.query("SELECT id,title,slug,summary,content_type,status,subject,topic,updated_at,published_at FROM cms_content ORDER BY updated_at DESC LIMIT 200");
      return c.json({ content: result.rows });
    } catch (error) {
      console.error("CMS content listing failed:", error.message);
      return c.json({ error: "Unable to load content" }, 503);
    }
  });

  app.post("/api/cms/admin/content", requireAdmin, async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    let input;
    try { input = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const item = validContent(input);
    if (item.error) return c.json({ error: item.error }, 400);
    const admin = c.get("cmsAdmin");
    try {
      const result = await db.query(
        `INSERT INTO cms_content(title,slug,summary,body_markdown,content_type,status,subject,topic,cover_image_url,seo_title,seo_description,category_id,created_by,updated_by,published_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,CASE WHEN $6='published' THEN NOW() ELSE NULL END)
         RETURNING id,title,slug,status,content_type`,
        [item.title,item.slug,item.summary,item.body_markdown,item.content_type,item.status,item.subject,item.topic,item.cover_image_url,item.seo_title,item.seo_description,item.category_id,admin.id],
      );
      return c.json({ content: result.rows[0] }, 201);
    } catch (error) {
      if (error.code === "23505") return c.json({ error: "That slug is already in use" }, 409);
      console.error("CMS content creation failed:", error.message);
      return c.json({ error: "Unable to create content" }, 503);
    }
  });

  app.patch("/api/cms/admin/content/:id", requireAdmin, async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    let input;
    try { input = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
    const item = validContent(input);
    if (item.error) return c.json({ error: item.error }, 400);
    try {
      const result = await db.query(
        `UPDATE cms_content SET title=$2,slug=$3,summary=$4,body_markdown=$5,content_type=$6,status=$7,subject=$8,topic=$9,cover_image_url=$10,seo_title=$11,seo_description=$12,category_id=$13,updated_by=$14,updated_at=NOW(),published_at=CASE WHEN $7='published' THEN COALESCE(published_at,NOW()) ELSE NULL END
         WHERE id=$1 RETURNING id,title,slug,status,content_type`,
        [c.req.param("id"),item.title,item.slug,item.summary,item.body_markdown,item.content_type,item.status,item.subject,item.topic,item.cover_image_url,item.seo_title,item.seo_description,item.category_id,c.get("cmsAdmin").id],
      );
      return result.rowCount ? c.json({ content: result.rows[0] }) : c.json({ error: "Content not found" }, 404);
    } catch (error) {
      if (error.code === "23505") return c.json({ error: "That slug is already in use" }, 409);
      console.error("CMS content update failed:", error.message);
      return c.json({ error: "Unable to update content" }, 503);
    }
  });

  app.delete("/api/cms/admin/content/:id", requireAdmin, async (c) => {
    if (!requireOrigin(c)) return c.json({ error: "Untrusted origin" }, 403);
    try {
      const result = await db.query("DELETE FROM cms_content WHERE id=$1 RETURNING id", [c.req.param("id")]);
      return result.rowCount ? c.json({ status: "deleted" }) : c.json({ error: "Content not found" }, 404);
    } catch (error) {
      console.error("CMS content deletion failed:", error.message);
      return c.json({ error: "Unable to delete content" }, 503);
    }
  });

  app.notFound((c) => c.json({ error: "Route not found" }, 404));
  app.onError((error, c) => {
    console.error("CMS API error:", error.message);
    return c.json({ error: "Internal server error" }, 500);
  });
  return app;
}

const databaseUrl = process.env.CMS_DATABASE_URL;
export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 }) : null;
if (pool) {
  pool.on("error", (error) => console.error("Unexpected CMS database client error:", error.message));
  attachDatabasePool(pool);
}
export const app = createCmsApp({
  db: pool || { query: async () => { throw new Error("CMS_DATABASE_URL is not configured"); } },
});
export default app;
