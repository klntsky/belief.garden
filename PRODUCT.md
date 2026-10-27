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
