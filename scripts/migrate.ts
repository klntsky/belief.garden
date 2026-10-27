import 'dotenv/config';
import { runDataMigrations } from '../src/migrations.js';

await runDataMigrations();
console.log('SQLite data migration complete.');
