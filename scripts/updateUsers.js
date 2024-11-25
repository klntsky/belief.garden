// updateUsers.js
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

// Function to ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize required directories
ensureDir(debatesDir);
ensureDir(commentsDir);

function loadUsers() {
  const users = [];
  if (!fs.existsSync(userAccountsDir)) {
    return users;
  }

  const files = fs.readdirSync(userAccountsDir);
  files.forEach((file) => {
    try {
      if (file.endsWith('.json')) {
        const filePath = path.join(userAccountsDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const user = JSON.parse(data);
        users.push(user);
      }
    } catch (e) {
      console.log(file, e);
    }
  });

  return users;
}

function processUserComments() {
  const users = loadUsers();
  const debateRequests = {};  // Maps belief names to lists of users wanting to debate
  const allComments = {};     // Maps belief names to lists of all comments

  users.forEach((user) => {
    try {
      const username = user.username;
      const beliefsFilePath = path.join(userBeliefsDir, `${username}.json`);

      if (!fs.existsSync(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8'));

      Object.entries(beliefsData).forEach(([beliefName, belief]) => {
        if (belief.comment) {
          // Process all comments
          if (!allComments[beliefName]) {
            allComments[beliefName] = [];
          }
          allComments[beliefName].push({
            username,
            comment: belief.comment,
            timestamp: belief.commentTime || 0
          });

          // Check for debate requests
          if (belief.comment.toLowerCase().includes('debate me')) {
            if (!debateRequests[beliefName]) {
              debateRequests[beliefName] = [];
            }
            debateRequests[beliefName].push({
              username,
              comment: belief.comment,
              timestamp: belief.commentTime || 0,
              choice: belief.choice || null
            });
          }
        }
      });
    } catch (e) {
      console.log(user, e);
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

function saveCommentFiles(debateRequests, allComments) {
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

function calculateUserScores() {
  const users = loadUsers();
  const userScores = [];

  users.forEach((user) => {
    try {
      const username = user.username;
      const beliefsFilePath = path.join(userBeliefsDir, `${username}.json`);

      if (!fs.existsSync(beliefsFilePath)) {
        return;
      }

      const beliefsData = JSON.parse(fs.readFileSync(beliefsFilePath, 'utf8'));
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
      console.log(user, e);
    }
  });

  return userScores;
}

function updateUsersJson() {
  // Process comments and debate requests
  const { debateRequests, allComments } = processUserComments();
  saveCommentFiles(debateRequests, allComments);

  // Calculate and save user scores
  const userScores = calculateUserScores();

  // Sort users by score in descending order
  userScores.sort((a, b) => b.score - a.score);

  // Write to public/users.json
  fs.writeFileSync(outputFilePath, JSON.stringify(userScores.slice(0, 12), null, 2), 'utf8');
  console.log('Updated data');
}

updateUsersJson();
