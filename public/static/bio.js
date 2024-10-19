// public/static/bio.js

document.addEventListener('DOMContentLoaded', () => {
  const userId = window.userId;
  const authenticatedUserId = window.authenticatedUserId;
  const isCurrentUser = userId === authenticatedUserId;
  const userInfoDiv = document.querySelector('.user-info');

  if (!userInfoDiv) {
    console.error('User info container not found.');
    return;
  }

  // Fetch the bio
  fetch(`/api/user-bio/${encodeURIComponent(userId)}`)
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

**bold**

*italic*

~~strikethrough~~

max. 1500 characters

Load this page in private mode to preview`;
    userBioContainer.innerHTML = ''; // Clear existing content
    userBioContainer.appendChild(textarea);

    // Auto-save after 1.5 seconds of inactivity
    let timeoutId;
    textarea.addEventListener('input', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const updatedBio = textarea.value;
        saveBio(updatedBio);
      }, 1500);
    });
  } else {
    // Render bio as markdown
    const bioTextDiv = document.querySelector('.user-bio-text');
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
    return;
  }
  fetch(`/api/user-bio/${encodeURIComponent(window.userId)}`, {
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
    })
    .catch((error) => {
      console.error('Error saving bio:', error);
    });
}
