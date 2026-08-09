# EngiAdda Backend

Phase 1 backend foundation for EngiAdda.

## Stack
- Node.js 20+
- Express
- PostgreSQL
- Helmet
- CORS
- dotenv

## Local setup

```bash
cd backend
npm install
copy .env.example .env
```

Set `DATABASE_URL` in `.env`, then run:

```bash
npm start
```

The API listens on port 4000 by default.

## Health check

`GET /api/health`

A healthy response confirms that the API is running and PostgreSQL is reachable.

## Phase 1 scope

This phase intentionally does not connect the public frontend or implement authentication/content APIs yet. Those are subsequent phases.
