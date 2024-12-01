// notifications.js - Client-side notification and following functionality

let lastChecked = 0;
let notifications = [];
const checkInterval = 30000; // Check every 30 seconds
let unreadCount = 0;
const pageLoadTimestamp = Date.now();

// Local storage key for last read timestamp
const LAST_READ_KEY = 'lastNotificationRead';

function getLastReadTimestamp() {
  const stored = localStorage.getItem(LAST_READ_KEY);
  return stored ? parseInt(stored, 10) : 0;
}

function setLastReadTimestamp(timestamp) {
  localStorage.setItem(LAST_READ_KEY, timestamp.toString());
}

function updateUnreadCount() {
  const lastRead = getLastReadTimestamp();
  unreadCount = notifications.filter(n => n.timestamp > lastRead).length;
}

/**
 * Format notification timestamp
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function getNotificationMessage(notification) {
  if (notification.type === 'new_follower') {
    return `${notification.actor} is now following you`;
  } else if (notification.type === 'unfollowed') {
    return `${notification.actor} is no longer following you`;
  } else if (notification.type === 'new_comment') {
    return `${notification.actor} commented on ${notification.beliefName}`;
  } else if (notification.type === 'new_reply') {
    return `${notification.actor} replied to your comment on ${notification.beliefName} on your profile`;
  } else if (notification.type === 'self_reply') {
    return `${notification.actor} replied to a comment on ${notification.beliefName}`;
  } else if (notification.type === 'broadcast') {
    return notification.message;
  }
  return '';
}

function getNotificationURL(notification){
  if (notification.type === 'new_follower') {
    return `/${notification.actor}`;
  } else if (notification.type === 'unfollowed') {
    return `/${notification.actor}`;
  } else if (notification.type === 'new_comment') {
    return `/${notification.actor}#${notification.beliefName}`;
  } else if (notification.type === 'new_reply') {
    return `/${notification.profileName}#${notification.beliefName}`;
  } else if (notification.type === 'self_reply') {
    return `/${notification.profileName}#${notification.beliefName}`;
  } else if (notification.type === 'broadcast') {
    return notification.url;
  }
  return '';
}

/**
 * Create a notification item element
 * @param {Object} notification - Notification object
 * @returns {HTMLElement} Notification item element
 */
function createNotificationElement(notification) {
  const item = document.createElement('a');
  item.href = getNotificationURL(notification);
  item.className = 'notification-item';
  
  // Force page reload only if notification is newer than page load
  item.addEventListener('click', (e) => {
    if (notification.timestamp > pageLoadTimestamp) {
      e.preventDefault();
      window.location.href = item.href;
      window.location.reload();
    }
  });

  const message = document.createElement('div');
  message.textContent = getNotificationMessage(notification);
  item.appendChild(message);
  if (notification.type === 'broadcast') {
    message.classList.add('broadcast-message');
  }
  const time = document.createElement('div');
  time.className = 'notification-time';
  time.textContent = formatTimestamp(notification.timestamp);
  item.appendChild(time);

  return item;
}

/**
 * Update notification counter and list
 */
function updateNotificationUI() {
  const list = document.querySelector('.notifications-list');
  const counter = document.querySelector('.notification-counter');
  if (!list || !counter) return;

  // Clean up existing tippy instances
  const existingTippyElements = list.querySelectorAll('[data-tippy-root]');
  existingTippyElements.forEach(element => {
    const tippyInstance = element._tippy;
    if (tippyInstance) {
      tippyInstance.destroy();
    }
  });

  // Update notification counter
  if (unreadCount > 0) {
    counter.textContent = unreadCount;
    counter.style.display = 'inline-block';
  } else {
    counter.style.display = 'none';
  }

  // Clear existing notifications
  list.innerHTML = '';

  // Create header
  const header = document.createElement('div');
  header.className = 'notifications-header';

  // Add settings checkbox
  const settingsLabel = document.createElement('label');
  settingsLabel.className = 'notification-setting';
  settingsLabel.setAttribute('data-tippy-root', '');
  const settingsCheckbox = document.createElement('input');
  settingsCheckbox.type = 'checkbox';
  settingsCheckbox.id = 'allowAllDebates';
  settingsCheckbox.checked = window.userSettings?.allowAllDebates || false;
  settingsCheckbox.addEventListener('change', async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          allowAllDebates: settingsCheckbox.checked
        })
      });

      if (response.ok) {
        window.userSettings = await response.json();
      }
    } catch (error) {
      console.error('Failed to save setting:', error);
      settingsCheckbox.checked = !settingsCheckbox.checked; // Revert on error
    }
  });

  const settingsText = document.createElement('span');
  settingsText.textContent = 'Allow debates';
  settingsLabel.appendChild(settingsCheckbox);
  settingsLabel.appendChild(settingsText);

  // Add tooltip
  tippy(settingsLabel, {
    content: 'When enabled, debates can be started under any belief card, if there is a comment from you. When disabled, debates can only be started if you include \'debate me\' in the comment.',
    placement: 'bottom',
    theme: 'light-border',
    maxWidth: 400
  });

  header.appendChild(settingsLabel);

  // Add mark all as read button
  const markReadButton = document.createElement('button');
  markReadButton.className = 'mark-read-button';
  markReadButton.textContent = 'Mark all as read';
  markReadButton.onclick = () => {
    if (notifications.length > 0) {
      // Use the most recent notification's timestamp
      const latestTimestamp = notifications[0].timestamp;
      setLastReadTimestamp(latestTimestamp);
      unreadCount = 0;
      updateNotificationUI();
    }
  };
  header.appendChild(markReadButton);
  list.appendChild(header);

  // Add new notifications or show empty state
  if (notifications.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'notifications-empty';
    emptyMessage.textContent = 'No notifications yet';
    list.appendChild(emptyMessage);
  } else {
    // Add notifications
    notifications.forEach(notification => {
      list.appendChild(createNotificationElement(notification));
    });
  }
}

