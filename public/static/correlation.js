// public/static/correlation.js

// Declare functions as global variables

// Function to map choice to numerical score
function choiceToScore(choice) {
  switch (choice) {
    case 'reject':
      return -1;
    case 'neutral':
      return 0;
    case 'support':
      return 1;
    default:
      return 0;
  }
}

// Function to calculate Pearson correlation coefficient
function pearsonCorrelation(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

// Function to fetch beliefs for a user
async function fetchUserBeliefs(userId) {
  const encodedUserId = encodeURIComponent(userId);
  const response = await fetch(`/api/user-beliefs/${encodedUserId}`);
  if (!response.ok) {
    console.error(`Failed to fetch beliefs for user: ${userId}`);
    return {};
  }
  return await response.json();
}

// Function to compute correlation between two users
async function computeCorrelationWithUser(authenticatedUserId, otherUserId) {
  const [userBeliefs, otherUserBeliefs] = await Promise.all([
    fetchUserBeliefs(authenticatedUserId),
    fetchUserBeliefs(otherUserId),
  ]);

  const beliefNames = Object.keys(userBeliefs).filter((beliefName) => {
    return (
      userBeliefs[beliefName].choice && otherUserBeliefs[beliefName]?.choice
    );
  });

  if (beliefNames.length < 5) {
    return null;
  }

  const scores1 = [];
  const scores2 = [];

  beliefNames.forEach((beliefName) => {
    scores1.push(choiceToScore(userBeliefs[beliefName].choice));
    scores2.push(choiceToScore(otherUserBeliefs[beliefName].choice));
  });

  return pearsonCorrelation(scores1, scores2);
}

// Function to get color based on correlation
function getColorForCorrelation(correlation) {
  // Correlation ranges from -1 to 1
  // Map -1 (red) to 0 (yellow) to 1 (green)
  const red = { r: 255, g: 0, b: 0 };
  const yellow = { r: 255, g: 255, b: 0 };
  const green = { r: 0, g: 128, b: 0 };

  let color;
  if (correlation < 0) {
    // Negative correlation: interpolate between red and yellow
    const factor = (correlation + 1) / 1; // Map -1 to 0, 0 to 1
    color = {
      r: red.r + factor * (yellow.r - red.r),
      g: red.g + factor * (yellow.g - red.g),
      b: red.b + factor * (yellow.b - red.b),
    };
  } else {
    // Positive correlation: interpolate between yellow and green
    const factor = correlation / 1; // Map 0 to 0, 1 to 1
    color = {
      r: yellow.r + factor * (green.r - yellow.r),
      g: yellow.g + factor * (green.g - yellow.g),
      b: yellow.b + factor * (green.b - yellow.b),
    };
  }

  // Convert to CSS rgb format
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(
    color.b
  )})`;
}

// Function to add correlation bullets to usernames
async function addCorrelationBullets() {
  const authenticatedUserId = window.authenticatedUserId;

  if (!authenticatedUserId) {
    // User is not logged in; do not compute correlations
    return;
  }

  // Process all usernames on the page
  const usernameElements = document.querySelectorAll('.username[data-username]');

  for (const element of usernameElements) {
    const otherUserId = element.getAttribute('data-username');
    // Skip if the username is the same as the logged-in user

    const correlation = await computeCorrelationWithUser(authenticatedUserId, otherUserId);

    const bullet = document.createElement('span');
    bullet.className = 'correlation-bullet';

    if (otherUserId === authenticatedUserId) {
      bullet.style.backgroundColor = 'white';
      bullet.title = '(You)';
    } else if (correlation === null) {
      // Unable to compute correlation; set bullet to grey
      bullet.style.backgroundColor = '#cccccc';
      bullet.title = 'Unable to compute correlation. Not enough data.';
    } else {
      const color = getColorForCorrelation(correlation);
      bullet.style.backgroundColor = color;
      const percentage = (correlation * 100).toFixed(2);
      bullet.title = `Correlation with ${otherUserId}: ${percentage}%`;
    }

    // Insert the bullet before the username
    element.prepend(bullet);
  }
}

// Bind the function to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  addCorrelationBullets();
});
