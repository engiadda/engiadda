const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const JOB_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanText(value, max = 2000) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

function validDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}

function normalizeJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Job payload must be an object' };
  const id = cleanText(input.id, 200);
  const title = cleanText(input.title, 300);
  const url = cleanText(input.url, 2048);
  const source = cleanText(input.source, 300);
  if (!id || !JOB_ID_RE.test(id) || !title || !url || !source) {
    return { error: 'Job requires a valid id, title, source and application/source URL' };
  }
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return { error: 'Job URL must be a valid HTTPS URL' }; }
  if (parsedUrl.protocol !== 'https:') return { error: 'Job URL must use HTTPS' };
  if (input.official !== true) return { error: 'Only jobs explicitly verified as official can be ingested' };
  const deadline = validDate(input.deadline);
  const applicationStart = validDate(input.application_start);
  if (deadline === undefined || applicationStart === undefined) return { error: 'Dates must use valid YYYY-MM-DD format' };
  if (deadline && deadline < new Date().toISOString().slice(0, 10)) {
    return { error: 'Expired jobs cannot be ingested' };
  }
  let skills = input.skills ?? [];
  if (!Array.isArray(skills)) skills = [];
  skills = skills.filter((item) => typeof item === 'string').slice(0, 30).map((item) => item.slice(0, 100));
  return {
    id, title, company: cleanText(input.company, 300), url, source,
    published_at: cleanText(input.published_at, 100),
    application_start: applicationStart, deadline,
    recruitment_type: cleanText(input.recruitment_type, 100),
    vacancies: cleanText(input.vacancies, 200), department: cleanText(input.department, 300),
    age_limit: cleanText(input.age_limit, 300), eligibility: cleanText(input.eligibility, 2000),
    qualification: cleanText(input.qualification, 2000), location: cleanText(input.location, 300),
    category: cleanText(input.category, 100), official: true,
    experience_level: cleanText(input.experience_level, 100),
    engineering_discipline: cleanText(input.engineering_discipline, 200),
    employment_type: cleanText(input.employment_type, 100), work_mode: cleanText(input.work_mode, 100),
    skills: JSON.stringify(skills), salary: cleanText(input.salary, 300)
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
    const offsetRaw = Number.parseInt(req.query.offset, 10);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? Math.min(offsetRaw, 100000) : 0;
    const search = cleanText(req.query.q, 100);
    const category = cleanText(req.query.category, 100);
    const discipline = cleanText(req.query.discipline, 100);
    const params = [];
    const filters = ["official = TRUE", "(deadline IS NULL OR deadline >= CURRENT_DATE)"];
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(title ILIKE ${params.length} OR company ILIKE ${params.length} OR location ILIKE ${params.length} OR engineering_discipline ILIKE ${params.length})`);
    }
    if (category) { params.push(category); filters.push(`category = $${params.length}`); }
    if (discipline) { params.push(`%${discipline}%`); filters.push(`engineering_discipline ILIKE $${params.length}`); }
    params.push(limit); const limitPos = params.length;
    params.push(offset); const offsetPos = params.length;
    const query = `SELECT id, title, company, url, source, published_at, application_start, deadline,
      recruitment_type, vacancies, department, age_limit, eligibility, qualification, location,
      category, official, experience_level, engineering_discipline, employment_type, work_mode,
      skills, salary, created_at, updated_at
      FROM jobs WHERE ${filters.join(' AND ')}
      ORDER BY (deadline IS NULL) ASC, deadline ASC NULLS LAST, created_at DESC
      LIMIT $${limitPos} OFFSET $${offsetPos}`;
    const result = await pool.query(query, params);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ jobs: result.rows, limit, offset, count: result.rowCount });
  } catch (error) { next(error); }
});

router.post('/ingest', async (req, res, next) => {
  try {
    const expected = process.env.WEBSITE_WEBHOOK_TOKEN;
    const authorization = req.get('authorization') || '';
    const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expected) return res.status(503).json({ error: 'Job ingestion is not configured' });
    if (!safeEqual(provided, expected)) return res.status(401).json({ error: 'Unauthorized' });

    const job = normalizeJob(req.body);
    if (job.error) return res.status(400).json({ error: job.error });
    const fields = Object.keys(job);
    const values = fields.map((field) => job[field]);
    const placeholders = fields.map((_, index) => `$${index + 1}`);
    const updates = fields.filter((field) => field !== 'id').map((field) => `${field} = EXCLUDED.${field}`);
    const query = `INSERT INTO jobs (${fields.join(', ')}) VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
      RETURNING id`;
    const result = await pool.query(query, values);
    res.status(202).json({ status: 'accepted', id: result.rows[0].id });
  } catch (error) { next(error); }
});

module.exports = router;
