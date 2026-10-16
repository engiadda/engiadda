# EngiAdda Backend

Node.js/Express API foundation for the EngiAdda static site at https://engiadda.github.io/engiadda/.

## Stack

- Node.js 20+
- Express and Helmet
- PostgreSQL via `pg`
- Explicit CORS origin allowlist
- Node's built-in test runner and Supertest

## Local setup

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to a local or managed PostgreSQL database. Set `WEBSITE_WEBHOOK_TOKEN` to a long random secret. Keep `.env` and all credentials out of Git.

```bash
npm run migrate
npm test
npm start
```

The API listens on port 4000 by default.

## Endpoints

- `GET /` — API identity
- `GET /api/live` — process liveness check; does not require PostgreSQL
- `GET /api/health` — readiness check; succeeds only when PostgreSQL is reachable
- `GET /api/jobs` — public, paginated verified-job feed; supports `limit`, `offset`, `q`, `category`, and `discipline` filters
- `POST /api/jobs/ingest` — protected job-agent webhook. Requires `Authorization: Bearer <WEBSITE_WEBHOOK_TOKEN>`, validates HTTPS URLs and official-verification flag, and rejects expired deadlines

The job feed only returns records marked official and excludes jobs whose explicit deadline has passed. It does not manufacture a deadline where the source has none.

## Job-agent connection

Configure the same `WEBSITE_WEBHOOK_TOKEN` value in the API host and as the `WEBSITE_WEBHOOK_TOKEN` GitHub Actions secret in `engiadda/engiadda-job-alert-agent`. Set that repository's `WEBSITE_WEBHOOK_URL` secret to the deployed API URL plus `/api/jobs/ingest`. The job agent's tests and source-quality gate must pass before enabling production publishing.

## CORS and database TLS

Set `CORS_ORIGIN` to a comma-separated list of exact origins, with no paths or wildcard. For this GitHub Pages site the browser origin is `https://engiadda.github.io`, not `https://engiadda.github.io/engiadda/`. Add a local development origin only where needed.

The database connection uses TLS only when `DB_SSL=true`; certificate verification stays enabled. Follow the selected database provider's current TLS instructions rather than disabling certificate checks.

## Current scope and release gate

The verified public job feed and protected ingestion route are implemented in code, but they are not live until the database migration is applied and the API is deployed. Registration, login, email verification, password recovery, session revocation, and frontend integration are not enabled. Do not collect real user information or advertise account creation until those features are implemented and tested, a production database and API host are configured, and privacy/account-deletion information is published.

The PYQ/test system remains deliberately out of scope for this phase.
