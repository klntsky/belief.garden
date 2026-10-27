---
name: verify-belief-garden
description: Drive belief.garden's real Express/EJS web UI in an isolated local instance with Playwright; use after user-visible changes to accounts, public profiles, belief choices, explanations, or Guess My Beliefs, capturing browser and persistence evidence.
---

# Verify belief.garden

Primary surface: server-rendered web UI plus browser JavaScript. The same Express process serves `/api/*`; those routes are useful read-only corroboration, not substitutes for clicking the UI. Image generation and maintenance scripts are secondary developer surfaces, outside this baseline. Read [features/INDEX.md](features/INDEX.md) and the affected feature files before choosing coverage. Invoke through the host's project-local skill mechanism, normally `/skill:verify-belief-garden`.

## Launch

Run from the repository root on Linux (the ownership doctor uses `/proc`). Requires Node >=22.13 with `node:sqlite`, Corepack/pnpm, installed `node_modules`, and Playwright Chromium. Setup uses `corepack pnpm install` and `corepack pnpm exec playwright install chromium`. Respect this repo's `pnpm-workspace.yaml` build allowlist for bcrypt/esbuild. `corepack pnpm run build` checks compilation. The direct pnpm shim on the generating host was broken; Corepack successfully runs the same package scripts.

```sh
LAUNCH="$(./.omp/skills/verify-belief-garden/scripts/instance.mjs launch)" || exit 1
MANIFEST="$(printf '%s' "$LAUNCH" | node --input-type=module -e 'let text=""; for await (const chunk of process.stdin) text+=chunk; console.log(JSON.parse(text).manifest)')" || exit 1
export MANIFEST
printf '%s\n' "$MANIFEST"
```

The executable copies current `src`, `views`, `public`, `package.json`, and `tsconfig.json` into a unique `/tmp/belief-garden-app-*` directory, excluding generated public user content. It links installed dependencies, never application data. Scratch-only scaffolding: an empty `data` directory and copied workspace settings with `verifyDepsBeforeRun: false` (prevent a package manager from reinstalling through the shared dependency symlink). Migrations initialize SQLite and seed beliefs from `public/static/beliefs.json`. Existing `data`, `sessions`, and `.env` are NOT copied.

Exact server command inside that copy: `corepack pnpm run start` (`tsx src/app.ts`). It sets a fresh free `PORT`, random `SESSION_SECRET`, `NODE_ENV=development`, local `PUBLIC_SITE_URL`/`SITE_DEPLOYMENT_PATH`, an hour-long statistics interval, dummy `OPENAI_API_KEY=verification-no-network`, and `DATABASE_PATH` pointing to scratch's `data/belief-garden.sqlite`. The manifest records that database path; an inherited database override cannot point the isolated app at live data. No real OpenAI key is needed for these paths. This is NOT a dry-run: registration, sessions, autosaves, feed entries, notifications, and statistics really write SQLite records in scratch. Never approve proposals or run image generation with the dummy key.

Ready: `server.log` contains `Server running on port N`, and doctor establishes listener ownership plus a real HTTP 200 Welcome home page. Launch returns only after doctor passes. Logs, `instance.json`, and `doctor.json` are in a separate `/tmp/belief-garden-evidence-*` directory. Launch failure automatically runs cleanup and prints the retained evidence directory to stderr. Do not ignore a nonzero launch exit or reuse a failed manifest.

Parallel runs require separate helper launches: each gets its own working directory, SQLite database, process group, port, and evidence directory. Different ports in the SAME checkout are NOT isolated: the default database path and generated static assets are relative to cwd. Never double-drive a shared developer instance or run `pnpm test` alongside a live-data server. Port selection has a small close-to-bind race; doctor rejects a port not owned by this run. On collision, clean up and launch again.

Teardown is the Cleanup command below, including after failed drives.

## Doctor

One read-only command; run immediately after launch and first whenever anything looks wrong:

