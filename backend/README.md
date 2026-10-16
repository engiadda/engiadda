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

Copy `.env.example` to `.env` and set `DATABASE_URL` to a local or managed PostgreSQL database. Keep `.env` and all credentials out of Git.

```bash
npm test
npm start
```

The API listens on port 4000 by default.

## Endpoints

- `GET /` — API identity
- `GET /api/live` — process liveness check; does not require PostgreSQL
- `GET /api/health` — readiness check; succeeds only when PostgreSQL is reachable

## CORS and database TLS

Set `CORS_ORIGIN` to a comma-separated list of exact origins, with no paths or wildcard. For this GitHub Pages site the browser origin is `https://engiadda.github.io`, not `https://engiadda.github.io/engiadda/`. Add a local development origin only where needed.

The database connection uses TLS only when `DB_SSL=true`; certificate verification stays enabled. Follow the selected database provider's current TLS instructions rather than disabling certificate checks.

## Current scope and release gate

This is a security-hardening foundation, not yet a production account system. Registration, login, email verification, password recovery, session revocation, user data storage, migrations, and frontend integration are not enabled. Do not collect real user information or advertise account creation until those features are implemented and tested, a production database and API host are configured, and privacy/account-deletion information is published.

The PYQ/test system remains deliberately out of scope for this phase.
