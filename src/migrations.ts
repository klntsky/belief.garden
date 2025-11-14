// src/migrations.ts
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Migration function: Ensure all required data directories exist
 */
async function ensureRequiredDirectories(): Promise<void> {
  const requiredDirs = [
    'data/accounts',
    'data/bans',
    'data/bio',
    'data/comments',
    'data/debates',
    'data/users',
    'data/settings',
    'data/notifications',
    'data/followers',
    'data/follows'
  ];

  await Promise.all(
    requiredDirs.map(dir => fs.mkdir(dir, { recursive: true }))
  );
}

/**
 * Migration function: Move beliefs.json from public/static/ to data/ if needed
 */
async function migrateBeliefsJson(): Promise<void> {
  const oldPath = path.join('public', 'static', 'beliefs.json');
  const newPath = path.join('data', 'beliefs.json');
  
  try {
    // Check if data/beliefs.json already exists
    await fs.access(newPath);
    console.log('data/beliefs.json already exists, skipping migration');
    return;
  } catch {
    // data/beliefs.json doesn't exist, check if old location exists
    try {
      await fs.access(oldPath);
      // Old file exists, move it to new location
      console.log('Migrating beliefs.json from public/static/ to data/...');
      await fs.mkdir('data', { recursive: true });
      await fs.rename(oldPath, newPath);
      console.log('Successfully migrated beliefs.json to data/');
    } catch (err) {
      const error = err as { code?: string };
      if (error.code === 'ENOENT') {
        console.log('No beliefs.json found in old location, skipping migration');
      } else {
        console.error('Error during beliefs.json migration:', err);
        throw err;
      }
    }
  }
}

/**
 * Run all data migrations
 */
export async function runDataMigrations(): Promise<void> {
  await ensureRequiredDirectories();
  await migrateBeliefsJson();
}

