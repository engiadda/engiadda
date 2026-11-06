# EngiAdda Jobs API — Neon deployment

This implementation keeps the existing GitHub Pages site and uses the existing Neon project for PostgreSQL and the HTTP API. It avoids a separate paid application host.

## Architecture

`GitHub Pages → Neon Function (Hono) → Neon Postgres`

The job-alert agent publishes verified records to the protected `POST /api/jobs/ingest` endpoint. The Careers page reads active records from `GET /api/jobs`.

## Free-tier guardrail

Use the existing Neon Free project only. Do not enable a paid plan, paid compute, paid AI Gateway, or a paid hosting service. Neon currently documents a Free allowance for PostgreSQL and Functions; quotas and plan terms can change, so review the project's usage/plan screen before deployment. If the free allowance is exhausted, stop and ask before upgrading.

## One-time setup

1. Connect the existing Neon project to the workspace using the Neon integration. Do not create a second project unless the existing project is unusable.
2. Confirm the project is in the intended region and select its production/main branch.
3. Apply `database/migrations/001_create_jobs.sql` to that branch. The migration is idempotent.
4. Generate a long random `WEBSITE_WEBHOOK_TOKEN`. Store it as a Neon Function environment secret. Never commit it to Git.
5. Install the root dependencies with `npm install`.
6. Deploy the function using `npm run neon:deploy` (or the current Neon CLI deployment flow). Supply the secret through the local ignored `.env.local` file when requested.
7. Copy the deployed Function's HTTPS URL into `assets/config.js` as `window.ENGIADDA_API_BASE`. The value is the function base URL, without a trailing slash.
8. Test `GET /api/live`, `GET /api/health`, and `GET /api/jobs` before connecting the publisher.

## Job-agent connection

In the `engiadda/engiadda-job-alert-agent` repository, configure Actions secrets:

- `WEBSITE_WEBHOOK_URL`: deployed Function URL plus `/api/jobs/ingest`
- `WEBSITE_WEBHOOK_TOKEN`: the same secret configured in Neon
- `TELEGRAM_BOT_TOKEN`: existing Telegram bot token
- `TELEGRAM_CHAT_ID`: existing channel/chat ID (optional; publisher falls back to `@engiadda`)

Do not paste any secret into a chat, issue, pull request, commit, or log.

## Production validation

1. Run the job-agent workflow in dry-run mode first.
2. Confirm source fetching, verification, publication-date checks, expiry checks, and deduplication.
3. Confirm a controlled test job reaches the Neon API and appears in the public feed.
4. Confirm Telegram publishing independently.
5. Only then enable scheduled website publishing.

## API

- `GET /api/live` — liveness, no database query
- `GET /api/health` — PostgreSQL readiness
- `GET /api/jobs` — public active verified job feed; supports `limit`, `offset`, `q`, `category`, and `discipline`
- `POST /api/jobs/ingest` — protected publisher endpoint; requires a Bearer token, HTTPS job URL, verified-source flag, and non-expired deadline

The Careers page is intentionally read-only. It does not allow arbitrary users to post jobs. Job submissions are accepted only from the authenticated job-alert publisher.
