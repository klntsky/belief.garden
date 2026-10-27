import type { StatementSync } from 'node:sqlite';
import { getDatabase } from '../storage.js';

type Score = -1 | 0 | 1;
type Source = string | null;

interface ProjectedChoices {
  readonly choices: ReadonlyMap<string, Score>;
  readonly units: number;
}

interface ChoiceVector extends ProjectedChoices {
  readonly token: symbol;
}

interface UserSnapshot {
  readonly source: Source;
  readonly vector: ChoiceVector;
  readonly units: number;
}

interface PairResult {
  readonly left: symbol;
  readonly right: symbol;
  readonly correlation: number | null;
}

const MAX_USERS = 256;
const MAX_PAIRS = 4096;
const MAX_USER_UNITS = 4 * 1024 * 1024;
const users = new Map<string, UserSnapshot>();
const pairs = new Map<string, PairResult>();
let retainedUserUnits = 0;
let sourceStatement: StatementSync | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectChoices(source: Source): ProjectedChoices {
  const choices = new Map<string, Score>();
  let units = 0;
  if (source === null) return { choices, units };

  const document: unknown = JSON.parse(source);
  if (!isObject(document)) throw new Error('Invalid user beliefs document');
  for (const name of Object.keys(document)) {
    const belief = document[name];
    if (!isObject(belief)) throw new Error('Invalid user belief entry');
    const choice = belief.choice;
    if (!choice) continue;
    choices.set(name, choice === 'reject' ? -1 : choice === 'support' ? 1 : 0);
    units += name.length + 32;
  }
  return { choices, units };
}

function sameChoices(left: ReadonlyMap<string, Score>, right: ReadonlyMap<string, Score>): boolean {
  if (left.size !== right.size) return false;
  for (const [name, score] of left) {
    if (right.get(name) !== score) return false;
  }
  return true;
}

function retainUser(username: string, snapshot: UserSnapshot): void {
  const previous = users.get(username);
  if (previous !== undefined) {
    retainedUserUnits -= previous.units;
    users.delete(username);
  }
  if (snapshot.units > MAX_USER_UNITS) return;
  users.set(username, snapshot);
  retainedUserUnits += snapshot.units;
  while (users.size > MAX_USERS || retainedUserUnits > MAX_USER_UNITS) {
    const oldest = users.entries().next().value!;
    retainedUserUnits -= oldest[1].units;
    users.delete(oldest[0]);
  }
}

function resolveSnapshot(username: string, source: Source): UserSnapshot {
  const previous = users.get(username);
  if (previous !== undefined && previous.source === source) {
    users.delete(username);
    users.set(username, previous);
    return previous;
  }

  const projected = projectChoices(source);
  const vector = previous !== undefined &&
    (previous.source === null) === (source === null) &&
    sameChoices(previous.vector.choices, projected.choices)
    ? previous.vector
    : { token: Symbol(), choices: projected.choices, units: projected.units };
  const snapshot = {
    source,
    vector,
    units: (source?.length ?? 0) + username.length + vector.units + 64,
  };
  retainUser(username, snapshot);
  return snapshot;
}

function pearson(left: ReadonlyMap<string, Score>, right: ReadonlyMap<string, Score>): number | null {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  for (const [name, x] of smaller) {
    const y = larger.get(name);
    if (y === undefined) continue;
    n++;
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
  }
  if (n < 5) return null;
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator === 0 ? 0 : numerator / denominator;
}

function retainPair(key: string, result: PairResult): void {
  pairs.delete(key);
  pairs.set(key, result);
  if (pairs.size > MAX_PAIRS) pairs.delete(pairs.keys().next().value!);
}

export function getCorrelation(viewerUsername: string, targetUsername: string): number | null {
  const leftName = viewerUsername <= targetUsername ? viewerUsername : targetUsername;
  const rightName = viewerUsername <= targetUsername ? targetUsername : viewerUsername;
  sourceStatement ??= getDatabase().prepare(`
    SELECT left_doc.value AS leftSource, right_doc.value AS rightSource
    FROM (SELECT 1) AS seed
    LEFT JOIN records AS left_doc ON left_doc.key = ?
    LEFT JOIN records AS right_doc ON right_doc.key = ?
  `);
  const sources = sourceStatement.get(`data/users/${leftName}.json`, `data/users/${rightName}.json`) as {
    leftSource: Source;
    rightSource: Source;
  };
  const left = resolveSnapshot(leftName, sources.leftSource);
  const right = leftName === rightName ? left : resolveSnapshot(rightName, sources.rightSource);
  const key = `${leftName}:${rightName}`;
  const hit = pairs.get(key);
  if (hit !== undefined && hit.left === left.vector.token && hit.right === right.vector.token) {
    pairs.delete(key);
    pairs.set(key, hit);
    return hit.correlation;
  }

  const correlation = pearson(left.vector.choices, right.vector.choices);
  if (users.get(leftName)?.vector.token === left.vector.token &&
      users.get(rightName)?.vector.token === right.vector.token) {
    retainPair(key, { left: left.vector.token, right: right.vector.token, correlation });
  } else {
    pairs.delete(key);
  }
  return correlation;
}
