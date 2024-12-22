const FEED_UPDATE_INTERVAL = 10000; // 10 seconds
// MUST be synchronized with the backend in api.js:
const CHOICE_CHANGE_MERGE_FEED_ENTRIES_TIMEOUT = 300;

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
  link.classList.add('feed-belief-link');
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
    case 'chat_message':
      emoji = '💭'; // Chat message
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

function mkChoice(choice) {
  const span = document.createElement('span');
  span.textContent = choice || 'none';
  span.classList.add('feed-choice');
  span.classList.add(`feed-choice-${choice ? choice.toLowerCase() : 'none'}`);
  return span;
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
      container.appendChild(mkChoice(entry.old_choice));
      container.appendChild(document.createTextNode(' ➜ '));
      container.appendChild(mkChoice(entry.new_choice));
      break;
    }

    case 'new_comment': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(' commented on '));
      container.appendChild(createBeliefLink(entry.actor, entry.beliefName));
      if (entry.text) {
        container.appendChild(document.createTextNode(': ' + entry.text));
      }
      break;
    }

    case 'core_belief_changed': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(` ${entry.isFavorite ? 'added' : 'removed'} `));
      container.appendChild(createBeliefLink(entry.actor, entry.beliefName));
      container.appendChild(document.createTextNode(` ${entry.isFavorite ? 'to' : 'from'} core beliefs`));
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
      container.appendChild(createBeliefLink(entry.profileName, entry.beliefName));
      container.appendChild(document.createTextNode(' on '));
      container.appendChild(createUserLink(entry.profileName));
      container.appendChild(document.createTextNode('\'s profile'));
      if (entry.text) {
        container.appendChild(document.createTextNode(': ' + entry.text));
      }
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

    case 'chat_message': {
      container.appendChild(actor);
      container.appendChild(document.createTextNode(": " + entry.message));
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

// TODO: fix this mess. Make the algo for filtering completely stateless
function createFeedEntry(entry) {
  const div = document.createElement('div');
  div.className = 'feed-entry';

  if (entry.type === 'new_comment') {
    const elements = document.querySelectorAll('[data-new-comment-belief-name]');
    elements.forEach(element => {
      if (
        element.getAttribute('data-new-comment-belief-name') == entry.beliefName &&
          element.getAttribute('data-new-comment-actor') == entry.actor
      ) {
        element.remove();
      }
    });
    div.setAttribute('data-new-comment-belief-name', entry.beliefName);
    div.setAttribute('data-new-comment-actor', entry.actor);
    if (entry.text === '') {
      return document.createTextNode('');
    }
  }

  if (entry.type === 'choice_changed') {
    const elements = document.querySelectorAll('[data-choice-changed-belief-name]');
    elements.forEach(element => {
      if (
        element.getAttribute('data-choice-changed-belief-name') == entry.beliefName &&
          element.getAttribute('data-choice-changed-actor') == entry.actor &&
          parseInt(element.getAttribute('data-choice-changed-timestamp')) > entry.timestamp - CHOICE_CHANGE_MERGE_FEED_ENTRIES_TIMEOUT
      ) {
        element.remove();
      }
    });
    if (entry.old_choice == entry.new_choice) {
      return document.createTextNode('');
    }

    div.setAttribute('data-choice-changed-belief-name', entry.beliefName);
    div.setAttribute('data-choice-changed-actor', entry.actor);
    div.setAttribute('data-choice-changed-timestamp', entry.timestamp);
  }

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

function groupFeedByUsers(feed) {
  // group feed entries into arrays by user.
  let currentGroup = [];
  const standaloneMessages = ['new_user_joined', 'chat_message'];
  const res = [];
  for (let i = 0; i < feed.length; i++) {
    const entry = feed[i];
    if (standaloneMessages.includes(entry.type)) {
      res.push([entry]);
      continue;
    } else {
      currentGroup.push(entry);
    }
    while (i + 1 < feed.length && entry.actor === feed[i + 1].actor) {
      if (standaloneMessages.includes(feed[i + 1].type)) {
        res.push(currentGroup);
        currentGroup = [];
        break;
      }
      i++;
      currentGroup.push(feed[i]);
    }
    if (currentGroup.length > 0) {
      res.push(currentGroup);
    }
    currentGroup = [];
  }
  return res;
}

const filterDummyEntries = feed => feed.filter(entry => {
  if (entry.type === 'new_comment' && entry.text == '') return false;
  if (entry.type === 'choice_changed' && entry.old_choice == entry.new_choice) return false;
  return true;
});

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

    const groups = groupFeedByUsers(feed);

    groups.forEach(group => {
      const groupLength = filterDummyEntries(group).length;

      // Add new entries
      if (groupLength <= 4) {
        group.forEach(entry => {
          feedContainer.insertBefore(createFeedEntry(entry), feedContainer.firstChild);
        });
      } else {
        const groupEl = document.createElement('div');
        groupEl.classList.add('feed-group');
        groupEl.classList.add('feed-group-collapsed');
        feedContainer.insertBefore(groupEl, feedContainer.firstChild);
        group.forEach(entry => {
          groupEl.insertBefore(createFeedEntry(entry), groupEl.firstChild);
        });
        const expandEl = document.createElement('div');
        expandEl.classList.add('expand-group');
        expandEl.appendChild(document.createTextNode(
          'show ' + (groupLength - 4) + ' more by '
        ));
        expandEl.appendChild(createUserLink(group[0].actor));
        groupEl.appendChild(expandEl);
        expandEl.addEventListener('click', () => {
          groupEl.classList.remove('feed-group-collapsed');
          expandEl.remove();
        });
      }
    });

  } catch (error) {
    console.error('Error updating feed:', error);
  } finally {
    updateInProgress = false;
  }
  addCorrelationBullets();
}

// Update feed on page load
document.addEventListener('DOMContentLoaded', () => {
  updateFeed();

  const chatInput = document.getElementById('chat-input');
  const chatSendButton = document.getElementById('chat-send');

  if (chatInput && chatSendButton) {
    async function sendChatMessage() {
      const message = chatInput.value.trim();
      if (!message) return;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message })
        });

        if (!response.ok) {
          const data = await response.json();
          if (response.status === 429) {
            Toastify({
              text: `Please wait ${data.timeUntilNext} seconds before sending another message`,
              duration: 3000,
              gravity: "top",
              position: "center",
              style: {
                background: "#ef4444",
              },
            }).showToast();
          } else {
            Toastify({
              text: data.error || 'Failed to send message',
              duration: 3000,
              gravity: "top",
              position: "center",
              style: {
                background: "#ef4444",
              },
            }).showToast();
          }
          return;
        }

        chatInput.value = '';
        updateFeed();
      } catch (error) {
        console.error('Error sending message:', error);
        Toastify({
          text: 'Failed to send message. Please try again.',
          duration: 3000,
          gravity: "top",
          position: "center",
          style: {
            background: "#ef4444",
          },
        }).showToast();
      }
    }

    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    });

    chatSendButton.addEventListener('click', sendChatMessage);
  }
});

// Update feed periodically
setInterval(updateFeed, FEED_UPDATE_INTERVAL);

// Update feed when window gains focus
window.addEventListener('focus', updateFeed);
