import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrateDatabase } from './migrations.js';

let database: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (database) return database;
  const filename = path.resolve(process.env.DATABASE_PATH || 'data/belief-garden.sqlite');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const connection = new DatabaseSync(filename);
  try {
    connection.exec('PRAGMA busy_timeout = 30000; PRAGMA synchronous = FULL;');
    migrateDatabase(connection, process.cwd());
    database = connection;
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

function recordKey(key: string): string {
  const relative = path.relative(process.cwd(), path.resolve(key));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Record key must be contained in the application directory');
  }
  return relative.split(path.sep).join('/');
}

function missing(key: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`Record not found: ${key}`), { code: 'ENOENT' });
}

export function readRecord(key: string): string {
  const row = getDatabase().prepare('SELECT value FROM records WHERE key = ?').get(recordKey(key));
  if (!row) throw missing(key);
  return row.value as string;
}

export function hasRecord(key: string): boolean {
  return getDatabase().prepare('SELECT 1 FROM records WHERE key = ?').get(recordKey(key)) !== undefined;
}

export function writeRecord(key: string, value: string): void {
  getDatabase().prepare('INSERT INTO records (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(recordKey(key), value);
}

export function deleteRecord(key: string): void {
  const result = getDatabase().prepare('DELETE FROM records WHERE key = ?').run(recordKey(key));
  if (result.changes === 0) throw missing(key);
}

export function listRecords(directory: string): string[] {
  const prefix = `${recordKey(directory)}/`;
  const rows = getDatabase().prepare('SELECT key FROM records WHERE substr(key, 1, ?) = ? ORDER BY key')
    .all(prefix.length, prefix);
  return rows.map(row => (row.key as string).slice(prefix.length)).filter(name => !name.includes('/'));
}

export function transaction<T>(operation: () => T): T {
  const connection = getDatabase();
  connection.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    connection.exec('COMMIT');
    return result;
  } catch (error) {
    connection.exec('ROLLBACK');
    throw error;
  }
}
