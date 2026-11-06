# EngiAdda CMS deployment and operations

## Scope

This release adds an administrator-only content manager for technical articles and downloadable study resources. It does not implement student accounts, interactive PYQ tests, question-bank ingestion, or video hosting.

## Architecture

- Static frontend remains on GitHub Pages.
- CMS API is a separate Neon Function named `cms`, using the existing Neon Postgres project and a dedicated `cms` schema.
- PDF/image objects are stored in the private `engiadda-content` Neon Object Storage bucket. Uploads use short-lived signed PUT URLs; published resource links are short-lived signed GET URLs issued only by the public content API. Draft file keys are never exposed by public endpoints.
- Drafts are never returned by public content endpoints.
- The Function connects through `CMS_DATABASE_URL`, a least-privilege Postgres role scoped to the `cms` schema. Admin password hash and HMAC session secret are Function environment variables, never frontend variables.
- Admin token expires after two hours and is kept in sessionStorage (cleared when the browser tab session ends).
- Supported uploads: PDF, JPEG, PNG, WebP; maximum 50 MB. Uploads are served as attachments.
- Content can be saved as draft, published, unpublished (back to draft), or archived. Archiving is reversible by editing and re-saving as a draft.

## One-time setup

1. Review and apply `migrations/20261106_cms.sql` to the production Neon branch.
2. Create a production Neon Object Storage bucket named `engiadda-content` with access level `private`.
3. Create a Postgres role named `engiadda_cms_api` with `read_write` access scoped to database `neondb` and schema `cms`. Obtain its pooled connection string and set it as the CMS Function environment variable `CMS_DATABASE_URL`. Do not use the database-owner connection string.
5. Generate admin secrets locally. In Bash:
   ```bash
   read -s -p "Choose a unique CMS admin password (16+ characters): " CMS_ADMIN_PASSWORD; export CMS_ADMIN_PASSWORD; echo
   npm run cms:hash-password
   unset CMS_ADMIN_PASSWORD
   ```
   In PowerShell, set `$env:CMS_ADMIN_PASSWORD` from a secure prompt before running `npm run cms:hash-password`; do not put the password in a command literal or source file.
6. Add the two generated values as Function environment variables: `CMS_ADMIN_PASSWORD_HASH` and `CMS_SESSION_SECRET`. Do not set them in `assets/config.js`, GitHub Pages, or committed files. Keep the password manager copy.
7. Deploy the static site. `assets/config.js` points the frontend to the production `cms` Function URL.

## Verification checklist

- `GET /api/live` returns the CMS service health response.
- Admin login rejects wrong passwords and succeeds with the configured password.
- Session endpoint rejects missing/expired/invalid tokens.
- Admin content endpoints reject unauthenticated requests.
- A draft is absent from `GET /api/content`.
- Publish an article and verify it appears on `content.html` and its article page.
- Upload a test PDF, verify the signed upload works, publish it, and open the resource URL in a separate browser session.
- Unpublish/archive a resource and verify it disappears from the public library.
- Confirm CORS rejects unknown origins and the production website origin works.
- Verify no secret is present in GitHub Pages source or public JavaScript.

## Cost and operational limits

This design uses the existing Neon project and GitHub Pages; it does not create a paid hosting service. Neon Object Storage and Function usage are subject to the current account's free-tier quotas and provider pricing. Monitor the Neon usage page; do not enable a paid plan or upgrade without explicit approval. Published resource URLs are signed and expire after one hour; keep only material EngiAdda is authorised to publish.
