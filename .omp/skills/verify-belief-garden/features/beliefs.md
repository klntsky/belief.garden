# Belief positions and core beliefs

A gardener records support, neutrality, or rejection on a belief card, undoes a choice, and highlights core beliefs in their public profile chart.

## Sub-features

- `belief-choice`: support/reject/neutral persist and appear to visitors.
- `belief-undo`: clicking the selected position clears it.
- `belief-core`: star selection persists and adds the belief to Core Beliefs; toggling removes it.

## How to get to it (user POV)

- Own profile after Login, header username, or direct `/<username>`.
- Shareable `/<username>#Budgeting` anchors the Budgeting card.
- Signed-in footer `Gallery` selects a random card; its `.belief-link` opens the own profile with that card's hash. This is a separate randomized entry, not a guaranteed Budgeting link.

## Driving it with Playwright

Preconditions:

- Baseline account exists, logged in through the account map. Budgeting exists in the tracked belief catalog.
- Use a fresh position state or inspect existing values before deciding what a click should change.

- **Reach card.** `await page.goto(state.url + '/' + username + '#Budgeting'); const card = page.locator('.belief[data-belief-name="Budgeting"]'); await expect(card).toBeVisible();` Also drive the header link if its navigation changed.
- **Support.** Register `const changed = page.waitForResponse(r => r.url().endsWith('/api/user-beliefs/' + username + '/Budgeting') && r.request().method() === 'PUT'); await card.locator('.support').click(); expect((await changed).status()).toBe(200); await expect(card.locator('.support')).toHaveClass(/selected/);` Reload and assert selected again. Read `JSON.parse(readStoredRecord('data/users/' + username + '.json'))` from SQLite and require `Budgeting.choice === 'support'`.
- **Neutral and reject.** Repeat that response/action/reload pattern with `.neutral` and `.reject`, requiring the exact persisted `choice` each time. These are distinct positions; support alone does not prove them.
- **Undo.** Click the currently selected button and observe its PUT. After reload, `await expect(card.locator('.choice-button.selected')).toHaveCount(0);` The stored Budgeting entry must have no `choice` (it may retain other fields).
- **Core selection.** From an unstarred card, register `const starred = page.waitForResponse(r => r.url().endsWith('/api/user-favorites/' + username + '/Budgeting') && r.request().method() === 'POST'); await card.locator('.favorite-star').click(); expect((await starred).status()).toBe(200); await expect(card.locator('.favorite-star')).toHaveClass(/active/); await expect(page.locator('#pie-chart-container canvas')).toBeVisible();` Reload, require active again, and capture the card plus Core Beliefs chart. Read the stored Budgeting `preference` and require a number. Toggle off with the same response wait and require inactive plus absent `preference` after reload.
- **Visitor.** Leave a supported Budgeting choice, submit Logout, reopen the direct profile, and require the Budgeting `.support.selected` card. Capture trace, card screenshot, ARIA, and the relevant Budgeting stored object outside scratch.
- **Gallery entry.** Signed in, click `.site-footer a[href="/gallery"]`, wait for `.belief-link`, read its `href`, then click. Require that exact URL/hash and the matching `data-belief-name` card rather than asserting a randomly chosen title. Record the title in the action evidence.

## Gotchas

- Clicking a selected choice toggles it off. Clear it before choosing another position; unselected buttons are hidden while a choice is selected.
- Guest profiles omit untouched cards. A new profile is not evidence of a missing catalog.
- A star can exist without a choice. Chart visibility alone does not prove the correct belief was added; show the card, reload state, and stored numeric preference alongside the chart.
- Chart labels use bold Unicode letters. Do not compare raw ASCII text to the chart internals or set chart state as a shortcut.
- Gallery is random. Do not depend on a hard-coded random result or reseed JavaScript internals.
