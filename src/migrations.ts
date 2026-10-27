import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './storage.js';

export function migrateDatabase(database: DatabaseSync, root: string): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY) STRICT;
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    `);
    if (!database.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get()) {
      const insert = database.prepare('INSERT INTO records (key, value) VALUES (?, ?)');
      const databaseFiles = new Set(database.prepare('PRAGMA database_list').all().flatMap(row => {
        const filename = row.file as string;
        return filename ? ['', '-journal', '-wal', '-shm'].map(suffix => path.resolve(filename + suffix)) : [];
      }));
      const importFile = (key: string): void => {
        const value = fs.readFileSync(path.join(root, key), 'utf8');
        if (key.endsWith('.json')) {
          try {
            JSON.parse(value);
          } catch (cause) {
            throw new Error(`Cannot migrate invalid JSON: ${key}`, { cause });
          }
        }
        insert.run(key, value);
      };
      const importDirectory = (directory: string): void => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(path.join(root, directory), { withFileTypes: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw error;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          const key = `${directory}/${entry.name}`;
          if (databaseFiles.has(path.resolve(root, key))) continue;
          if (entry.isDirectory()) {
            importDirectory(key);
          } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.md'))) {
            importFile(key);
          } else if (entry.isSymbolicLink()) {
            throw new Error(`Cannot migrate symbolic link: ${key}`);
          } else {
            throw new Error(`Unsupported legacy data file: ${key}`);
          }
        }
      };
      importDirectory('data');
      importDirectory('sessions');
      if (fs.existsSync(path.join(root, 'public/users.json'))) importFile('public/users.json');
      if (!database.prepare('SELECT 1 FROM records WHERE key = ?').get('data/beliefs.json')) {
        const seed = path.join(root, 'public/static/beliefs.json');
        if (fs.existsSync(seed)) {
          const value = fs.readFileSync(seed, 'utf8');
          JSON.parse(value);
          insert.run('data/beliefs.json', value);
        }
      }
      database.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export async function runDataMigrations(): Promise<void> {
  getDatabase();
}
