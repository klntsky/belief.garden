async function loadBans() {
  try {
    const response = await fetch('/api/bans');
    if (!response.ok) {
      throw new Error('Failed to load bans');
    }
    const bans = await response.json();
    
    const bansList = document.getElementById('bans-list');
    bansList.innerHTML = '';
    
    if (bans.length === 0) {
      bansList.innerHTML = '<p>No active bans</p>';
      return;
    }

    bans.forEach(ban => {
      const banItem = document.createElement('div');
      banItem.className = 'ban-item';
      
      const username = document.createElement('span');
      username.textContent = ban.username;
      
      const unbanLink = document.createElement('a');
      unbanLink.href = '#';
      unbanLink.className = 'unban-link';
      unbanLink.textContent = 'Unban';
      unbanLink.onclick = async (e) => {
        e.preventDefault();
        if (confirm(`Are you sure you want to unban ${ban.username}?`)) {
          try {
            const response = await fetch('/api/unban-user', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                bannedUser: ban.username
              })
            });

            if (!response.ok) {
              throw new Error('Failed to unban user');
            }

            loadBans(); // Reload the bans list
          } catch (error) {
            alert(error.message);
          }
        }
      };
      
      banItem.appendChild(username);
      banItem.appendChild(unbanLink);
      bansList.appendChild(banItem);
    });
  } catch (error) {
    console.error('Error loading bans:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Load current bans
  loadBans();

  // Get username from URL parameter if present
  const params = new URLSearchParams(window.location.search);
  const username = params.get('user');
  if (username) {
    document.getElementById('username').value = username;
  }

  document.getElementById('banForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const deleteReplies = document.getElementById('deleteReplies').checked;

    try {
      const response = await fetch('/api/ban-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bannedUser: username,
          deleteReplies
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to ban user');
      }

      alert('User has been banned successfully');
      document.getElementById('username').value = '';
      document.getElementById('deleteReplies').checked = false;
      loadBans(); // Reload the bans list
    } catch (error) {
      alert(error.message);
    }
  });
});
