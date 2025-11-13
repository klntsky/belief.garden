// src/readBeliefs.js
import fs from 'fs';
import path from 'path';
import { writeFileAtomic } from './utils/fileUtils.js';

const beliefsFilePath = './public/static/beliefs.json';

// Read beliefs.json and return its content
export function readBeliefs() {
  const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8'));
  return beliefsData;
}

// Save beliefs.json
export async function saveBeliefs(beliefsData) {
  await writeFileAtomic(beliefsFilePath, JSON.stringify(beliefsData, null, 2));
}
