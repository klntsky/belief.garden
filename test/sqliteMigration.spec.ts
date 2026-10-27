import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { migrateDatabase } from '../src/migrations.js';

async function legacyFile(root: string, key: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
  await fs.writeFile(path.join(root, key), value);
}

test('migration preserves every legacy collection and session, then never reimports backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-sqlite-'));
  const database = new DatabaseSync(path.join(root, 'app.sqlite'));
  const records: Record<string, string> = {
    'data/beliefs.json': '{"Category":{"Belief":{"description":"existing"}}}',
    'data/admins.json': '[{"username":"gardener"}]',
    'data/proposed.json': '[]',
    'data/feed.json': '[{"actor":"gardener","timestamp":123}]',
    'data/accounts/gardener.json': '{"username":"gardener","passwordHash":"unchanged"}',
    'data/users/gardener.json': '{"Belief":{"choice":"support"}}',
    'data/bio/gardener.md': '# A garden 🌱\n\nA public bio.\n',
    'data/settings/gardener.json': '{"allowAllDebates":false}',
    'data/notifications/gardener.json': '[{"type":"follow","read":true}]',
    'data/followers/gardener.json': '["friend"]',
    'data/follows/friend.json': '["gardener"]',
    'data/bans/gardener.json': '[{"username":"banned"}]',
    'data/comments/Belief.json': '[{"comment":"A thought"}]',
    'data/debates/Belief.json': '[{"comment":"debate me"}]',
    'sessions/preserved-session.json': '{"passport":{"user":{"id":"gardener"}},"__lastAccess":123}',
    'public/users.json': '[{"username":"gardener","score":21}]',
  };
  try {
    for (const [key, value] of Object.entries(records)) await legacyFile(root, key, value);
    await legacyFile(root, 'public/static/beliefs.json', '{"seed":"must not overwrite"}');
    migrateDatabase(database, root);
    expect(Object.fromEntries(database.prepare('SELECT key, value FROM records').all().map(row => [row.key, row.value])))
      .toEqual(records);
    expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    for (const [key, value] of Object.entries(records)) expect(await fs.readFile(path.join(root, key), 'utf8')).toBe(value);

    database.prepare('UPDATE records SET value = ? WHERE key = ?').run('"new SQLite data"', 'data/feed.json');
    database.prepare('DELETE FROM records WHERE key = ?').run('data/accounts/gardener.json');
    await legacyFile(root, 'data/proposed.json', 'broken backup is not read again');
    migrateDatabase(database, root);
    expect(database.prepare('SELECT value FROM records WHERE key = ?').get('data/feed.json')?.value).toBe('"new SQLite data"');
    expect(database.prepare('SELECT value FROM records WHERE key = ?').get('data/accounts/gardener.json')).toBeUndefined();
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a late import failure rolls back schema, records and marker; fixing the source permits retry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-sqlite-'));
  const database = new DatabaseSync(path.join(root, 'app.sqlite'));
  try {
    await legacyFile(root, 'data/accounts/gardener.json', '{"username":"gardener"}');
    await legacyFile(root, 'sessions/last.json', '{invalid');
    expect(() => migrateDatabase(database, root)).toThrow('Cannot migrate invalid JSON: sessions/last.json');
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
    expect(await fs.readFile(path.join(root, 'data/accounts/gardener.json'), 'utf8')).toBe('{"username":"gardener"}');
    expect(await fs.readFile(path.join(root, 'sessions/last.json'), 'utf8')).toBe('{invalid');

    await legacyFile(root, 'sessions/last.json', '{"passport":{"user":"gardener"}}');
    migrateDatabase(database, root);
    expect(database.prepare('SELECT key FROM records ORDER BY key').all()).toEqual([
      { key: 'data/accounts/gardener.json' }, { key: 'sessions/last.json' },
    ]);
    expect(database.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('fresh installs seed beliefs transactionally and failed imports preserve preexisting SQLite records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-sqlite-'));
  const database = new DatabaseSync(path.join(root, 'app.sqlite'));
  try {
    database.exec('CREATE TABLE records (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT');
    database.prepare('INSERT INTO records VALUES (?, ?)').run('retained', 'important');
    await legacyFile(root, 'data/feed.json', '[]');
    await legacyFile(root, 'public/static/beliefs.json', '{broken');
    expect(() => migrateDatabase(database, root)).toThrow();
    expect(database.prepare('SELECT key, value FROM records').all()).toEqual([{ key: 'retained', value: 'important' }]);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").all()).toEqual([]);
    await legacyFile(root, 'public/static/beliefs.json', '{"seeded":{}}');
    migrateDatabase(database, root);
    expect(database.prepare('SELECT value FROM records WHERE key = ?').get('data/beliefs.json')?.value).toBe('{"seeded":{}}');
    expect(database.prepare('SELECT value FROM records WHERE key = ?').get('retained')?.value).toBe('important');
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the active database and its journal are excluded even with a custom filename', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'belief-sqlite-'));
  await fs.mkdir(path.join(root, 'data'));
  const database = new DatabaseSync(path.join(root, 'data/live-data'));
  try {
    await legacyFile(root, 'data/feed.json', '[]');
    migrateDatabase(database, root);
    expect(database.prepare('SELECT key, value FROM records').all()).toEqual([{ key: 'data/feed.json', value: '[]' }]);
    expect(database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
