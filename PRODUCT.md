# Product requirements

## Belief proposals

Proposal submissions require a category, name, and description containing
non-whitespace text. Invalid submissions return HTTP 400 without changing pending
proposals; the additional image prompt remains optional.

## Persistent data

Accounts, passwords, beliefs, bios, settings, proposals, administrators, social
relationships, bans, notifications, feed/discussion content, discovery caches, and
sessions persist in SQLite. Existing JSON and Markdown records migrate without
changing their contents. Migration is all-or-nothing and runs once; failures leave
the source files untouched and allow a retry without a partial database cutover.
Static site assets, including belief images, remain filesystem assets.

## Feed usernames

Usernames on `/feed`, including activity actors and chat authors, are ordinary
links to the user's profile. Clicking a username does not insert a mention or
change the chat draft. Keyboard activation and opening links in a new tab retain
normal browser behavior. Mentions can still be typed explicitly in chat.

## Notification read cursors

Existing browser read timestamps remain authoritative for that browser. Polling
with a browser cursor also advances the account's SQLite cursor when it is newer;
an older browser cursor never moves the server backward and is not overwritten
by a newer server cursor.

A browser without a local cursor uses the account's server cursor. If neither
exists, the server initializes it once to the latest retained notification,
suppressing the initial historical backlog. Subsequent arrivals remain unread.
An explicit zero cursor is existing client state, not a missing cursor.

Marking notifications read preserves the local behavior and immediately syncs the
displayed latest timestamp to the server. Notifications arriving after that
displayed timestamp remain unread. Notification records are retained; cursors do
not delete history. Account deletion also removes its server cursor.
