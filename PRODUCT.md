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
