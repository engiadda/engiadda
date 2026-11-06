import { Hono } from "hono";
import { cors } from "hono/cors";
import { attachDatabasePool } from "@neon/functions";
import pg from "pg";
import { createHmac, randomBytes, timingSafeEqual, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const { Pool } = pg;
const scrypt = promisify(scryptCb);
const ORIGINS = ["https://engiadda.github.io", "http://localhost:5500"];
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIME_EXT = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const pool = process.env.CMS_DATABASE_URL
  ? new Pool({ connectionString: process.env.CMS_DATABASE_URL, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
  : null;
if (pool) {
  pool.on("error", (error) => console.error("CMS database pool error:", error.message));
  attachDatabasePool(pool);
}

const storageReady = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_REGION);
const s3 = storageReady ? new S3Client({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL_S3, forcePathStyle: true, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }) : null;
const BUCKET = "engiadda-content";

function jsonError(c, message, status = 400) { return c.json({ error: message }, status); }
function safeText(v, max = 1000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function slugify(v) { return safeText(v, 240).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 240); }
function equal(a, b) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function sign(value, secret) { return createHmac("sha256", secret).update(value).digest("base64url"); }
function issueToken(env, now) {
  const payload = Buffer.from(JSON.stringify({ sub: "engiadda-admin", exp: Math.floor(now / 1000) + 2 * 60 * 60, nonce: randomBytes(12).toString("hex") })).toString("base64url");
  return payload + "." + sign(payload, env.CMS_SESSION_SECRET);
}
function validToken(token, env, now) {
  if (!env.CMS_SESSION_SECRET || typeof token !== "string") return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  if (!equal(sign(payload, env.CMS_SESSION_SECRET), signature)) return false;
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return data.sub === "engiadda-admin" && Number.isInteger(data.exp) && data.exp > Math.floor(now / 1000); } catch { return false; }
}
async function verifyPassword(password, env) {
  const encoded = env.CMS_ADMIN_PASSWORD_HASH || "";
  const [scheme, salt, digest] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(digest || "")) return false;
  const actual = await scrypt(password, Buffer.from(salt, "hex"), 64);
  return equal(actual, Buffer.from(digest, "hex"));
}
function requireAdmin(c, next, env, clock) {
  const token = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !validToken(token, env, clock())) return jsonError(c, "Admin authentication required", 401);
  return next();
}
async function fileUrl(key, storage) { if (!storage) return null; return getSignedUrl(storage, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 }); }

