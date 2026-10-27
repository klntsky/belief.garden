# Accounts

A visitor creates a public page, signs in to edit it, and signs out to return to anonymous browsing.

## Sub-features

- `account-register`: valid registration creates the account and reaches Login.
- `account-login`: credentials lead to the user's editable profile and named header.
- `account-logout`: visible Logout submits the form and removes authenticated editing.
- `account-profile-entry`: the signed-in header and `/profile` reach the same own profile.

## How to get to it (user POV)

- Header `Register`, home-page `Create your page`, or direct `/register`.
- Header `Login`, profile's `Log in` correlation link while anonymous, or direct `/login`.
- Signed-in username in the header or `/profile`.
- Signed-in header `Logout`.

## Driving it with Playwright

Preconditions:

- Healthy isolated instance; use `verify_gardener` and the strong password defined in SKILL.md only in scratch.
- Registration starts with no such account. The shipped `prove-profile.mjs` covers header registration/login/logout, not the alternate links.

- **Header registration.** `await page.goto(state.url); await page.locator('.nav-links-right a[href="/register"]').click();` Expect `/register`. For the home CTA instead click `page.getByRole('link', { name: 'Create your page', exact: true })`; direct entry is `page.goto(state.url + '/register')`. Drive each entry independently when affected.
- **Create.** `await page.locator('input[name="username"]').fill(username); await page.locator('input[name="password"]').fill(password); await page.locator('button[type="submit"]').click(); await expect(page).toHaveURL(state.url + '/login');` Read `JSON.parse(readStoredRecord('data/accounts/' + username + '.json')).username` from SQLite and require the exact username; do not copy the password hash into evidence.
- **Login.** For header entry start at home and click `.nav-links-right a[href="/login"]`; for direct entry use `await page.goto(state.url + '/login')`. Fill the same two named inputs and submit. `await expect(page).toHaveURL(state.url + '/' + username); await expect(page.locator('#login-username')).toHaveText(username); await expect(page.locator('.user-bio-textarea')).toBeVisible();`
- **Anonymous profile login entry.** After Logout, `await page.goto(state.url + '/' + username); await page.locator('#correlation-container a[href="/login"]').click();` Expect Login and submit as above.
- **Own-profile entries.** Signed in, click `.nav-links-right a.user-notifications`, then separately navigate to `state.url + '/profile'`. Each must reach `state.url + '/' + username` with `.user-bio-textarea` visible.
- **Logout.** `await page.locator('form[action="/logout"] input[type="submit"]').click(); await expect(page).toHaveURL(state.url + '/'); await page.goto(state.url + '/' + username); await expect(page.locator('.user-bio-textarea')).toHaveCount(0); await expect(page.locator('.nav-links-right a[href="/login"]')).toBeVisible();` Revisit `/settings` and expect `/login` if checking protected access.
- **Proof.** Capture the trace for the registration/Login/Logout actions, a named-header screenshot, and the anonymous result. Account existence plus the editable profile prove registration/login; header alone is insufficient.

## Gotchas

- Registration redirects to Login, not an authenticated profile. Duplicate or reserved usernames keep the registration form with an error.
- Usernames are 3–30 letters/numbers/underscores/hyphens; `Login` is reserved regardless of case. A strong password is required.
- Logout is POST via its visible form. GET `/logout` returns 405 and is not a valid drive.
- Development rate limiting remains enabled; use a fresh isolated instance rather than disabling limits or registering many accounts.
- Do not run the existing `testHelpers.ts` user setup against the user's checkout: it deletes/recreates `testuser`.
