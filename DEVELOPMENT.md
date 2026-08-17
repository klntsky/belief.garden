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