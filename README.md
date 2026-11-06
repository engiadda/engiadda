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
- The API uses a dedicated database role scoped to the `neondb.public` schema, not the database owner role.
- Browser CORS is restricted to the EngiAdda GitHub Pages origin and local development.
- Never commit `.env.local`, Neon credentials, webhook tokens or Telegram credentials.


## CMS development status

The CMS is being developed as a separate Neon Function and uses dedicated `CMS_DATABASE_URL` credentials. It does not reuse or modify the Jobs Function or its database role.

- Admin UI: `admin.html`
- API: `functions/cms.js`
- Schema migration: `database/migrations/002_create_cms.sql`
- API tests: `tests/cms.test.js`
- Initial administrator: one account, enforced by a database singleton constraint
- Sessions: opaque bearer tokens; only SHA-256 token hashes are stored in PostgreSQL
- Passwords: Node.js scrypt hashes; plaintext passwords are never stored
- Content: articles, resources and technology entries with draft/published/archived states

The CMS migration is **not applied to production** and the CMS Function is **not deployed**. Do not run the migration or deployment commands until the production role, secrets, free-tier storage strategy and deployment plan have been reviewed and explicitly approved.

The admin dashboard is cross-origin from GitHub Pages to Neon. It therefore uses a short-lived-in-tab bearer session in `sessionStorage`, rather than relying on third-party cookies. The API restricts browser origins to the EngiAdda site and local development.

File upload integration is intentionally pending selection of a storage provider that fits the ₹0/month constraint. The initial CMS can store content and resource metadata; it must not claim that PDF/image upload is live until storage has been configured and tested.

The CMS Function requires these private environment variables:
- `CMS_DATABASE_URL`: dedicated least-privilege PostgreSQL role connection string
- `CMS_SETUP_TOKEN`: one-time strong setup secret; remove it after the first administrator has been created

For local checks run `npm install` and `npm test`. The deployment command is `npm run neon:deploy-cms`, but it must not be run without explicit production approval.
