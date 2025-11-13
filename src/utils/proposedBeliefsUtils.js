// src/utils/proposedBeliefsUtils.js
import fs from 'fs/promises';
import path from 'path';
import { writeFileAtomic } from './fileUtils.js';

const proposedBeliefsPath = path.join('data', 'proposed.json');

/**
 * Get all proposed beliefs
 * @returns {Promise<Array>} - Array of proposed beliefs
 */
export async function getProposedBeliefs() {
  try {
    await fs.access(proposedBeliefsPath);
    const data = await fs.readFile(proposedBeliefsPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // Return empty array if file doesn't exist
    }
    throw err;
  }
}

/**
 * Save proposed beliefs
 * @param {Array} proposedBeliefs - Array of proposed beliefs to save
 * @returns {Promise<void>}
 */
export async function saveProposedBeliefs(proposedBeliefs) {
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
 * @param {Object} proposal - The proposal object to add
 * @returns {Promise<void>}
 */
export async function addProposedBelief(proposal) {
  const proposedBeliefs = await getProposedBeliefs();
  
  // Check if a proposal with the same name already exists
  if (proposedBeliefs.some(p => p.name === proposal.name)) {
    throw new Error('A proposal with this name already exists');
  }
  
  proposedBeliefs.push({
    ...proposal,
    timestamp: Date.now()
  });
  
  await saveProposedBeliefs(proposedBeliefs);
}

/**
 * Find a proposed belief by timestamp ID
 * @param {number} timestamp - The timestamp ID of the proposal
 * @returns {Promise<Object|null>} - The proposal object or null if not found
 */
export async function findProposedBelief(timestamp) {
  const proposedBeliefs = await getProposedBeliefs();
  return proposedBeliefs.find(p => p.timestamp === timestamp) || null;
}

/**
 * Update a proposed belief by timestamp ID
 * @param {number} timestamp - The timestamp ID of the proposal to update
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object|null>} - The updated proposal or null if not found
 */
export async function updateProposedBelief(timestamp, updates) {
  const proposedBeliefs = await getProposedBeliefs();
  const proposalIndex = proposedBeliefs.findIndex(p => p.timestamp === timestamp);
  
  if (proposalIndex === -1) {
    return null;
  }
  
  // Update the proposal
  proposedBeliefs[proposalIndex] = {
    ...proposedBeliefs[proposalIndex],
    ...updates
  };
  
  await saveProposedBeliefs(proposedBeliefs);
  return proposedBeliefs[proposalIndex];
}

/**
 * Remove a proposed belief by timestamp ID
 * @param {number} timestamp - The timestamp ID of the proposal to remove
 * @returns {Promise<Object|null>} - The removed proposal or null if not found
 */
export async function removeProposedBelief(timestamp) {
  const proposedBeliefs = await getProposedBeliefs();
  const proposalIndex = proposedBeliefs.findIndex(p => p.timestamp === timestamp);
  
  if (proposalIndex === -1) {
    return null;
  }
  
  const removedProposal = proposedBeliefs.splice(proposalIndex, 1)[0];
  await saveProposedBeliefs(proposedBeliefs);
  return removedProposal;
}

