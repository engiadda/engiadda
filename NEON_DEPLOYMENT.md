# EngiAdda Jobs API — Neon deployment

This implementation keeps the existing GitHub Pages site and uses the existing Neon project for PostgreSQL and the HTTP API. It avoids a separate paid application host.

## Architecture

`GitHub Pages → Neon Function (Hono) → Neon Postgres`

The job-alert agent publishes verified records to the protected `POST /api/jobs/ingest` endpoint. The Careers page reads active records from `GET /api/jobs`.

## Cost guardrail

Use the existing Neon Free project only. Do not enable a paid plan, paid compute, paid AI Gateway, or a paid hosting service. Review the project's plan and usage screen periodically. If the free allowance is exhausted, stop and ask before upgrading.

## Production deployment status

- Existing Neon project: `engiadda` in `aws-ap-southeast-1`
- Production branch: `production`
- Migration: `database/migrations/001_create_jobs.sql` applied and verified
- Neon Function: `jobs` deployed on Node.js 24
- Function base URL: `https://br-curly-bar-az2kh01w-jobs.compute.c-3.ap-southeast-1.aws.neon.tech`
- Careers frontend API base: configured in `assets/config.js`

## Authentication

The ingestion endpoint uses GitHub Actions OIDC rather than a long-lived shared webhook secret.

The Neon Function verifies:
- GitHub's OIDC JWT signature using GitHub's published JWKS
- Issuer: `https://token.actions.githubusercontent.com`
- Audience: `engiadda-jobs-api`
- Repository: `engiadda/engiadda-job-alert-agent`
- Ref: `refs/heads/main`
- Workflow: `.github/workflows/job-alert-agent.yml`
- Event type: scheduled or manually dispatched workflow

The job-agent workflow has `id-token: write` permission. Do not add a static `WEBSITE_WEBHOOK_TOKEN` secret. The public API URL is configured in the job-agent workflow and is not a credential.

## API

- `GET /api/live` — liveness check
- `GET /api/health` — PostgreSQL readiness
- `GET /api/jobs` — public active verified job feed; supports `limit`, `offset`, `q`, `category`, and `discipline`
- `POST /api/jobs/ingest` — verified publisher-only ingestion endpoint

Private-sector roles without a stated closing date are retained for at most 60 days from their explicit publication date; no artificial application deadline is created.

## Production validation

The deployed API has passed GitHub Actions smoke tests:
1. `GET /api/live` returned success.
2. `GET /api/health` confirmed the database connection.
3. `GET /api/jobs` returned a valid feed response.
4. Unauthenticated `POST /api/jobs/ingest` was rejected with HTTP 401.

The Careers page is read-only. It does not accept arbitrary public job submissions; only the authenticated job-alert workflow can publish.

## Local development and deployment

Requires Node.js 20+.

```bash
npm install
npm test
npx neon@latest login
npx neon@latest link --project-id fancy-violet-54245534 --branch production -y
npm run neon:plan
npm run neon:deploy
```

Never commit `.env.local`, `.neon`, database credentials, Telegram credentials, or other secrets.
