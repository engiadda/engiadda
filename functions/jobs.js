import { Hono } from "hono";
import { cors } from "hono/cors";
import pg from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

const { Pool } = pg;
const ALLOWED_ORIGINS = ["https://engiadda.github.io", "http://localhost:5500"];
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const JOB_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "engiadda-jobs-api";
const GITHUB_OIDC_JWKS = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));

export function isTrustedPublisherClaims(payload) {
  return payload?.repository === "engiadda/engiadda-job-alert-agent"
    && payload?.ref === "refs/heads/main"
    && payload?.workflow_ref === "engiadda/engiadda-job-alert-agent/.github/workflows/job-alert-agent.yml@refs/heads/main"
    && ["schedule", "workflow_dispatch"].includes(payload?.event_name);
}

export async function verifyPublisherToken(token, jwks = GITHUB_OIDC_JWKS) {
  if (typeof token !== "string" || !token) return false;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GITHUB_OIDC_AUDIENCE,
    });
    return isTrustedPublisherClaims(payload);
  } catch {
    return false;
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: { rejectUnauthorized: true },
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error:", error.message);
});

function cleanText(value, max = 2_000) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

function validDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

export function normalizeJob(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Job payload must be an object" };
  }

  const id = cleanText(input.id, 200);
  const title = cleanText(input.title, 300);
  const url = cleanText(input.url, 2_048);
  const source = cleanText(input.source, 300);

  if (!id || !JOB_ID_RE.test(id) || !title || !url || !source) {
    return { error: "Job requires a valid id, title, source and application/source URL" };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: "Job URL must be a valid HTTPS URL" };
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
    return { error: "Job URL must use HTTPS and cannot contain embedded credentials" };
  }

  if (input.official !== true) {
    return { error: "Only jobs verified from an official source can be ingested" };
  }

  const deadline = validDate(input.deadline);
  const applicationStart = validDate(input.application_start);
  if (deadline === undefined || applicationStart === undefined) {
    return { error: "Dates must use valid YYYY-MM-DD format" };
  }
  if (deadline && deadline < new Date().toISOString().slice(0, 10)) {
    return { error: "Expired jobs cannot be ingested" };
  }

  const skills = Array.isArray(input.skills)
    ? input.skills.filter((item) => typeof item === "string").slice(0, 30).map((item) => item.slice(0, 100))
    : [];

  return {
    id,
    title,
    company: cleanText(input.company, 300),
    url,
    source,
    published_at: cleanText(input.published_at, 100),
    application_start: applicationStart,
    deadline,
    recruitment_type: cleanText(input.recruitment_type, 100),
    vacancies: cleanText(input.vacancies, 200),
    department: cleanText(input.department, 300),
    age_limit: cleanText(input.age_limit, 300),
    eligibility: cleanText(input.eligibility, 2_000),
    qualification: cleanText(input.qualification, 2_000),
    location: cleanText(input.location, 300),
    category: cleanText(input.category, 100),
    official: true,
    experience_level: cleanText(input.experience_level, 100),
    engineering_discipline: cleanText(input.engineering_discipline, 200),
    employment_type: cleanText(input.employment_type, 100),
    work_mode: cleanText(input.work_mode, 100),
    skills: JSON.stringify(skills),
    salary: cleanText(input.salary, 300),
  };
}

export function createApp({ verifyToken = verifyPublisherToken } = {}) {
const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ALLOWED_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86_400,
  }),
);

app.get("/", (c) => c.json({ name: "EngiAdda Jobs API", version: "1.0.0" }));
app.get("/api/live", (c) => c.json({ status: "ok", service: "engiadda-jobs-api" }));

app.get("/api/health", async (c) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    return c.json({ status: "ok", service: "engiadda-jobs-api", database: "connected", databaseTime: result.rows[0].now });
  } catch (error) {
    console.error("Database readiness check failed:", error.message);
    return c.json({ status: "error", database: "unavailable" }, 503);
  }
});

app.get("/api/jobs", async (c) => {
  try {
    const rawLimit = Number.parseInt(c.req.query("limit"), 10);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
    const offsetRaw = Number.parseInt(c.req.query("offset"), 10);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 100_000) : 0;
    const search = cleanText(c.req.query("q"), 100);
    const category = cleanText(c.req.query("category"), 100);
    const discipline = cleanText(c.req.query("discipline"), 100);

    const params = [];
    const filters = [
      "official = TRUE",
      "(deadline IS NULL OR deadline >= CURRENT_DATE)",
      "(category IS DISTINCT FROM 'private' OR CASE WHEN published_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN published_at::date >= CURRENT_DATE - INTERVAL '60 days' ELSE FALSE END)",
    ];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length} OR location ILIKE $${params.length} OR engineering_discipline ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      filters.push(`category = $${params.length}`);
    }
    if (discipline) {
      params.push(`%${discipline}%`);
      filters.push(`engineering_discipline ILIKE $${params.length}`);
    }

    params.push(limit);
    const limitPosition = params.length;
    params.push(offset);
    const offsetPosition = params.length;

    const query = `SELECT id, title, company, url, source, published_at, application_start, deadline,
      recruitment_type, vacancies, department, age_limit, eligibility, qualification, location,
      category, official, experience_level, engineering_discipline, employment_type, work_mode,
      skills, salary, created_at, updated_at
      FROM jobs WHERE ${filters.join(" AND ")}
      ORDER BY (deadline IS NULL) ASC, deadline ASC NULLS LAST, created_at DESC
      LIMIT $${limitPosition} OFFSET $${offsetPosition}`;

    const result = await pool.query(query, params);
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ jobs: result.rows, limit, offset, count: result.rowCount });
  } catch (error) {
    console.error("Job feed query failed:", error.message);
    return c.json({ error: "Unable to load jobs right now" }, 503);
  }
});

app.post("/api/jobs/ingest", async (c) => {
  const authorization = c.req.header("authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!(await verifyToken(provided))) return c.json({ error: "Unauthorized" }, 401);

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const job = normalizeJob(body);
  if (job.error) return c.json({ error: job.error }, 400);

  try {
    const fields = Object.keys(job);
    const values = fields.map((field) => job[field]);
    const placeholders = fields.map((_, index) => `$${index + 1}`);
    const updates = fields
      .filter((field) => field !== "id")
      .map((field) => `${field} = EXCLUDED.${field}`);

    const query = `INSERT INTO jobs (${fields.join(", ")}) VALUES (${placeholders.join(", ")})
      ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}, updated_at = NOW()
      RETURNING id`;

    const result = await pool.query(query, values);
    return c.json({ status: "accepted", id: result.rows[0].id }, 202);
  } catch (error) {
    console.error("Job ingestion failed:", error.message);
    return c.json({ error: "Unable to publish job right now" }, 503);
  }
});

app.notFound((c) => c.json({ error: "Route not found" }, 404));
app.onError((error, c) => {
  console.error("Unhandled Jobs API error:", error.message);
  return c.json({ error: "Internal server error" }, 500);
});

return app;
}

export const app = createApp();
export default app;
