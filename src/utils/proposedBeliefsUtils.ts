// src/utils/proposedBeliefsUtils.ts
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeFileAtomic } from './fileUtils.js';
import type { ProposedBelief } from '../types/index.js';

const proposedBeliefsPath = path.join('data', 'proposed.json');
let proposalWriteChain: Promise<void> = Promise.resolve();

function serializeProposalWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = proposalWriteChain.then(operation, operation);
  proposalWriteChain = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * Get all proposed beliefs
 * @returns Array of proposed beliefs
 */
export async function getProposedBeliefs(): Promise<ProposedBelief[]> {
  try {
    await fs.access(proposedBeliefsPath);
    const data = await fs.readFile(proposedBeliefsPath, 'utf8');
    return JSON.parse(data) as ProposedBelief[];
  } catch (err) {
    const error = err as { code?: string };
    if (error.code === 'ENOENT') {
      return []; // Return empty array if file doesn't exist
    }
    throw err;
  }
}

/**
 * Save proposed beliefs
 * @param proposedBeliefs - Array of proposed beliefs to save
 */
export async function saveProposedBeliefs(proposedBeliefs: ProposedBelief[]): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.dirname(proposedBeliefsPath);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (err) {
    // Directory might already exist, ignore error
  }
  
  await writeFileAtomic(proposedBeliefsPath, JSON.stringify(proposedBeliefs, null, 2));
}

/**
 * Add a new proposed belief
 * @param proposal - The proposal object to add
 */
export async function addProposedBelief(proposal: Omit<ProposedBelief, 'timestamp' | 'id'>): Promise<void> {
  await serializeProposalWrite(async () => {
    const proposedBeliefs = await getProposedBeliefs();

    if (proposedBeliefs.some(p => p.beliefName === proposal.beliefName)) {
      throw new Error('A proposal with this name already exists');
    }

    const timestamp = Math.max(
      Date.now(),
      ...proposedBeliefs.map(existing => existing.timestamp + 1),
    );
    proposedBeliefs.push({
      beliefName: typeof proposal.beliefName === 'string' ? proposal.beliefName : String(proposal.beliefName),
      category: typeof proposal.category === 'string' ? proposal.category : String(proposal.category),
      proposedBy: typeof proposal.proposedBy === 'string' ? proposal.proposedBy : String(proposal.proposedBy),
      id: randomUUID(),
      timestamp,
      description: typeof (proposal as { description?: unknown }).description === 'string' ? (proposal as { description: string }).description : String((proposal as { description?: unknown }).description || ''),
      additionalPrompt: (proposal as { additionalPrompt?: string | null }).additionalPrompt || null,
      ...proposal
    });

    await saveProposedBeliefs(proposedBeliefs);
  });
}

/**
 * Find a proposed belief by timestamp ID
 * @param timestamp - The timestamp ID of the proposal
 * @returns The proposal object or null if not found
 */
export async function findProposedBelief(timestamp: number): Promise<ProposedBelief | null> {
  const proposedBeliefs = await getProposedBeliefs();
  return proposedBeliefs.find(p => p.timestamp === timestamp) || null;
}

/**
 * Update a proposed belief by timestamp ID
 * @param timestamp - The timestamp ID of the proposal to update
 * @param updates - The fields to update
 * @returns The updated proposal or null if not found
 */
export async function updateProposedBelief(timestamp: number, updates: Partial<ProposedBelief>): Promise<ProposedBelief | null> {
  return serializeProposalWrite(async () => {
    const proposedBeliefs = await getProposedBeliefs();
    const proposalIndex = proposedBeliefs.findIndex(p => p.timestamp === timestamp);
    const existingProposal = proposedBeliefs[proposalIndex];
    if (proposalIndex === -1 || !existingProposal) return null;

    proposedBeliefs[proposalIndex] = { ...existingProposal, ...updates };
    await saveProposedBeliefs(proposedBeliefs);
    return proposedBeliefs[proposalIndex] || null;
  });
}

/**
 * Remove a proposed belief by timestamp ID
 * @param timestamp - The timestamp ID of the proposal to remove
 * @returns The removed proposal or null if not found
 */
export async function removeProposedBelief(timestamp: number): Promise<ProposedBelief | null> {
  return serializeProposalWrite(async () => {
    const proposedBeliefs = await getProposedBeliefs();
    const proposalIndex = proposedBeliefs.findIndex(p => p.timestamp === timestamp);
    if (proposalIndex === -1) return null;

    const removedProposal = proposedBeliefs.splice(proposalIndex, 1)[0];
    if (!removedProposal) return null;
    await saveProposedBeliefs(proposedBeliefs);
    return removedProposal;
  });
}

