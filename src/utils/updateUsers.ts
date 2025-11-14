// src/utils/updateUsers.ts
import fs from 'fs';
import path from 'path';

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

// Function to ensure directory exists
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize required directories
ensureDir(debatesDir);
ensureDir(commentsDir);

function loadUsers(): User[] {
  const users: User[] = [];
  if (!fs.existsSync(userAccountsDir)) {
    return users;
  }

  const files = fs.readdirSync(userAccountsDir);
  files.forEach((file) => {
    try {
      if (file.endsWith('.json')) {
        const filePath = path.join(userAccountsDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
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

      if (!fs.existsSync(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8')) as UserBeliefs;

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
  // Save debate requests
  Object.entries(debateRequests).forEach(([beliefName, debates]) => {
    const fileName = `${beliefName}.json`;
    const filePath = path.join(debatesDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(debates, null, 2), 'utf8');
  });

  // Save all comments
  Object.entries(allComments).forEach(([beliefName, comments]) => {
    const fileName = `${beliefName}.json`;
    const filePath = path.join(commentsDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(comments, null, 2), 'utf8');
  });
}

function calculateUserScores(): UserScore[] {
  const users = loadUsers();
  const userScores: UserScore[] = [];

  users.forEach((user) => {
    try {
      const username = user.username;
      const beliefsFilePath = path.join(userBeliefsDir, `${username}.json`);

      if (!fs.existsSync(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8')) as UserBeliefs;
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
    // Process comments and debate requests
    const { debateRequests, allComments } = processUserComments();
    saveCommentFiles(debateRequests, allComments);

    // Calculate and save user scores
    const userScores = calculateUserScores();

    // Sort users by score in descending order
    userScores.sort((a, b) => b.score - a.score);

    // Write to public/users.json
    fs.writeFileSync(outputFilePath, JSON.stringify(userScores.slice(0, 12), null, 2), 'utf8');
    console.log('Updated user statistics');
  } catch (error) {
    console.error('Error updating user statistics:', error);
  }
}

