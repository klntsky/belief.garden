import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deleteRecord, getDatabase, transaction, writeRecord } from '../src/storage.js';

const directory = mkdtempSync(path.join(tmpdir(), 'belief-correlation-proof-'));
const previousDirectory = process.cwd();
const previousDatabase = process.env.DATABASE_PATH;
const databasePath = path.join(directory, 'data', 'belief-garden.sqlite');
const session = new Session();
let database: DatabaseSync | undefined;
let external: DatabaseSync | undefined;
const results: Array<{ check: string; calculations: number }> = [];

process.chdir(directory);
process.env.DATABASE_PATH = databasePath;
session.connect();

async function expectCalculations(expected: number, check: string): Promise<void> {
  const coverage = await session.post('Profiler.takePreciseCoverage');
  const module = coverage.result.find(script => /\/src\/utils\/correlationUtils\.(?:ts|js)$/.test(script.url));
  const calculation = module?.functions.find(fn => fn.functionName === 'pearson');
  const actual = calculation?.ranges[0]?.count ?? 0;
  assert.equal(actual, expected, check);
  results.push({ check, calculations: actual });
}

const varied = ['support', 'neutral', 'reject', 'support', 'reject'];
const opposite = ['reject', 'neutral', 'support', 'reject', 'support'];
function document(choices: readonly string[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...Object.fromEntries(choices.map((choice, index) => [`Belief ${index}`, { choice }])),
    ...extra,
  });
}

try {
  database = getDatabase();
  const save = (username: string, choices: readonly string[], extra: Record<string, unknown> = {}): void => {
    writeRecord(`data/users/${username}.json`, document(choices, extra));
  };
  save('viewer', varied);
  save('target', varied);
  await session.post('Profiler.enable');
  await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  // Import after profiling starts so eager module-load calculation is observable.
  const { getCorrelation } = await import('../src/utils/correlationUtils.js');
  await expectCalculations(0, 'module import does not calculate');

  save('viewer', varied);
  save('target', varied);
  await expectCalculations(0, 'writes do not calculate');
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(1, 'cold pair calculates once');
  assert.equal(getCorrelation('target', 'viewer'), 1);
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(0, 'reverse and repeated pairs hit memory cache');

  save('constant', ['support', 'support', 'support', 'support', 'support']);
  assert.equal(getCorrelation('viewer', 'constant'), 0);
  await expectCalculations(1, 'zero coefficient calculates once');
  assert.equal(getCorrelation('constant', 'viewer'), 0);
  await expectCalculations(0, 'zero coefficient is cacheable');
  save('sparse', varied.slice(0, 4));
  assert.equal(getCorrelation('viewer', 'sparse'), null);
  await expectCalculations(1, 'insufficient overlap calculates once');
  assert.equal(getCorrelation('sparse', 'viewer'), null);
  await expectCalculations(0, 'null coefficient is cacheable');

  save('target', varied, { 'Belief 0': { choice: 'support', comment: 'Changed text', preference: 3, replies: [] } });
  await expectCalculations(0, 'non-choice writes do not calculate');
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(0, 'comment and preference edits preserve cached result');
  save('unrelated', opposite);
  writeRecord('data/beliefs.json', JSON.stringify({ Renamed: [] }));
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(0, 'unrelated users and catalog changes preserve cached result');

  save('target', opposite);
  await expectCalculations(0, 'choice write invalidates without calculating');
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(1, 'next request observes changed target choices');
  save('viewer', opposite);
  await expectCalculations(0, 'viewer write does not calculate');
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(1, 'next request observes changed viewer choices');
  save('target', opposite.slice(0, 4));
  assert.equal(getCorrelation('viewer', 'target'), null);
  await expectCalculations(1, 'removing a shared choice invalidates the result');
  save('viewer', varied);
  save('target', opposite);
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(1, 'restored pair calculates on request');

  external = new DatabaseSync(databasePath);
  external.prepare('UPDATE records SET value = ? WHERE key = ?').run(document(varied), 'data/users/target.json');
  await expectCalculations(0, 'another SQLite connection does not trigger calculation');
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(1, 'external committed update invalidates the next requested result');
  external.close();
  external = undefined;

  database.exec('BEGIN IMMEDIATE');
  try {
    save('target', opposite);
    assert.equal(getCorrelation('viewer', 'target'), -1);
  } finally {
    database.exec('ROLLBACK');
  }
  await expectCalculations(1, 'transaction-local input is calculated only when requested');
  assert.equal(getCorrelation('viewer', 'target'), 1);
  await expectCalculations(1, 'rolled-back input cannot poison a later request');

  deleteRecord('data/users/target.json');
  await expectCalculations(0, 'deletion does not calculate');
  assert.equal(getCorrelation('viewer', 'target'), null);
  await expectCalculations(1, 'deleted input yields insufficient data');
  assert.equal(getCorrelation('viewer', 'target'), null);
  await expectCalculations(0, 'missing input result is cacheable');
  save('target', opposite);
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(1, 'recreated username cannot inherit a stale result');
  deleteRecord('data/users/target.json');
  save('target', opposite);
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(0, 'identical recreated choices safely reuse the same result');

  writeRecord('data/users/target.json', '{broken');
  assert.throws(() => getCorrelation('viewer', 'target'));
  await expectCalculations(0, 'malformed source fails without calculating a fallback');
  save('target', opposite);
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(0, 'repaired source recovers without caching the error');

  transaction(() => {
    for (let index = 0; index < 96; index++) save(`pair_${index}`, varied);
  });
  await expectCalculations(0, 'preparing many users does not precompute any pairs');
  let pairCount = 0;
  for (let left = 0; left < 96 && pairCount < 4097; left++) {
    for (let right = left + 1; right < 96 && pairCount < 4097; right++) {
      assert.equal(getCorrelation(`pair_${left}`, `pair_${right}`), 1);
      pairCount++;
    }
  }
  await expectCalculations(4097, 'only explicitly requested pairs are calculated');
  assert.equal(getCorrelation('pair_0', 'pair_1'), 1);
  await expectCalculations(1, 'pair cache evicts its oldest entry at the count bound');

  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(1, 'reference pair is warmed after pair eviction');
  transaction(() => {
    for (let index = 0; index < 257; index++) save(`participant_${index}`, varied);
  });
  await expectCalculations(0, 'preparing participants does not calculate');
  for (let index = 0; index < 257; index++) {
    assert.equal(getCorrelation('viewer', `participant_${index}`), 1);
  }
  await expectCalculations(257, 'participant cache growth does not calculate unrequested pairs');
  assert.equal(getCorrelation('viewer', 'target'), -1);
  await expectCalculations(1, 'evicted participant identity cannot hit an old pair');

  save('oversized', varied, { notes: { comment: 'x'.repeat(5 * 1024 * 1024) } });
  await expectCalculations(0, 'large document write does not calculate');
  assert.equal(getCorrelation('viewer', 'oversized'), 1);
  await expectCalculations(1, 'oversized input can still be calculated on request');
  assert.equal(getCorrelation('viewer', 'oversized'), 1);
  await expectCalculations(1, 'oversized snapshots are not retained beyond the cache budget');

  console.log(JSON.stringify({ passed: true, checks: results }, null, 2));
} finally {
  await session.post('Profiler.stopPreciseCoverage').catch(() => undefined);
  session.disconnect();
  external?.close();
  database?.close();
  process.chdir(previousDirectory);
  if (previousDatabase === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousDatabase;
  rmSync(directory, { recursive: true, force: true });
}
