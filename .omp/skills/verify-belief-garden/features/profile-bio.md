# Public bio

A gardener edits their bio inline; autosaved Markdown persists after a reload and is rendered for anonymous profile visitors.

## Sub-features

- `profile-bio`: editing saves the exact text and survives reload.
- `profile-public-bio`: anonymous visitors see rendered Markdown, not an editor.

## How to get to it (user POV)

- Login redirects to the own profile; the header username returns there from any page.
- Direct `/<username>` opens the same profile; anonymous visitors use its shareable URL.
- A username link from `/users` opens that profile once the account has saved belief data; do not assume a newly registered empty profile is listed.

## Driving it with Playwright

Preconditions:

- Baseline account exists; start a new Playwright context and use the account map's Login actions.
- The complete shipped `prove-profile.mjs` executes this feature from a fresh instance, including registration.

- **Own-profile link.** `await page.locator('.nav-links-right a.user-notifications').click(); await expect(page).toHaveURL(state.url + '/' + username); await expect(page.locator('.user-bio-textarea')).toBeVisible();` Direct entry is a separate `page.goto(state.url + '/' + username)`.
- **Edit and await save.** Define `const bio = 'Verification gardener: **public profile persisted**.'; const saved = page.waitForResponse(r => r.url() === state.url + '/api/user-bio/' + username && r.request().method() === 'POST'); await page.locator('.user-bio-textarea').fill(bio); expect((await saved).status()).toBe(200);` Start the response wait BEFORE editing.
- **Persistence.** `await page.reload(); await expect(page.locator('.user-bio-textarea')).toHaveValue(bio); expect(await readFile(join(state.scratch, 'data/bio/' + username + '.md'), 'utf8')).toBe(bio);` Copy that Markdown to `join(evidence, 'stored-bio.md')`.
- **Anonymous view.** Submit visible Logout using the account map, then `await page.goto(state.url + '/' + username); await expect(page.locator('.user-bio-text strong')).toHaveText('public profile persisted'); await expect(page.locator('.user-bio-textarea')).toHaveCount(0);` Trace the action and capture `page.screenshot({path: join(evidence, 'profile-public.png')})` plus `writeFile(join(evidence, 'profile-public.aria.txt'), await page.locator('body').ariaSnapshot())`.
- **Users entry.** If that link is affected, first save a position through the beliefs map, navigate to `/users`, click `page.getByRole('link', {name: username, exact: true})`, and require the same public bio. Record this as separate entry-point coverage.

## Gotchas

- Autosave waits 1.5 seconds of inactivity. A reload before the successful POST loses the unsaved draft; a fixed sleep is not proof of completion.
- Maximum bio is 1,500 characters. Anonymous view renders Markdown through sanitization; owners see raw Markdown in a textarea.
- The profile initially fetches the bio asynchronously. Wait for `.user-bio-textarea` or the rendered public value.
- Only the relevant Markdown file belongs in evidence. Sessions and account password hashes do not.
