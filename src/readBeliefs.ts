// src/readBeliefs.ts
import { readRecord, writeRecord } from './storage.js';
import type { BeliefData } from './types/index.js';

const beliefsFilePath = './data/beliefs.json';

// Read beliefs.json and return its content
export function readBeliefs(): BeliefData {
  try {
    return JSON.parse(readRecord(beliefsFilePath)) as BeliefData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

// Save beliefs.json
export async function saveBeliefs(beliefsData: BeliefData): Promise<void> {
  writeRecord(beliefsFilePath, JSON.stringify(beliefsData, null, 2));
}

