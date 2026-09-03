# EngiAdda Job Alert Automation

Zero-cost Python/GitHub Actions foundation for source-first job discovery, verification, deduplication, bilingual Telegram publishing, and website publishing.

## Schedule

GitHub Actions runs at **08:00 IST** and **19:00 IST** (`02:30` and `13:30` UTC). `workflow_dispatch` is enabled for manual runs.

## Important accuracy boundary

The default implementation is intentionally conservative. It discovers candidate links from configured official pages and marks a candidate `VERIFIED` only when the candidate URL remains on the configured official domain. It does **not** invent vacancies, eligibility, salary, dates, or application links. Generic pages that do not expose those details are stored as unverified or with the explicit `Not mentioned in the official notification` value.

For production-grade extraction of notification PDFs and source-specific fields, add source adapters under `job-automation/config`/`job-automation/app.py` before enabling automatic publishing at scale. This prevents a generic HTML scraper from falsely claiming that a recruitment's detailed fields were verified.

## Configuration

1. Copy `.env.example` for local testing.
2. Edit `config/sources.json` to add or disable sources.
3. Add GitHub Actions secrets for Telegram and the website only when those integrations are ready.
4. Run the workflow manually once with publishing disabled.
5. Inspect the SQLite state and logs before enabling Telegram/website publication.

## GitHub secrets

- `ENABLE_TELEGRAM`: `true` or `false`
- `ENABLE_WEBSITE`: `true` or `false`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WEBSITE_API_URL`
- `WEBSITE_API_TOKEN`

## Database

SQLite is used for the zero-cost version. Tables include `jobs`, `job_updates`, `sources`, `publications`, `scan_runs`, and `errors`. The workflow persists `data/jobs.db` back to the repository after each successful run.

## Website adapter contract

The publisher expects:

- `POST {WEBSITE_API_URL}/api/jobs` for a new job
- `PUT {WEBSITE_API_URL}/api/jobs/{job_id}` for an existing job

The endpoint should be idempotent and return a successful HTTP status only after the website has stored the verified master record.

## Local test

```bash
cd job-automation
python -m pip install -r requirements.txt
python app.py
```

Publishing is disabled by default unless the environment explicitly enables it.
