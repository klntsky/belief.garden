import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import {
  addProposedBelief,
  getProposedBeliefs,
} from '../src/utils/proposedBeliefsUtils.js';

test('concurrent proposals are serialized without lost updates', async () => {
  const proposedPath = 'data/proposed.json';
  const original = await fs.readFile(proposedPath, 'utf8').catch(() => '[]');
  const prefix = `Concurrent ${Date.now()}`;

  try {
    await Promise.all(Array.from({ length: 10 }, (_, index) => addProposedBelief({
      beliefName: `${prefix} ${index}`,
      category: 'Software',
      proposedBy: 'testuser',
      description: `Proposal ${index}`,
      additionalPrompt: null,
    })));

    const proposals = (await getProposedBeliefs())
      .filter(proposal => proposal.beliefName.startsWith(prefix));
    expect(proposals).toHaveLength(10);
    expect(new Set(proposals.map(proposal => proposal.id)).size).toBe(10);
    expect(new Set(proposals.map(proposal => proposal.timestamp)).size).toBe(10);
  } finally {
    await fs.writeFile(proposedPath, original);
  }
});