export function createCmsApp({ db = pool, env = process.env, storage = s3, clock = () => Date.now() } = {}) {
  if (!db || typeof db.query !== "function") throw new Error("CMS database adapter is required");
  const app = new Hono();
  app.use("/api/*", cors({ origin: ORIGINS, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PATCH", "OPTIONS"], maxAge: 86400 }));
  app.get("/api/live", (c) => c.json({ status: "ok", service: "engiadda-cms-api" }));
  app.get("/api/content", async (c) => {
    try {
      const category = safeText(c.req.query("category"), 100);
      const params = [];
      let where = "status = 'published'";
      if (category) { params.push(category); where += " AND category = $1"; }
      const result = await db.query(`SELECT id, content_type, title, slug, excerpt, category, subject, exam, tags, file_key, file_name, file_mime, published_at FROM cms.content_items WHERE ${where} AND published_at IS NOT NULL AND published_at <= NOW() ORDER BY published_at DESC LIMIT 100`, params);
      const items = await Promise.all(result.rows.map(async row => { const { file_key, ...item } = row; return { ...item, file_url: file_key ? await fileUrl(file_key, storage) : null }; }));
      return c.json({ items }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
    } catch (error) { console.error("Public CMS list failed:", error.message); return jsonError(c, "Content service temporarily unavailable", 503); }
  });
  app.get("/api/content/:slug", async (c) => {
    try {
      const result = await db.query("SELECT id, content_type, title, slug, excerpt, body_markdown, category, subject, exam, tags, file_key, file_name, file_mime, published_at FROM cms.content_items WHERE slug=$1 AND status='published' AND published_at IS NOT NULL AND published_at <= NOW() LIMIT 1", [safeText(c.req.param("slug"), 260)]);
      if (!result.rowCount) return jsonError(c, "Content not found", 404);
      const row = result.rows[0];
      const { file_key, ...item } = row;
      return c.json({ item: { ...item, file_url: file_key ? await fileUrl(file_key, storage) : null } }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
    } catch (error) { console.error("Public CMS detail failed:", error.message); return jsonError(c, "Content service temporarily unavailable", 503); }
  });

  app.post("/api/admin/login", async (c) => {
    if (!env.CMS_ADMIN_PASSWORD_HASH || !env.CMS_SESSION_SECRET) return jsonError(c, "CMS admin credentials are not configured", 503);
    let body; try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON"); }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 1 || password.length > 256) return jsonError(c, "Invalid credentials", 401);
    try {
      const key = "admin";
      const state = await db.query("SELECT attempts, locked_until FROM cms.cms_login_attempts WHERE username=$1", [key]);
      if (state.rowCount && state.rows[0].locked_until && new Date(state.rows[0].locked_until) > new Date()) return jsonError(c, "Too many attempts. Try again later.", 429);
      if (!(await verifyPassword(password, env))) {
        await db.query(`INSERT INTO cms.cms_login_attempts AS attempts_row (username, attempts, window_started, locked_until) VALUES ($1,1,now(),NULL)
          ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN attempts_row.window_started < now()-interval '15 minutes' THEN 1 ELSE attempts_row.attempts+1 END,
          window_started=CASE WHEN attempts_row.window_started < now()-interval '15 minutes' THEN now() ELSE attempts_row.window_started END,
          locked_until=CASE WHEN (CASE WHEN attempts_row.window_started < now()-interval '15 minutes' THEN 1 ELSE attempts_row.attempts+1 END) >= 8 THEN now()+interval '15 minutes' ELSE NULL END`, [key]);
        return jsonError(c, "Invalid credentials", 401);
      }
      await db.query("DELETE FROM cms.cms_login_attempts WHERE username=$1", [key]);
      return c.json({ token: issueToken(env, clock()), expires_in: 7200 });
    } catch (error) { console.error("CMS login failed:", error.message); return jsonError(c, "Login service unavailable", 503); }
  });

  app.use("/api/admin/*", async (c, next) => {
    if (c.req.path === "/api/admin/login") return next();
    return requireAdmin(c, next, env, clock);
  });
  app.get("/api/admin/session", (c) => c.json({ authenticated: true, expires_in: 7200 }));
  app.get("/api/admin/content", async (c) => {
    try {
      const status = safeText(c.req.query("status"), 20);
      const params = [];
      let where = "TRUE";
      if (["draft", "published", "archived"].includes(status)) { params.push(status); where = "status=$1"; }
      const result = await db.query(`SELECT * FROM cms.content_items WHERE ${where} ORDER BY updated_at DESC LIMIT 200`, params);
      const items = await Promise.all(result.rows.map(async row => ({ ...row, file_url: row.file_key ? await fileUrl(row.file_key, storage) : null })));
      return c.json({ items });
    } catch (error) { console.error("CMS admin list failed:", error.message); return jsonError(c, "Unable to load content", 503); }
  });
  app.post("/api/admin/uploads/presign", async (c) => {
    if (!storage) return jsonError(c, "File storage is not configured on this deployment", 503);
    let body; try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON"); }
    const name = safeText(body.fileName, 255);
    const type = safeText(body.contentType, 120).toLowerCase();
    const size = Number(body.size);
    const ext = MIME_EXT.get(type);
    if (!name || !ext || !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) return jsonError(c, "Only PDF, JPEG, PNG or WebP files up to 50 MB are accepted");
    const key = `resources/${new Date().toISOString().slice(0,10)}/${randomBytes(16).toString("hex")}.${ext}`;
    try {
      const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: type, ContentLength: size, CacheControl: "private, no-store" });
      const uploadUrl = await getSignedUrl(storage, command, { expiresIn: 600 });
      return c.json({ uploadUrl, fileKey: key, fileName: name, fileMime: type, fileSizeBytes: size, expiresIn: 600 });
    } catch (error) { console.error("CMS upload signing failed:", error.message); return jsonError(c, "Unable to prepare upload", 503); }
  });
  app.post("/api/admin/content", async (c) => saveContent(c, null, { db, storage }));
  app.patch("/api/admin/content/:id", async (c) => saveContent(c, c.req.param("id"), { db, storage }));
  app.patch("/api/admin/content/:id/status", async (c) => {
    let body; try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON"); }
    const status = safeText(body.status, 20);
    if (!["draft", "published", "archived"].includes(status)) return jsonError(c, "Invalid status");
    try {
      const result = await db.query("UPDATE cms.content_items SET status=$2, published_at=CASE WHEN $2='published' THEN COALESCE(published_at,now()) ELSE published_at END, updated_at=now() WHERE id=$1 RETURNING id,status", [c.req.param("id"), status]);
      if (!result.rowCount) return jsonError(c, "Content not found", 404);
      await db.query("INSERT INTO cms.cms_audit_log(action,content_id) VALUES ($1,$2)", [status, c.req.param("id")]);
      return c.json({ item: result.rows[0] });
    } catch (error) { console.error("CMS status update failed:", error.message); return jsonError(c, "Unable to update content", 503); }
  });
  app.notFound((c) => jsonError(c, "Route not found", 404));
  app.onError((error, c) => { console.error("CMS API error:", error.message); return jsonError(c, "Internal server error", 500); });
  return app;
}

async function saveContent(c, id, { db, storage }) {
  let body; try { body = await c.req.json(); } catch { return jsonError(c, "Invalid JSON"); }
  const type = safeText(body.contentType, 20);
  const title = safeText(body.title, 240);
  const category = safeText(body.category, 100);
  const slug = slugify(body.slug || title);
  const status = safeText(body.status || "draft", 20);
  const markdown = typeof body.bodyMarkdown === "string" ? body.bodyMarkdown.slice(0, 100000) : null;
  if (!["article", "resource"].includes(type) || !title || !category || !slug || !["draft", "published"].includes(status)) return jsonError(c, "Content type, title, category, slug and valid status are required");
  if (type === "article" && !markdown?.trim()) return jsonError(c, "Article body is required");
  const key = safeText(body.fileKey, 1024) || null;
  if (key && !key.startsWith("resources/")) return jsonError(c, "Invalid file key");
  if (type === "resource" && !key) return jsonError(c, "Upload a resource file before saving");
  const values = [type,title,slug,safeText(body.excerpt,600),markdown,category,safeText(body.subject,120),safeText(body.exam,120),Array.isArray(body.tags)?body.tags.filter(x=>typeof x==="string").slice(0,20).map(x=>safeText(x,50)):[],status,key,safeText(body.fileName,255)||null,safeText(body.fileMime,120)||null,body.fileSizeBytes !== null && body.fileSizeBytes !== undefined && body.fileSizeBytes !== "" && Number.isSafeInteger(Number(body.fileSizeBytes)) ? Number(body.fileSizeBytes) : null,safeText(body.seoTitle,70)||null,safeText(body.seoDescription,180)||null];
  try {
    const result = id
      ? await db.query(`UPDATE cms.content_items SET content_type=$1,title=$2,slug=$3,excerpt=$4,body_markdown=$5,category=$6,subject=$7,exam=$8,tags=$9,status=$10,file_key=$11,file_name=$12,file_mime=$13,file_size_bytes=$14,seo_title=$15,seo_description=$16,updated_at=now(),published_at=CASE WHEN $10='published' THEN COALESCE(published_at,now()) ELSE published_at END WHERE id=$17 RETURNING *`, [...values, id])
      : await db.query(`INSERT INTO cms.content_items(content_type,title,slug,excerpt,body_markdown,category,subject,exam,tags,status,file_key,file_name,file_mime,file_size_bytes,seo_title,seo_description,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CASE WHEN $10='published' THEN now() ELSE NULL END) RETURNING *`, values);
    if (!result.rowCount) return jsonError(c, "Content not found", 404);
    await db.query("INSERT INTO cms.cms_audit_log(action,content_id,details) VALUES ($1,$2,$3)", [id ? "updated" : "created", result.rows[0].id, JSON.stringify({ status })]);
    return c.json({ item: { ...result.rows[0], file_url: key ? await fileUrl(key, storage) : null } }, id ? 200 : 201);
  } catch (error) {
    if (error.code === "23505") return jsonError(c, "That URL slug is already in use", 409);
    console.error("CMS save failed:", error.message); return jsonError(c, "Unable to save content", 503);
  }
}

export const app = createCmsApp({ db: pool || { query: async () => { throw new Error("CMS_DATABASE_URL is not configured"); } } });
export default app;
