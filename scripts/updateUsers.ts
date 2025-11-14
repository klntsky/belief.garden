// scripts/updateUsers.ts
// Standalone script to manually trigger user statistics update
// Note: The server now runs this automatically on startup and periodically

import { updateUsersJson } from '../src/utils/updateUsers.js';

console.log('Running manual user statistics update...');
updateUsersJson();
console.log('Done!');

