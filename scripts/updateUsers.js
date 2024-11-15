// updateUsers.js
import fs from 'fs';
import path from 'path';

// Define directories and constants
const userAccountsDir = path.join('data', 'accounts');
const userBeliefsDir = path.join('data', 'users');
const outputFilePath = path.join('public', 'users.json');

// Define scoring values
const beliefScore = 1;   // Points awarded for each belief choice
const commentScore = 20;  // Points awarded for each belief comment

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
  const userScores = calculateUserScores();

  // Sort users by score in descending order
  userScores.sort((a, b) => b.score - a.score);

  // Write to public/users.json
  fs.writeFileSync(outputFilePath, JSON.stringify(userScores.slice(0, 12), null, 2), 'utf8');
  console.log('Updated users.json with top users.');
}

updateUsersJson();
