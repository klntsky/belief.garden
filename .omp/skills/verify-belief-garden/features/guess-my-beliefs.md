# Guess My Beliefs

A visitor follows a profile invitation, guesses its gardener's positions one card at a time, sees revealed answers and a final score, and can replay.

## Sub-features

- `guess-entry`: invitation and shared URL open the gardener's game.
- `guess-answer`: a guess reveals correct/incorrect feedback and updates the counters.
- `guess-score`: completing the deck shows the score and allows replay.
- `guess-empty`: a profile with no stated positions explains why no game can start.

## How to get to it (user POV)

- Owner profile link `Invite someone to guess your beliefs`.
- Visitor profile link `How well do you know @verify_gardener? Guess their beliefs`.
- Shared `/<username>/guess` URL. The game links the gardener's username back to their profile.

## Driving it with Playwright

Preconditions:

- Baseline account exists. To get a deterministic one-card deck, use a fresh instance/account, Login, and select Budgeting support through the beliefs map's UI actions; leave other positions untouched.
- Explanation text alone is not a stated position. Do not seed the game with an internal save utility.

- **Owner invitation.** Signed in on the own profile, `await page.getByRole('link', {name: 'Invite someone to guess your beliefs', exact: true}).click(); await expect(page).toHaveURL(state.url + '/' + username + '/guess'); await expect(page.getByRole('heading', {name: 'Guess My Beliefs', exact: true})).toBeVisible();` Capture the invitation action, not just the landing page.
- **Visitor invitation.** Submit Logout, visit the profile, then `await page.getByRole('link', {name: 'How well do you know @' + username + '? Guess their beliefs', exact: true}).click();` Require the same game route. Separately navigate directly to that route for the shared-URL entry.
- **Start.** `await page.getByRole('button', {name: 'Start guessing', exact: true}).click(); await expect(page.locator('#guess-belief-name')).toHaveText('Budgeting');`
- **Correct answer.** `await page.locator('[data-choice="support"]').click(); await expect(page.getByText('Correct!', {exact: true})).toBeVisible(); await expect(page.getByText('1 correct', {exact: true})).toBeVisible(); await expect(page.getByText('1 answered', {exact: true})).toBeVisible();` Capture the chosen card and revealed state.
- **Finish and replay.** `await page.getByRole('button', {name: 'See my score', exact: true}).click(); await expect(page.getByText('1 / 1 correct', {exact: true})).toBeVisible(); await page.getByRole('button', {name: 'Play again', exact: true}).click(); await expect(page.getByText('0 answered', {exact: true})).toBeVisible();` Click reject next and require `Not quite.`, `Correct choice:`, and support in `#guess-answer`. Capture both outcomes.
- **Larger deck.** When multiple UI-created positions are relevant, read `#guess-belief-name` each turn; choose based on the recorded setup actions, then click `Next belief`, finally `See my score`. Do not assume deck order. Prove every card was answered and the exact expected score.
- **Empty state.** On a fresh account before any position is saved, open its guess URL and require the heading `No beliefs to guess yet`; `Start guessing` must be absent. An account with existing Budgeting support is not an empty-state fixture.
- **Profile backlink.** Click `page.getByRole('link', {name: username, exact: true}).first()` on the game and require `state.url + '/' + username`.
- **Proof.** Keep trace, card/reveal/final/replay screenshots and ARIA. Query `readStoredRecord('data/users/' + username + '.json')` from SQLite before and after the game, copy only the relevant beliefs to evidence, and require unchanged contents: playing guesses must not edit the gardener's positions.

## Gotchas

- Refresh starts a fresh game; scores are local game state, not a saved leaderboard.
- Only known catalog cards with support/reject/neutral positions enter the deck. Comments alone do not count.
- One-card setup uses `See my score` immediately after its answer; larger decks use `Next belief` until the last answer.
- Owner and visitor invitation wording differs. Drive both separately when invitation behavior changes.
- Do not claim social preview/crawler behavior from a browser score proof. That needs separate no-JavaScript/metadata/image checks; existing `test/guessMyBeliefs.spec.ts` is a reference.
