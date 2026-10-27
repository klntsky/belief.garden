# Development

## Setup

Requires Node.js and pnpm.

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

Run against development data only. The API tests create and remove unique accounts;
admin/proposal fixtures restore the files they change. Keep the configured single
worker because the application uses shared JSON files. Statistics tests run the
real updater in temporary directories, without replacing application data.
These tests do not call image generation.

Proposal submissions require a category, name, and description containing
non-whitespace text. Invalid submissions return HTTP 400 without changing pending
proposals; the additional image prompt remains optional.