```sh
./.omp/skills/verify-belief-garden/scripts/instance.mjs doctor "$MANIFEST"
```

Requires the recorded launcher identity and owned descendants (including children in separate process groups), a listening socket owned by one of them whose cwd is scratch, the recorded `src/app.ts` SHA-256, and `/` returning the belief.garden Welcome document. It reports URL, listener PID, source snapshot identity, and scratch path; it does not log in or mutate app state. The home route is intentional: `/login` consumes flash messages and can create a session. This is a snapshot, not a hot-reloading build: relaunch after code changes. For authenticated drives also require `#login-username` to match the disposable account after submitting Login. Refuse to drive when doctor fails; do not switch to an arbitrary responding port.

## Drive

Existing harness: Playwright (`@playwright/test`, Chromium), with selectors established by `test/userRegistrationAndLogin.spec.ts`, `editBio.spec.ts`, `supportBelief.spec.ts`, `addBeliefToCore.spec.ts`, `addBeliefComment.spec.ts`, and `guessMyBeliefs.spec.ts`. Keep drives against a shared database sequential. Do not use internal user setters as feature proof.

Run the shipped complete browser recipe once on a fresh instance:

```sh
./.omp/skills/verify-belief-garden/scripts/prove-profile.mjs "$MANIFEST"
```

It starts a fresh browser context, clicks header Register, creates `verify_gardener` with a strong verification-only password, logs in, edits the bio, observes the autosave response, reloads, checks the persisted Markdown using a read-only SQLite query, submits visible Logout, and views the public profile. It captures a trace, action transcript, before/saved/public screenshots, ARIA snapshot, response, stored value, and result. Optional `BROWSER_PATH` selects an installed Chromium. Re-running on the same instance hits a duplicate account; clean up and launch fresh instead.

For another mapped feature after the baseline, use this working scratch-local Login driver (pass `"$MANIFEST"` as its first argument). Append the relevant map's literal actions after the named-header assertion, inside `try`; retain `finally` so failures close the browser. The Login setup alone does not verify the other features:

```js
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const manifest = process.argv[2];
const state = JSON.parse(await readFile(manifest, 'utf8'));
const evidence = dirname(manifest);
const readStoredRecord = key => {
  const database = new DatabaseSync(state.databasePath, { readOnly: true });
  try {
    const row = database.prepare('SELECT value FROM records WHERE key = ?').get(key);
    if (typeof row?.value !== 'string') throw new Error(`Missing SQLite record: ${key}`);
    return row.value;
  } finally {
    database.close();
  }
};
const username = 'verify_gardener';
const password = 'SecuI&SD*^tgsdreP@ssw0rd';
const browser = await chromium.launch({ headless: true,
  ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
try {
  await page.goto(state.url + '/login');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(state.url + '/' + username);
  await expect(page.locator('#login-username')).toHaveText(username);
  await page.screenshot({ path: join(evidence, 'feature-login.png') });
} finally {
  await context.tracing.stop({ path: join(evidence, 'feature-trace.zip') });
  await browser.close();
}
```

Read scratch from the manifest; put the custom driver at `state.scratch + '/drive.mjs'` and run it with `node` and the manifest argument. Scratch's dependency link resolves Playwright. A fresh context is anonymous even if the baseline helper logged in earlier. Use the account map's Login actions first when required. For host-integrated visual inspection, open a NEW browser-tool tab at the manifest URL, inspect the real DOM, take a screenshot, then close only that tab. Never adopt a user's existing browser tab.

## Evidence

Keep evidence in the directory containing `instance.json`, never in app scratch. Report its absolute path, feature IDs, exact entry points exercised, action/result pairs, and explicit skipped paths. Read `result.json`; a screenshot or zero exit alone is not sufficient. For the baseline require:

