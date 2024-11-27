document.addEventListener('DOMContentLoaded', () => {
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
      window.location.href = '/' + window.authenticatedUserId;
    } catch (error) {
      alert(error.message);
    }
  });
});
