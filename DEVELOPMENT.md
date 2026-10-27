# Development

Product requirements are documented in [PRODUCT.md](PRODUCT.md).

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

## Real-app verification skill

Use the project-local [verify-belief-garden skill](.omp/skills/verify-belief-garden/SKILL.md)
for isolated browser verification and retained proof artifacts. Its
[feature map](.omp/skills/verify-belief-garden/features/INDEX.md) covers accounts,
public bios, belief positions/core beliefs, explanations, and Guess My Beliefs.
The executable lifecycle helper creates a disposable app copy with separate data,
sessions, port, logs, and evidence; it does not drive an existing development server.
Launch, doctor, browser proof, teardown, and post-cleanup evidence checks are in the
skill. Use `maintain-verification-skill` when routes or user entry points change.