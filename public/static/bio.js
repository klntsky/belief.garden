// public/static/bio.js

document.addEventListener('DOMContentLoaded', () => {
  const userId = window.userId;
  const authenticatedUserId = window.authenticatedUserId;
  const userInfoDiv = document.querySelector('.user-info');

  if (!userInfoDiv) {
    console.error('User info container not found.');
    return;
  }
  setupBioEditor();
  setupFollowButton();
});

function renderBio(bioText, isCurrentUser) {
  const userBioContainer = document.querySelector('.user-bio');
  if (!userBioContainer) {
    console.error('User bio container not found.');
    return;
  }

  if (isCurrentUser) {
    // Create textarea for editing
    const textarea = document.createElement('textarea');
    textarea.className = 'user-bio-textarea';
    textarea.value = bioText;
    textarea.maxLength = 1500;
    textarea.placeholder = `Add any info you want to share

Supported markdown:

# heading
## heading2
etc.

[link title](https://...)

**bold**, *italic*, ~~strikethrough~~

max. 1500 characters

Load this page in private mode to preview`;
    userBioContainer.innerHTML = ''; // Clear existing content
    userBioContainer.appendChild(textarea);

    // Auto-save after 1.5 seconds of inactivity
    let timeoutId;
    const saveIndicator = createSaveIndicator(textarea);
    textarea.addEventListener('input', () => {
      clearTimeout(timeoutId);
      saveIndicator.saving();
      timeoutId = setTimeout(async () => {
        const updatedBio = textarea.value;
        try {
          await saveBio(updatedBio);
          saveIndicator.success();
        } catch (error) {
          saveIndicator.error();
        }
      }, 1500);
    });
  } else {
    // Render bio as markdown
    const bioTextDiv = document.querySelector('.user-bio-text');
    if (bioText === '') {
      const noBioDiv = document.createElement('div');
      noBioDiv.className = 'no-bio';
      noBioDiv.textContent = 'No bio set for this user.';
      bioTextDiv.innerHTML = ''; // Clear existing content
      bioTextDiv.appendChild(noBioDiv);
      return;
    }
    if (!bioTextDiv) {
      console.error('User bio text element not found.');
      return;
    }
    const sanitizedMarkdown = DOMPurify.sanitize(bioText);
    const renderer = new marked.Renderer();
    renderer.image = () => {
      return '';
    };
    marked.setOptions({
      renderer,  // Use the custom renderer
      gfm: true,  // Enable GitHub Flavored Markdown
      breaks: true,  // Support line breaks
      sanitize: true,  // Disable auto-sanitization (if you handle sanitization elsewhere)
    });

    const htmlContent = marked.parse(sanitizedMarkdown);
    bioTextDiv.innerHTML = htmlContent;
  }
}

function saveBio(bioText) {
  if (bioText.length > 1500) {
    alert('Bio cannot exceed 1500 characters.');
    return Promise.reject(new Error('Bio cannot exceed 1500 characters.'));
  }
  return fetch(`/api/user-bio/${encodeURIComponent(window.userId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: bioText,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to save bio.');
      }
      return response;
    });
}

// Follow button functionality
async function setupFollowButton() {
  const followButton = document.getElementById('followButton');
  if (!followButton || !window.authenticatedUserId) return;

  let isFollowing = false;

  try {
    // Check if already following
    const response = await fetch(`/api/follow/${window.userId}`);
    if (!response.ok) {
      throw new Error('Failed to check follow status');
    }
    isFollowing = await response.json();

    followButton.textContent = isFollowing ? 'Unfollow' : 'Follow';
    followButton.setAttribute('data-following', isFollowing);
    followButton.style.display = 'inline-block';

    followButton.onclick = async () => {
      try {
        const method = isFollowing ? 'DELETE' : 'PUT';
        const response = await fetch(`/api/follow/${window.userId}`, {
          method,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to update follow status');
        }

        isFollowing = !isFollowing;
        followButton.textContent = isFollowing ? 'Unfollow' : 'Follow';
        followButton.setAttribute('data-following', isFollowing);
      } catch (error) {
        console.error('Error updating follow status:', error);
      }
    };
  } catch (error) {
    console.error('Error setting up follow button:', error);
    followButton.style.display = 'none';
  }
}

function setupBioEditor() {
  const isCurrentUser = window.userId === authenticatedUserId;
  // Fetch the bio
  fetch(`/api/user-bio/${encodeURIComponent(window.userId)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch bio.');
      }
      return response.text();
    })
    .then((bioText) => {
      renderBio(bioText, isCurrentUser);
    })
    .catch((error) => {
      console.error('Error fetching bio:', error);
      renderBio('', isCurrentUser); // Render empty bio if error
    });
}
