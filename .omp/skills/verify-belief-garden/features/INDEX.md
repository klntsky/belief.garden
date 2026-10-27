# belief.garden verification map

This is the maintained source for user-facing verification. Read this index, then all files affected by a change. The index is named `INDEX.md` because this repository prohibits README modifications.

## Baseline preconditions

- Launch through `../scripts/instance.mjs launch` from the repository root using the full path in [SKILL.md](../SKILL.md). Retain its absolute manifest path in `MANIFEST`.
- Doctor must identify the owned listener, source snapshot, scratch cwd, and Welcome home page. Never drive an unowned instance.
- Empty accounts, sessions, and generated statistics; beliefs seeded from the tracked catalog. Do not copy development accounts.
- `prove-profile.mjs "$MANIFEST"` creates `verify_gardener`, proves the bio, and leaves it logged out. No other account setup is needed for the initial five areas.
- For each additional feature, use the Playwright setup in SKILL.md: `state`, `evidence`, `page`, `expect`, `readFile`, `writeFile`, `join`, `username`, and `password` are defined there. Use a fresh context and the account map's Login recipe for authenticated actions.

## Driving conventions

- Prefer visible links/buttons and established name/data selectors. Route navigation is a separate entry point, not evidence that a link works.
- Wait on the matching real response and then assert visible/persisted state; do not copy existing tests' fixed autosave sleeps.
- Entries are listed separately. Report exactly which were driven; never claim another entry was verified by the same convenient URL.
- Every custom driver goes in this run's scratch directory and closes its browser in `finally`. Capture traces outside scratch.
- Baseline proof is not exhaustive feature coverage. Each map has exactly four H2 sections and names user-visible outcomes, not a source-text assertion.

## Proof and skip reporting

- Record feature ID, entry point, action, response/outcome, and unmet preconditions.
- UI proof includes before/action trace, resulting screenshot, and ARIA snapshot with app identity visible.
- Mutation proof includes a reload/public second view and the relevant persisted file copied to evidence, excluding credentials and session data.
- Preserve artifacts through cleanup. Failed runs also require cleanup; keep their failure evidence.
- No internal user creation/setters or test-only endpoints as feature proof. No undeclared external mocks.

## Features

- [Accounts](accounts.md): registration, login, logout, protected profile entry.
- [Public bio](profile-bio.md): autosaved Markdown and anonymous rendering.
- [Belief positions and core beliefs](beliefs.md): support/reject/neutral, undo, favorites and chart.
- [Belief explanations](explanations.md): autosaved per-card comments and public reading.
- [Guess My Beliefs](guess-my-beliefs.md): invitation links, guessing, score, replay, empty state.

## Known unmapped surfaces

Settings/password/account deletion; feed/discussion replies/chat; follows/correlation; notifications; user discovery/gallery/FAQ; proposing cards; admin approval/deletion and bans. Map these when touched rather than asserting they are covered by the five starter areas. Image generation can call OpenAI and write image assets; it needs its own boundary-aware recipe and real prerequisites.
