# Development

Product requirements are documented in [PRODUCT.md](PRODUCT.md).

## Setup

Requires Node.js 22.13+ (built-in SQLite support) and pnpm.

```sh
pnpm install
pnpm exec playwright install chromium # for tests
```

Create `.env`:

```dotenv
OPENAI_API_KEY=your-key
SESSION_SECRET=your-random-secret
TEST_PORT=3001
```

## Run

```sh
pnpm dev       # watch mode at http://localhost:3000
pnpm start     # run once
```

Set `PORT` in `.env` to use a different port.

## Storage and migration

Mutable application records and sessions live in `data/belief-garden.sqlite`.
Set `DATABASE_PATH` to override the database filename; relative paths resolve
from the application working directory. Static image assets remain in `public/img`.

For an existing deployment:

1. Stop every old application process and maintenance job that writes legacy files.
2. Back up `data/`, `sessions/`, and `public/users.json`.
3. Deploy the new code and dependencies, then run `pnpm run migrate`.
4. Start the application with `pnpm run start`.

Startup also runs the same migration before listening. Schema creation, recursive
import of all legacy JSON/Markdown in `data/` and `sessions/`, the public user
ranking, and the migration marker commit together in one `BEGIN IMMEDIATE`
transaction with full synchronous durability. The catalog seeds from
`public/static/beliefs.json` only when no writable legacy catalog exists.
Invalid JSON, unsupported files, symlinks, or I/O failures abort the import and
roll back all database changes. Fix the source problem and rerun the command.
Keep legacy writers stopped throughout the import: SQLite cannot snapshot writes
made by the old filesystem-based application.

Legacy files are retained unchanged as backups, never read again after the marker
commits. New writes, including sessions and statistics caches, use SQLite only.
Do not restore legacy files over a migrated application expecting them to be
reimported. Back up the live database with SQLite's backup API or stop all writers
before copying it.

Migration rollback/idempotency and isolated statistics checks need no web server:

```sh
pnpm exec playwright test test/sqliteMigration.spec.ts test/statisticsDiscovery.spec.ts
```

## Check changes

```sh
pnpm build                         # TypeScript check and build
pnpm test                          # all Playwright tests
pnpm test test/editBio.spec.ts     # one test file
```

Tests start and stop their own server. `TEST_PORT` is the first port they try; if it is busy, the next free port is used.

The feature lifecycle regression group covers follows, reply/comment notifications,
bans and unbans, password changes, admin/proposal actions, comment limits,
notification read state, chat mentions, correlation, and discovery statistics:

```sh
pnpm test \
  test/socialLifecycle.spec.ts test/replyNotifications.spec.ts \
  test/commentNotifications.spec.ts test/chatMentions.spec.ts \
  test/passwordChangeValidation.spec.ts test/commentLifecycle.spec.ts \
  test/adminLifecycle.spec.ts test/proposalValidation.spec.ts \
  test/notificationLifecycle.spec.ts test/correlation.spec.ts \
  test/statisticsDiscovery.spec.ts
```

Run against development data only. To avoid changing the default database, set
`DATABASE_PATH` to a disposable absolute filename for `pnpm test`; the test server
and fixtures use the same database. The API tests create and remove unique
accounts; admin/proposal fixtures restore the records they change. Keep the
configured single worker because tests share global records. Statistics tests use
separate temporary databases. These tests do not call image generation.

## Real-app verification skill

Use the project-local [verify-belief-garden skill](.omp/skills/verify-belief-garden/SKILL.md)
for isolated browser verification and retained proof artifacts. Its
[feature map](.omp/skills/verify-belief-garden/features/INDEX.md) covers accounts,
public bios, belief positions/core beliefs, explanations, and Guess My Beliefs.
The executable lifecycle helper creates a disposable app copy with separate data,
sessions, port, logs, and evidence; it does not drive an existing development server.
Launch, doctor, browser proof, teardown, and post-cleanup evidence checks are in the
skill. Use `maintain-verification-skill` when routes or user entry points change.