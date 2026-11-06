CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TEXT,
  application_start DATE,
  deadline DATE,
  recruitment_type TEXT,
  vacancies TEXT,
  department TEXT,
  age_limit TEXT,
  eligibility TEXT,
  qualification TEXT,
  location TEXT,
  category TEXT,
  official BOOLEAN NOT NULL DEFAULT FALSE,
  experience_level TEXT,
  engineering_discipline TEXT,
  employment_type TEXT,
  work_mode TEXT,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  salary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_deadline_idx ON jobs (deadline);
CREATE INDEX IF NOT EXISTS jobs_category_idx ON jobs (category);
CREATE INDEX IF NOT EXISTS jobs_discipline_idx ON jobs (engineering_discipline);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
