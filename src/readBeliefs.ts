// src/readBeliefs.ts
import fs from 'fs';
import { writeFileAtomic } from './utils/fileUtils.js';
import type { BeliefData } from './types/index.js';

const beliefsFilePath = './data/beliefs.json';

// Read beliefs.json and return its content
export function readBeliefs(): BeliefData {
  const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8')) as BeliefData;
  return beliefsData;
}

// Save beliefs.json
export async function saveBeliefs(beliefsData: BeliefData): Promise<void> {
  await writeFileAtomic(beliefsFilePath, JSON.stringify(beliefsData, null, 2));
}