- `actions.json` and `trace.zip`: navigation and interactions, including the autosave-triggering edit.
- `profile-before.png`, `profile-saved.png`, `profile-public.png`, `profile-public.aria.txt`: editor, reload persistence, and anonymous rendered Markdown with app identity visible.
- `bio-response.json` (HTTP 200) and `stored-bio.md`: response AND the exact Markdown queried from SQLite.
- `result.json`, `doctor.json`, `server.log`, `cleanup.json`: outcome, instance identity, diagnostics, teardown proof.

Exercise real user paths, never internal setters, DOM state mutation, or test-only endpoints. Capture actions AND resulting state, not only the final screen. Verify side effects (SQLite records, notifications/messages, generated static assets) in addition to visible feedback. Query the `records` table by its logical key, such as `data/bio/verify_gardener.md`; these keys are not runtime files. Copy only the relevant stored value; do not publish password hashes, session cookies, full session records, or browser storage. Trace artifacts can contain the disposable credentials; keep them local.

Do not mock application behavior. Mocks are appropriate only at an already-isolated production external boundary and must be disclosed. These mapped paths require no external API. The layout includes Google analytics; the default real browser may contact it. The dummy OpenAI key is not network isolation. If offline verification is required, block/report external browser requests and observe the blocked requests; do not claim the name `verification-no-network` prevents network traffic. A future dry-run/test-mode path needs actual observation of files, network, or git refs to establish what it skips.

A convenient entry point does not cover alternate entries in the map. The shipped profile proof covers header registration/login, own-profile editing, Logout, and direct public URL only—not every entry or all five areas. Extend coverage according to the change.

## Cleanup

Close any extra browser-tool tabs first. The proof helper closes its own browser in `finally`. Then run this even when the drive fails:

```sh
./.omp/skills/verify-belief-garden/scripts/instance.mjs cleanup "$MANIFEST"
node --input-type=module -e 'import {readFile,access} from "node:fs/promises"; import {dirname,join} from "node:path"; const m=process.argv[1]; const s=JSON.parse(await readFile(m)); if(!s.cleaned) throw Error("not cleaned"); for(const f of ["profile-public.png","trace.zip","stored-bio.md","result.json","cleanup.json"]) await access(join(dirname(m),f)); try {await access(s.scratch); throw Error("scratch survived")} catch(e) {if(e.code!=="ENOENT") throw e} console.log("Evidence survives cleanup:",dirname(m))' "$MANIFEST"
```

The final check is for a successful baseline; failed drives may instead have `failure.png`/`failure.txt`. Cleanup records the owned process tree, checks PID birth identities, signals only those processes, waits, escalates only surviving owned processes if needed, removes scratch, marks the manifest cleaned, and writes retained artifact names. Children launched in their own process groups are included. Never `pkill`, kill by process name, or remove the evidence directory. Do not delete shared `node_modules`. Scratch-local custom drivers disappear with scratch. `/tmp` artifacts survive cleanup but not necessarily machine reboot; copy the evidence directory to durable task storage when required.

## Helpers

Both scripts are executable, Linux-local, and invoked from the repository root:

- `./.omp/skills/verify-belief-garden/scripts/instance.mjs launch` — isolated app, readiness, manifest.
- `./.omp/skills/verify-belief-garden/scripts/instance.mjs doctor "$MANIFEST"` — read-only ownership/build/surface check.
- `./.omp/skills/verify-belief-garden/scripts/prove-profile.mjs "$MANIFEST"` — real Playwright account/profile proof; no teardown of the server.
- `./.omp/skills/verify-belief-garden/scripts/instance.mjs cleanup "$MANIFEST"` — owned server and scratch only; evidence retained.

Keep the map aligned with routes, visible entry points, selectors, and persistence behavior using the sibling `/skill:maintain-verification-skill` workflow. Do not mark unmapped areas verified: settings/password/deletion, follows/correlation, feed/replies/notifications beyond mapped username navigation, proposals/admin/bans, discovery, and image-generation tools require additional feature entries when touched.
