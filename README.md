# CallPro CRM — Next.js

CallPro now runs on Next.js 16, React 19 and TypeScript. All `/api/*` endpoints execute in Node.js; Python and Flask are not part of the runtime. Existing screen controllers, styling, hash links and the IndexedDB cache are retained behind a Next.js client component. Individual screens have not been rewritten into React components.

## Run locally

Install Node.js 22.13 or newer, run `npm ci`, then `npm run dev`. Open http://localhost:3000. Existing `crm.db` and `uploads/contracts` are used locally and excluded from Git. No database migration runs automatically at startup or deployment.

For a fresh database, copy `.env.example` to `.env.local`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters), and run `npm run db:init`. This seeds roles, permissions, statuses and dispositions, and creates the first administrator only if no users exist. It creates no demo accounts or customer records. Existing bcrypt password hashes remain compatible.

## Vercel and Supabase

`vercel.json` selects Next.js, `npm ci`, and `npm run build`. The homepage is prerendered independently of the database. Missing cloud configuration produces an API setup error rather than a homepage crash.

Set these server-only environment variables in Vercel:

- `DATABASE_URL`: Supabase PostgreSQL session-pooler connection string using `postgresql://...`, not SQLAlchemy's `postgresql+psycopg://...`.
- `JWT_SECRET_KEY`: random signing key of at least 32 bytes.
- `SUPABASE_URL`: project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-side Storage credential. Never use a `NEXT_PUBLIC_` prefix or expose it in browser code.
- `SUPABASE_STORAGE_BUCKET`: defaults to `crm-contracts`. Create a private bucket with that name.

Use Supabase's supplied connection/TLS parameters. Certificate verification is not disabled. Choose a region close to the database. Initialization and migration are explicit administrator operations, not build steps.

For a fresh cloud CRM, configure the target connection and initial admin values in local `.env.local`, run `npm run db:init`, then remove the initial password variables.

For existing records, take a consistent SQLite backup, configure the target connection in `.env.local`, and run `npm run db:migrate`. The migration reads the source without modifying it, imports the 28 model tables in one PostgreSQL transaction, verifies row counts and foreign keys, and refuses a target already containing CRM tables. It preserves IDs, ownership, passwords, financial records and history. Failed migrations roll back. Missing tables from older source databases are skipped. `SQLITE_PATH` selects a different source, such as `crm_live.db`.

Uploaded documents are separate from database rows. Upload existing files from `uploads/contracts` into the private bucket with their stored filenames before using cloud downloads. Real PostgreSQL migration and Supabase Storage require verification with a configured project; local tests do not prove external connectivity.

Vercel never falls back to local SQLite for CRM records. Without the cloud database or signing key, authenticated operations return HTTP 503. Cloud documents use Supabase Storage; local development uses the uploads directory.

## Workflows

The Node.js backend covers authentication and account lockout; roles; lead search, duplicate detection, profiles and deal closing; calls and callback completion; assignments and transfers; users and teams; dashboards and audit logs; CSV import/export; contracts and documents; expenses; payroll; employee sales and commissions; and monthly statistics.

Offline bootstrap and queued mutations remain available. Successful retries are recognized; stale customer edits return conflicts and preserve server records for review. Telephony remains a simulation and the assistant remains rule-based, as in the original project. No real telephone or language-model provider is connected.

List and report operations currently aggregate rows in the application. Replace these with SQL pagination/aggregation if the dataset grows substantially.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm start`.

Tests use an isolated temporary database and cover permissions, creation, duplicates, calls, callbacks, reassignment, closing, financial validation, CSV imports, offline retries/conflicts, reports and rollback.

## Source layout

- `src/app`: Next layout, homepage and API route handler.
- `src/client/CRM.tsx`: client lifecycle and retained interface integration.
- `src/server`: Node authentication, database adapter, workflow services, schemas and metadata seed.
- `public/css` and `public/js`: retained interface assets, served by Next.
- `scripts`: database initialization and SQLite-to-PostgreSQL migration.
- `tests-node`: Node workflow regression tests.
- `legacy/flask`: archived Python implementation and tests, unused by Next or Vercel.

The app retires the old Flask service worker so outdated caches do not mask deployments. IndexedDB record caching and offline mutations remain; a first uncached page visit requires an internet connection.
