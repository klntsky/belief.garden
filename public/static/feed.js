const FEED_UPDATE_INTERVAL = 10000; // 10 seconds

// Track the timestamp of the most recent entry we've seen
let lastSeenTimestamp = 0;
let updateInProgress = false;

function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

function createUserLink(username) {
  const link = document.createElement('a');
  link.href = `/${username}`;
  link.textContent = username;
  link.classList.add('feed-username-label');
  link.classList.add('username');
  link.setAttribute('data-username', username);
  return link;
}

function createBeliefLink(username, beliefName) {
  const link = document.createElement('a');
  link.href = `/${username}#${beliefName}`;
  link.textContent = beliefName;
  return link;
}

function createTypeIndicator(type) {
  const indicator = document.createElement('div');
  indicator.className = 'feed-type-indicator';

  let emoji;
  switch (type) {
    case 'choice_changed':
      emoji = '💡'; // Changed opinion
      break;
    case 'new_comment':
      emoji = '💬'; // Comment bubble
      break;
    case 'core_belief_changed':
      emoji = '⭐'; // Star for core belief
      break;
    case 'bio_updated':
      emoji = '✏️'; // Pencil for edit
      break;
    case 'new_reply':
      emoji = '💬'; // Reply arrow
      break;
    case 'followed_user':
      emoji = '👋'; // Wave for following
      break;
    case 'unfollowed_user':
      emoji = '💔'; // Broken heart for unfollowing
      break;
    case 'chat_msg':
      emoji = '💬'; // Speech bubble
      break;
    case 'new_user_joined':
      emoji = '🌱'; // Sprout for new user
      break;
    default:
      emoji = '❔'; // Question mark for unknown
  }

  indicator.textContent = emoji;
  return indicator;
}

function getActionElements(entry) {
  const container = document.createElement('span');
  const actor = createUserLink(entry.actor);

  switch (entry.type) {
    case 'choice_changed': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' changed opinion on '));
      container.appendChild(createBeliefLink(entry.actor, entry.beliefName));
      container.appendChild(document.createTextNode(': '));
      container.appendChild(document.createTextNode(entry.old_choice || 'none'));
      container.appendChild(document.createTextNode(' ➜ '));
      container.appendChild(document.createTextNode(entry.new_choice || 'none'));
      break;
    }

    case 'new_comment': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' commented on '));
      container.appendChild(createBeliefLink(entry.actor, entry.beliefName));
      break;
    }

    case 'core_belief_changed': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(` ${entry.isFavorite ? 'marked' : 'unmarked'} `));
      container.appendChild(createBeliefLink(entry.actor, entry.beliefName));
      container.appendChild(document.createTextNode(' as a core belief'));
      break;
    }

    case 'bio_updated': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' updated their bio'));
      break;
    }

    case 'new_reply': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' replied to a comment on '));
      const profileLink = createUserLink(entry.profileName);
      container.appendChild(profileLink);
      container.appendChild(document.createTextNode('\'s belief "'));
      container.appendChild(createBeliefLink(entry.profileName, entry.beliefName));
      container.appendChild(document.createTextNode('"'));
      break;
    }

    case 'followed_user': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' started following '));
      const targetUser = createUserLink(entry.user);
      container.appendChild(targetUser);
      break;
    }

    case 'unfollowed_user': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' unfollowed '));
      const targetUser = createUserLink(entry.user);
      container.appendChild(targetUser);
      break;
    }

    case 'chat_msg': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(": " + entry.text));
      break;
    }

    case 'new_user_joined': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' joined belief.garden'));
      break;
    }

    default: {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' unknown action'));
    }
  }

  return container;
}

function createFeedEntry(entry) {
  const div = document.createElement('div');
  div.className = 'feed-entry';

  const typeIndicator = createTypeIndicator(entry.type);
  div.appendChild(typeIndicator);

  const timestamp = document.createElement('div');
  timestamp.className = 'feed-timestamp';
  timestamp.textContent = formatTimestamp(entry.timestamp * 1000);

  const action = document.createElement('div');
  action.className = 'feed-action';
  action.appendChild(getActionElements(entry));

  div.appendChild(timestamp);
  div.appendChild(action);

  return div;
}

async function updateFeed() {
  if (updateInProgress) return;
  updateInProgress = true;

  try {
    const response = await fetch(`/api/feed?since=${lastSeenTimestamp}`);
    if (!response.ok) throw new Error('Failed to fetch feed');

    const feed = (await response.json()).reverse();
    if (!feed || !feed.length) return;

    const feedContainer = document.getElementById('feed-container');

    // Update timestamp for next fetch
    lastSeenTimestamp = Math.max(...feed.map(entry => entry.timestamp));

    // Add new entries
    feed.forEach(entry => {
      feedContainer.insertBefore(createFeedEntry(entry), feedContainer.firstChild);
    });
    addCorrelationBullets();
  } catch (error) {
    console.error('Error updating feed:', error);
  } finally {
    updateInProgress = false;
  }
}

// Update feed on page load
document.addEventListener('DOMContentLoaded', () => {
  updateFeed();
});

// Update feed periodically
setInterval(updateFeed, FEED_UPDATE_INTERVAL);

// Update feed when window gains focus
window.addEventListener('focus', updateFeed);
