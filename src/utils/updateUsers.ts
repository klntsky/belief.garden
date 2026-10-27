// src/utils/updateUsers.ts
import path from 'path';
import { resolveContainedFile, UnsafePathError } from './fileUtils.js';
import { deleteRecord, hasRecord, listRecords, readRecord, transaction, writeRecord } from '../storage.js';

// Define directories and constants
const userAccountsDir = path.join('data', 'accounts');
const userBeliefsDir = path.join('data', 'users');
const debatesDir = path.join('data', 'debates');
const commentsDir = path.join('data', 'comments');
const outputFilePath = path.join('public', 'users.json');

// Define scoring values
const beliefScore = 1;   // Points awarded for each belief choice
const commentScore = 20;  // Points awarded for each belief comment

interface User {
  username: string;
  [key: string]: unknown;
}

interface Belief {
  comment?: string;
  commentTime?: number;
  choice?: string;
  [key: string]: unknown;
}

interface UserBeliefs {
  [beliefName: string]: Belief;
}

interface Comment {
  username: string;
  comment: string;
  timestamp: number;
}

interface DebateRequest extends Comment {
  choice: string | null;
}

interface UserScore {
  username: string;
  score: number;
}

function loadUsers(): User[] {
  const users: User[] = [];
  const files = listRecords(userAccountsDir);
  files.forEach((file) => {
    try {
      if (file.endsWith('.json')) {
        const filePath = path.join(userAccountsDir, file);
        const data = readRecord(filePath);
        const user = JSON.parse(data) as User;
        users.push(user);
      }
    } catch (e) {
      console.log('Error loading user:', file, e);
    }
  });

  return users;
}

function processUserComments(): { debateRequests: Record<string, DebateRequest[]>; allComments: Record<string, Comment[]> } {
  const users = loadUsers();
  const debateRequests: Record<string, DebateRequest[]> = {};  // Maps belief names to lists of users wanting to debate
  const allComments: Record<string, Comment[]> = {};     // Maps belief names to lists of all comments

  users.forEach((user) => {
    try {
      const username = user.username;
      const beliefsFilePath = path.join(userBeliefsDir, `${username}.json`);

      if (!hasRecord(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(readRecord(beliefsFilePath)) as UserBeliefs;

      Object.entries(beliefsData).forEach(([beliefName, belief]) => {
        if (belief.comment) {
          // Process all comments
          if (!allComments[beliefName]) {
            allComments[beliefName] = [];
          }
          allComments[beliefName].push({
            username,
            comment: typeof belief.comment === 'string' ? belief.comment : String(belief.comment),
            timestamp: belief.commentTime || 0
          });

          // Check for debate requests
          const commentText = typeof belief.comment === 'string' ? belief.comment : String(belief.comment);
          if (commentText.toLowerCase().includes('debate me')) {
            if (!debateRequests[beliefName]) {
              debateRequests[beliefName] = [];
            }
            debateRequests[beliefName].push({
              username,
              comment: commentText,
              timestamp: belief.commentTime || 0,
              choice: (belief.choice as string | null) || null
            });
          }
        }
      });
    } catch (e) {
      console.log('Error processing user:', user, e);
    }
  });

  // Sort comments by length
  Object.values(debateRequests).forEach(list => {
    list.sort((a, b) => b.comment.length - a.comment.length);
  });
  Object.values(allComments).forEach(list => {
    list.sort((a, b) => b.comment.length - a.comment.length);
  });

  return { debateRequests, allComments };
}

function saveCommentFiles(debateRequests: Record<string, DebateRequest[]>, allComments: Record<string, Comment[]>): void {
  const replaceCache = <T>(directory: string, entries: Record<string, T[]>): void => {
    const expectedFiles = new Set<string>();
    Object.entries(entries).forEach(([beliefName, values]) => {
      const fileName = `${beliefName}.json`;
      try {
        const filePath = resolveContainedFile(directory, fileName);
        expectedFiles.add(fileName);
        writeRecord(filePath, JSON.stringify(values, null, 2));
      } catch (error) {
        if (!(error instanceof UnsafePathError)) throw error;
        console.error(`Skipping unsafe belief cache name: ${beliefName}`);
      }
    });

    for (const fileName of listRecords(directory)) {
      if (fileName.endsWith('.json') && !expectedFiles.has(fileName)) {
        deleteRecord(path.join(directory, fileName));
      }
    }
  };

  replaceCache(debatesDir, debateRequests);
  replaceCache(commentsDir, allComments);
}

function calculateUserScores(): UserScore[] {
  const users = loadUsers();
  const userScores: UserScore[] = [];

  users.forEach((user) => {
    try {
      const username = user.username;
      const beliefsFilePath = path.join(userBeliefsDir, `${username}.json`);

      if (!hasRecord(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(readRecord(beliefsFilePath)) as UserBeliefs;
      let score = 0;

      Object.values(beliefsData).forEach((belief) => {
        if (belief.choice) {
          score += beliefScore;
        }
        if (belief.comment) {
          score += commentScore;
        }
      });

      userScores.push({ username, score });
    } catch (e) {
      console.log('Error calculating score for user:', user, e);
    }
  });

  return userScores;
}

/**
 * Update user statistics: process comments, debate requests, and calculate scores
 */
export function updateUsersJson(): void {
  try {
    transaction(() => {
      const { debateRequests, allComments } = processUserComments();
      saveCommentFiles(debateRequests, allComments);

      const userScores = calculateUserScores();
      userScores.sort((a, b) => b.score - a.score);
      writeRecord(outputFilePath, JSON.stringify(userScores.slice(0, 12), null, 2));
    });
    console.log('Updated user statistics');
  } catch (error) {
    console.error('Error updating user statistics:', error);
  }
}

