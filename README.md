# EngiAdda

Engineering education, technology and career opportunities under the Diwan brand.

## Website

The public website remains on GitHub Pages:

https://engiadda.github.io/engiadda/

## Current implementation focus

The current release is focused on the engineering jobs feed. PYQ practice, learning accounts and student authentication remain on hold.

## Jobs architecture

- Static frontend: GitHub Pages
- API: Neon Functions (Hono)
- Database: Neon Postgres
- Publisher: EngiAdda Job Alert Agent
- Public page: `careers.html`

See [NEON_DEPLOYMENT.md](NEON_DEPLOYMENT.md) for setup, secrets, deployment and production validation.

## Local API tests

Requires Node.js 20+:

```bash
npm install
npm test
```

## Security

- The public API only reads verified, unexpired jobs.
- Job ingestion requires a GitHub OIDC token restricted to the production job-alert workflow and HTTPS URLs.
- The API uses a dedicated database role scoped to the jobs schema, not the database owner role.
- Browser CORS is restricted to the EngiAdda GitHub Pages origin and local development.
- Never commit `.env.local`, Neon credentials, webhook tokens or Telegram credentials.
