// src/readBeliefs.js
import fs from 'fs';
import path from 'path';

// Read beliefs.json and return its content
export function readBeliefs() {
  const beliefsFilePath = './public/static/beliefs.json';
  const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8'));
  return beliefsData;
}
