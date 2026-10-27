# belief.garden verification map

This is the maintained source for user-facing verification. Read this index, then all files affected by a change. The index is named `INDEX.md` because this repository prohibits README modifications.

## Baseline preconditions

- Launch through `../scripts/instance.mjs launch` from the repository root using the full path in [SKILL.md](../SKILL.md). Retain its absolute manifest path in `MANIFEST`.
- Doctor must identify the owned listener, source snapshot, scratch cwd, and Welcome home page. Never drive an unowned instance.
- Empty SQLite accounts, sessions, and generated statistics; beliefs seeded from the tracked catalog. Do not copy development accounts or databases.
- `prove-profile.mjs "$MANIFEST"` creates `verify_gardener`, proves the bio from SQLite, and leaves it logged out. No other account setup is needed for the initial five areas.
- For each additional feature, use the Playwright setup in SKILL.md: `state`, `evidence`, `page`, `expect`, `readFile`, `writeFile`, `readStoredRecord`, `join`, `username`, and `password` are defined there. `readStoredRecord(key)` queries scratch's SQLite database read-only. Use a fresh context and the account map's Login recipe for authenticated actions.

## Driving conventions

- Prefer visible links/buttons and established name/data selectors. Route navigation is a separate entry point, not evidence that a link works.
- Wait on the matching real response and then assert visible/persisted state; do not copy existing tests' fixed autosave sleeps.
- Entries are listed separately. Report exactly which were driven; never claim another entry was verified by the same convenient URL.
- Every custom driver goes in this run's scratch directory and closes its browser in `finally`. Capture traces outside scratch.
- Baseline proof is not exhaustive feature coverage. Each map has exactly four H2 sections and names user-visible outcomes, not a source-text assertion.

## Proof and skip reporting

- Record feature ID, entry point, action, response/outcome, and unmet preconditions.
- UI proof includes before/action trace, resulting screenshot, and ARIA snapshot with app identity visible.
- Mutation proof includes a reload/public second view and the relevant SQLite record value copied to evidence, excluding credentials and session data.
- Preserve artifacts through cleanup. Failed runs also require cleanup; keep their failure evidence.
- No internal user creation/setters or test-only endpoints as feature proof. No undeclared external mocks.

## Features

- [Accounts](accounts.md): registration, login, logout, protected profile entry.
- [Public bio](profile-bio.md): autosaved Markdown and anonymous rendering.
- [Belief positions and core beliefs](beliefs.md): support/reject/neutral, undo, favorites and chart.
- [Belief explanations](explanations.md): autosaved per-card comments and public reading.
- [Guess My Beliefs](guess-my-beliefs.md): invitation links, guessing, score, replay, empty state.
- [Feed username navigation](#feed-username-navigation): native profile links without modifying chat drafts.
- [Hybrid notification cursors](#hybrid-notification-cursors): fresh-device fallback and legacy browser precedence.
- [Belief correlations](#belief-correlations). Profile values, feed indicators, and lazy cache invalidation.

## Feed username navigation

- On an isolated instance, register and log in through the UI, then open `/feed`.
  Registration supplies an activity row; send a chat message to cover its author too.
- Type an unsent chat draft. Middle-click the actor/author username and require a
  new tab at `/<username>`, with the original feed tab and draft unchanged.
- Ordinary click and keyboard Enter on that username must navigate to the profile.
- Type and send an explicit `@username` mention to confirm chat still accepts it.
- Log out, reopen `/feed`, and click an actor link. Require the public profile;
  anonymous feeds have no chat input. Capture the draft and destination screenshots.

## Hybrid notification cursors

- In a fresh isolated browser context, register and log in through the UI. Its
  existing welcome notification should not appear unread when both cursors are absent.
- Register a second account in another context and send `@<recipient>` through
  `/feed`. Open the recipient's `/notifications`; the mention must be unread.
- Click `Mark all as read`, await HTTP 204 from `/api/notifications/read`, then log
  in as the recipient in a fresh browser context. Require no replayed backlog.
- Send a second mention, mark it read on the fresh device, then reopen notifications
  on the original device. Its older local cursor must still show the second mention,
  without moving the server cursor backward. Stay within two chat messages/minute.
- Query only the relevant `data/notification-read/<username>.json` SQLite records
  for corroboration. Retain screenshots and the effective read timestamps.

## Belief correlations

- Register two accounts through the UI. Give both Existentialism, Absurdism,
  Nihilism, Stoicism, and Hedonism the positions support, neutral, reject, support,
  and reject. Await each PUT response. Star the target's Existentialism card.
- Log in as the viewer and open the target's profile. Require 100% correlation.
  Change the target's Existentialism to reject, then revisit as the viewer and
  require 56%. Change the viewer's Existentialism to reject and require 100%.
  Undo a selected position before choosing another; unselected buttons are hidden.
- Clear the target's Existentialism choice. Require the insufficient-data message
  and a null result from `/api/correlation/<target>`. Inspect the changed choice
  records in SQLite read-only and retain them without account credentials.
- On `/feed`, wait for `.correlation-bullet` on the relevant `[data-username]`.
  Require one bullet per processed label, a gray insufficient-data indicator,
  and a white self indicator with `(You)`. Before clearing the choice, hover the
  target's label and capture its percentage plus Core Beliefs tooltip.
- Log out. Require the profile's sign-in prompt, hidden feed bullets, and no
  `/api/correlation/` requests. Wait for asynchronous page initialization rather
  than treating navigation completion as a rendered result.
- Run `pnpm run verify-correlations` for calculation counts, external-write and
  rollback invalidation, deletion/recreation, and bounded cache eviction.

## Known unmapped surfaces

Settings/password/account deletion; feed/discussion replies/chat beyond username navigation and the cursor-smoke mention flow; follows; notification behavior beyond hybrid cursors; user discovery/gallery/FAQ; proposing cards; admin approval/deletion and bans. Map these when touched rather than asserting they are covered by the starter areas. Image generation can call OpenAI and write image assets; it needs its own boundary-aware recipe and real prerequisites.
