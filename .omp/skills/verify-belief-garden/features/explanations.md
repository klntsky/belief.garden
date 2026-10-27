# Belief explanations

A gardener explains a belief with a per-card comment; the autosaved text remains visible to visitors independently of whether the gardener selected a position.

## Sub-features

- `explanation-save`: inline explanation persists on the selected card.
- `explanation-public`: anonymous visitors can read that explanation.
- `explanation-clear`: clearing removes the explanation while preserving an existing position.

## How to get to it (user POV)

- Own profile after Login, header username, or direct `/<username>`.
- Direct `/<username>#Budgeting` focuses the same card.
- A visitor follows the shared profile URL and reads the card's explanation.

## Driving it with Playwright

Preconditions:

- Baseline account exists; use the account map's Login actions. Budgeting card exists.
- For the clear/preserve case first select support through the beliefs map and wait for its PUT.

- **Reach.** Click the signed-in header username, then navigate independently to `state.url + '/' + username + '#Budgeting'` if covering the anchor entry. Define `const card = page.locator('.belief[data-belief-name="Budgeting"]'); await expect(card).toBeVisible();` Log which entry was used.
- **Write.** `const explanation = 'I plan spending before the month begins.'; const saved = page.waitForResponse(r => r.url().endsWith('/api/user-beliefs/' + username + '/Budgeting') && r.request().method() === 'PUT'); await card.locator('textarea.comment-input').fill(explanation); expect((await saved).status()).toBe(200);` Capture the action in the trace.
- **Persistence.** `await page.reload(); await expect(card.locator('textarea.comment-input')).toHaveValue(explanation); const stored = JSON.parse(await readFile(join(state.scratch, 'data/users/' + username + '.json'), 'utf8')); expect(stored.Budgeting.comment).toBe(explanation);` Copy the Budgeting object to evidence, not the entire data tree.
- **Public reading.** Submit visible Logout, reopen the same profile URL, and `await expect(card.locator('.comment-display')).toContainText(explanation);` Save screenshot and ARIA plus the trace and stored value.
- **Clear without losing choice.** Log in again; start the same PUT response wait, fill the card's `textarea.comment-input` with `''`, await HTTP 200, and reload. Require no stored `comment` and `Budgeting.choice === 'support'`. Logout and require support still visible with the explanation text gone. Capture the two states separately.

## Gotchas

- Autosave is debounced. Arm the response wait before filling and assert reload persistence; never substitute a sleep.
- Maximum explanation length is 400 characters. Do not confuse this with the 1,500-character bio.
- Explanation without a position can still make a guest card visible, labeled `No choice`.
- Visitor replies are a separate discussion feature, not the owner's `textarea.comment-input`; this starter map does not prove replies or notifications.