/**
 * Setup notification popup behavior
 */
function setupNotificationPopup() {
  const wrapper = document.querySelector('.user-notifications-wrapper');
  const popup = document.querySelector('.notifications-popup');
  if (!wrapper || !popup) return;

  let timeoutId = null;

  const showPopup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    popup.style.display = 'block';
    updateNotificationUI();
  };

  const hidePopup = () => {
    timeoutId = setTimeout(() => {
      popup.style.display = 'none';
    }, 300); // Add a small delay before hiding
  };

  // Show popup on hover
  wrapper.addEventListener('mouseenter', showPopup);
  wrapper.addEventListener('mouseleave', hidePopup);

  // Keep popup visible when hovering over it
  popup.addEventListener('mouseenter', showPopup);
  popup.addEventListener('mouseleave', hidePopup);

  // Make notification items clickable
  popup.addEventListener('click', (e) => {
    const notificationItem = e.target.closest('.notification-item');
    if (notificationItem) {
      // Handle notification click - can be customized based on notification type
      console.log('Notification clicked:', notificationItem);
    }
  });
}

/**
 * Check for new notifications since last check
 */
async function checkNotifications() {
  if (!window.authenticatedUserId) return;

  try {
    const lastRead = getLastReadTimestamp();
    const response = await fetch(`/api/notifications?since=${lastRead}`);
    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    notifications = await response.json();
    notifications.sort((a, b) => b.timestamp - a.timestamp);
    updateUnreadCount();
    updateNotificationUI();
  } catch (error) {
    console.error('Error fetching notifications:', error);
  }
}

/**
 * Handle new notifications
 * @param {Array} newNotifications - Array of new notification objects
 */
function handleNewNotifications(newNotifications) {
  unreadCount += newNotifications.length;
  updateNotificationUI();
}

/**
 * Start periodic notification checking
 */
async function startNotificationChecking() {
  if (!window.authenticatedUserId) return;

  try {
    // Fetch initial settings
    const settingsResponse = await fetch('/api/settings');
    if (settingsResponse.ok) {
      window.userSettings = await settingsResponse.json();
    }
  } catch (error) {
    console.error('Failed to fetch initial settings:', error);
  }

  // Initial check
  checkNotifications();

  // Set up periodic checking
  setInterval(checkNotifications, checkInterval);

  // Check notifications when tab becomes active
  window.addEventListener('focus', checkNotifications);
}

/**
 * Get all notifications
 * @returns {Array} Array of notification objects
 */
function getNotifications() {
  return notifications;
}

/**
 * Follow a user
 * @param {string} userId - User ID to follow
 * @returns {Promise<boolean>} Success status
 */
async function followUser(userId) {
  if (!window.authenticatedUserId || !userId) return false;

  try {
    const response = await fetch(`/api/follow/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Error following user:', error);
    return false;
  }
}

/**
 * Unfollow a user
 * @param {string} userId - User ID to unfollow
 * @returns {Promise<boolean>} Success status
 */
async function unfollowUser(userId) {
  if (!window.authenticatedUserId || !userId) return false;

  try {
    const response = await fetch(`/api/follow/${userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Error unfollowing user:', error);
    return false;
  }
}

/**
 * Toggle follow status for a user
 * @param {HTMLElement} button - Button element to update
 * @param {string} userId - User ID to toggle follow status for
 */
async function toggleFollow(button, userId) {
  if (!window.authenticatedUserId) {
    window.location.href = '/login';
    return;
  }

  const isFollowing = button.classList.contains('following');
  const success = isFollowing ?
    await unfollowUser(userId) :
    await followUser(userId);

  if (success) {
    button.classList.toggle('following');
    button.textContent = isFollowing ? 'Follow' : 'Following';
  }
}

// Export functions to window object
window.notifications = {
  formatTimestamp,
  handleNewNotifications,
  getNotifications,
  followUser,
  unfollowUser,
  toggleFollow
};

// Start checking for notifications if user is authenticated
if (window.authenticatedUserId) {
  startNotificationChecking();
  setupNotificationPopup();
}
