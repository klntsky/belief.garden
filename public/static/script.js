// public/static/script.js

window.isMobile = window.innerWidth < 800;

async function fetchBeliefs() {
  const beliefsResponse = await fetch('/static/beliefs.json');
  const beliefsData = await beliefsResponse.json();
  return beliefsData;
}

async function fetchUserBeliefs(userId) {
  const encodedUserId = encodeURIComponent(userId);
  const userBeliefsResponse = await fetch(`/api/user-beliefs/${encodedUserId}`);
  if (!userBeliefsResponse.ok) {
    console.error('Failed to fetch user beliefs.');
    return {};
  }
  const userBeliefsData = await userBeliefsResponse.json();
  return userBeliefsData;
}

async function saveUserBelief(userId, beliefName, beliefData) {
  if (userId !== window.authenticatedUserId) {
    console.warn('Cannot save beliefs for another user.');
    return;
  }
  const encodedUserId = encodeURIComponent(userId);
  const response = await fetch(
    `/api/user-beliefs/${encodedUserId}/${encodeURIComponent(beliefName)}`,
    {
      method: 'PUT', // Use PUT for updating a specific belief
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(beliefData),
    }
  );
  if (!response.ok) {
    const errorData = await response.json();
    console.error('Failed to save user belief:', errorData.error);
    showError(errorData.error);
  } else {
    console.log('User belief saved successfully.');
  }
}

function toggleFavorite(beliefName, starElement) {
  const userId = window.userId;
  if (userId !== window.authenticatedUserId) {
    console.warn('Cannot modify Core Beliefs for another user.');
    return;
  }

  fetch(
    `/api/user-favorites/${encodeURIComponent(userId)}/${encodeURIComponent(
      beliefName
    )}`,
    {
      method: 'POST',
    }
  )
    .then((response) =>
      response.json().then((data) => ({ status: response.status, data }))
    )
    .then(({ status, data }) => {
      if (status === 200) {
        if (data.isFavorite) {
          starElement.classList.add('active');
          starElement.title = 'Remove from Core Beliefs';
        } else {
          starElement.classList.remove('active');
          starElement.title = 'Add to Core Beliefs';
        }
        // Re-fetch the pie chart after updating favorites
        refreshPieChart();
      } else {
        showError(data.error);
      }
    })
    .catch((error) => {
      console.error('Error updating favorite status:', error);
      showError('Failed to update favorite status');
    });
}

function createBeliefOption(belief, userChoice, onChange, readOnly, profileUserId, settings) {
  const beliefDiv = createBeliefDiv(belief);

  const overlayDiv = createOverlayDiv();

  const titleContainer = createTitleContainer(belief, userChoice, readOnly, profileUserId);
  overlayDiv.appendChild(titleContainer);

  const descriptionContainer = createDescriptionContainer(belief);
  overlayDiv.appendChild(descriptionContainer);

  const buttonsDiv = createButtonsDiv(belief, userChoice, onChange, readOnly, profileUserId);
  if (!buttonsDiv) {
    return null; // Skip rendering if conditions are not met
  }
  overlayDiv.appendChild(buttonsDiv);

  const commentSection = createCommentSection(belief, userChoice, onChange, readOnly, profileUserId, settings);
  if (commentSection) {
    overlayDiv.appendChild(commentSection);
  }

  beliefDiv.appendChild(overlayDiv);

  return beliefDiv;
}

// Function to create the main belief div
function createBeliefDiv(belief) {
  const beliefDiv = document.createElement('div');
  beliefDiv.className = 'belief';
  beliefDiv.setAttribute('data-belief-name', belief.name);
  return beliefDiv;
}

// Function to create the overlay div
function createOverlayDiv() {
  const overlayDiv = document.createElement('div');
  overlayDiv.className = 'belief-overlay';
  return overlayDiv;
}

// Function to create the title container
function createTitleContainer(belief, userChoice, readOnly, profileUserId) {
  const titleContainer = document.createElement('div');
  titleContainer.className = 'belief-title-container';

  const title = document.createElement('h3');
  const isFavorite = userChoice && typeof userChoice.preference === 'number';

  if (!readOnly || isFavorite) {
    const favoriteStar = document.createElement('span');
    favoriteStar.className = 'favorite-star';
    favoriteStar.textContent = '★';
    if (!readOnly) {
      favoriteStar.title = isFavorite ? 'Remove from Core Beliefs' : 'Add to Core Beliefs (the piechart)';
      favoriteStar.addEventListener('click', () => {
        toggleFavorite(belief.name, favoriteStar);
      });
    } else {
      favoriteStar.title = isFavorite ? `${profileUserId} marked this statement as a Core Belief` : '';
    }
    if (isFavorite) {
      favoriteStar.classList.add('active');
    }

    title.appendChild(favoriteStar);
  }

  title.appendChild(document.createTextNode(belief.name));
  titleContainer.appendChild(title);

  return titleContainer;
}

// Function to create the description container
function createDescriptionContainer(belief) {
  const descriptionContainer = document.createElement('p');
  const description = document.createElement('span');
  description.textContent = belief.description;
  description.classList.add('blur');
  descriptionContainer.appendChild(description);
  return descriptionContainer;
}

// Function to set button tooltip based on viewer's belief
function setButtonTitleForViewer(buttonsDiv, belief, userChoice, profileUserId) {
  if (window.authenticatedUserId && window.authenticatedUserId !== profileUserId) {
    const viewerBelief = window.viewerBeliefs[belief.name];
    if (viewerBelief && viewerBelief.choice) {
      const viewerChoice = viewerBelief.choice;
      if (viewerChoice !== userChoice?.choice) {
        if (viewerChoice === 'neutral') {
          tippy(buttonsDiv, {
            content: `You are neutral towards ${belief.name}`,
            placement: 'top',
            theme: 'light'
          });
        } else {
          tippy(buttonsDiv, {
            content: `You ${viewerChoice} ${belief.name}`,
            placement: 'top',
            theme: 'light'
          });
        }
      } else {
        tippy(buttonsDiv, {
          content: 'You have the same choice',
          placement: 'top',
          theme: 'light'
        });
      }
    } else {
      tippy(buttonsDiv, {
        content: 'You have not made a choice',
        placement: 'top',
        theme: 'light'
      });
    }
  }
}

// Function to create a single choice button
function createChoiceButton(choice, isSelected, readOnly, onClick) {
  const button = document.createElement('button');
  button.textContent = choice.charAt(0).toUpperCase() + choice.slice(1);
  button.className = `choice-button ${choice}${isSelected ? ' selected' : ''}`;

  if (!readOnly) {
    button.addEventListener('click', async () => {
      const isCurrentlySelected = button.classList.contains('selected');
      const buttonsDiv = button.parentElement;
      const siblingButtons = buttonsDiv.querySelectorAll('.choice-button');

      siblingButtons.forEach(btn => btn.classList.remove('selected'));
      buttonsDiv.classList.remove('has-selection');

      if (!isCurrentlySelected) {
        button.classList.add('selected');
        buttonsDiv.classList.add('has-selection');
        await onClick(choice);
      } else {
        await onClick(null);
      }
    });
  } else {
    button.disabled = true;
  }

  return button;
}

// Function to create the buttons div
function createButtonsDiv(belief, userChoice, onChange, readOnly, profileUserId) {
  // Skip rendering if no interaction in readonly mode
  if (readOnly && !userChoice?.choice && !userChoice?.comment) {
    return null;
  }

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'choice-buttons';

  // Add has-selection class if there's an initial selection
  if (userChoice?.choice) {
    buttonsDiv.classList.add('has-selection');
  }

  setButtonTitleForViewer(buttonsDiv, belief, userChoice, profileUserId);

  // Handle read-only view with no choice but has comment
  if (readOnly && !userChoice?.choice && userChoice?.comment) {
    const button = document.createElement('button');
    button.textContent = 'No choice';
    button.className = 'choice-button no-choice selected';
    button.disabled = true;
    buttonsDiv.appendChild(button);
    return buttonsDiv;
  }

  const choices = ['reject', 'neutral', 'support'];

  choices.forEach(choice => {
    const isSelected = userChoice?.choice === choice;
    const button = createChoiceButton(
      choice,
      isSelected,
      readOnly,
      (choice) => {
        if (onChange) {
          onChange(choice, undefined);
        }
      }
    );
    buttonsDiv.appendChild(button);
  });

  return buttonsDiv;
}

// Function to create replies container
function createRepliesContainer(userChoice, profileUserId, belief) {
  const repliesContainer = document.createElement('div');
  repliesContainer.className = 'replies-container';
  repliesContainer.style.display = 'none';

  if (userChoice?.replies?.length > 0) {
    userChoice.replies.forEach(reply => {
      const replyDiv = createReplyElement(reply, profileUserId, belief);
      repliesContainer.appendChild(replyDiv);
    });
  }

  return repliesContainer;
}

// Function to create a reply element
function createReplyElement(reply, profileUserId, belief) {
  const replyDiv = document.createElement('div');
  replyDiv.className = 'reply-display';

  const replyUsername = document.createElement('span');
  replyUsername.className = 'username-label';
  replyUsername.textContent = `${reply.username}: `;
  tippy(replyUsername, {
    content: formatTimestamp(reply.timestamp),
    placement: 'top'
  });

  const replyText = document.createElement('span');
  replyText.textContent = reply.comment;

  // Add delete button if user is authorized
  if (window.authenticatedUserId &&
      (window.authenticatedUserId === profileUserId ||
       window.authenticatedUserId === reply.username)) {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-reply';
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete reply';
    deleteButton.onclick = async (e) => {
      e.preventDefault();
      const isConfirmed = confirm('Are you sure you want to delete this reply?');
      if (isConfirmed) {
        try {
          const response = await fetch(
            `/api/user-beliefs/${encodeURIComponent(profileUserId)}/${
              encodeURIComponent(belief.name)
            }/reply/${reply.timestamp}`,
            {
              method: 'DELETE'
            }
          );

          if (!response.ok) {
            const error = await response.json();
            showError('Failed to delete reply: ' + response.status);
            throw new Error(error.error || 'Failed to delete reply');
          }

          // Remove the reply element from the DOM
          replyDiv.remove();

          // If this was the last reply, remove the replies container and hide the toggle button
          const repliesContainer = replyDiv.parentElement;
          if (repliesContainer && repliesContainer.children.length === 0) {
            const beliefCard = repliesContainer.closest('.belief');
            if (beliefCard) {
              const toggleButton = beliefCard.querySelector('.toggle-replies');
              if (toggleButton) {
                toggleButton.style.display = 'none';
              }
              const commentSection = beliefCard.querySelector('.comment-section');
              if (commentSection) {
                const replyInput = commentSection.querySelector('.reply-input-container');
                if (replyInput) {
                  replyInput.remove();
                }
              }
            }
            repliesContainer.remove();
          }
        } catch (error) {
          console.error('Error deleting reply:', error);
          showError(error.message);
        }
      }
    };
    replyDiv.appendChild(deleteButton);
  }

  if (window.authenticatedUserId === profileUserId && reply.username !== profileUserId) {
    const banLink = document.createElement('a');
    banLink.innerHTML = '🔨';
    banLink.className = 'ban-link';
    banLink.title = 'Ban user';
    banLink.href = `/ban?user=${encodeURIComponent(reply.username)}`;
    replyDiv.appendChild(banLink);
  }

  replyDiv.appendChild(replyUsername);
  replyDiv.appendChild(replyText);
  return replyDiv;
}

// Function to create reply input
function createReplyInput(profileUserId, belief, container, repliesContainer, userChoice) {
  const replyContainer = document.createElement('div');
  replyContainer.className = 'reply-input-container';

  const replyInput = document.createElement('textarea');
  replyInput.className = 'reply-input';
  replyInput.placeholder = 'Write a reply...';
  replyInput.maxLength = 400;
  makeTextareaAutoExpand(replyInput);

  const replyButton = document.createElement('button');
  replyButton.className = 'reply-button';
  replyButton.textContent = 'Reply';
  replyButton.title = "Send a reply to this thread. Replies can be deleted by the profile owner and by the author.";
  replyButton.onclick = async () => {
    const replyText = replyInput.value.trim();
    if (!replyText) return;

    try {
      const response = await fetch(
        `/api/user-beliefs/${encodeURIComponent(profileUserId)}/${
          encodeURIComponent(belief.name)
        }/reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ comment: replyText })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add reply');
      }

      const reply = await response.json();

      // Add the new reply to the UI using the server-provided timestamp
      const replyDiv = createReplyElement(reply, profileUserId, belief);
      userChoice.replies = userChoice.replies || [];
      userChoice.replies.push(reply);

      repliesContainer.appendChild(replyDiv);

      // Scroll the new reply into view
      repliesContainer.scrollTop = repliesContainer.scrollHeight;

      // Clear the input
      replyInput.value = '';
    } catch (error) {
      console.error('Error adding reply:', error);
      showError(error.message);
    }
  };

  replyContainer.appendChild(replyInput);
  replyContainer.appendChild(replyButton);
  return replyContainer;
}

// Cache for user settings
const userSettingsCache = new Map();

// Function to get user settings
async function getUserSettings(userId) {
  if (userSettingsCache.has(userId)) {
    return userSettingsCache.get(userId);
  }

  try {
    const response = await fetch(`/api/settings/${userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user settings');
    }
    const settings = await response.json();
    userSettingsCache.set(userId, settings);
    return settings;
  } catch (error) {
    console.error('Error fetching user settings:', error);
    showError('Failed to fetch user settings');
    return { allowAllDebates: false };
  }
}

function isDebatable(comment, settings = {}) {
  return settings.allowAllDebates || comment?.toLowerCase().includes('debate me');
}

// Function to create the comment section
function createCommentSection(belief, userChoice, onChange, readOnly, profileUserId, settings) {
  const container = document.createElement('div');
  container.className = 'comment-section';

  let repliesContainer;
  if (userChoice?.replies && userChoice.replies.length > 0) {
    repliesContainer = createRepliesContainer(userChoice, profileUserId, belief, container);
  }

  // Check if user can reply
  const canReply = window.authenticatedUserId &&
    isDebatable(userChoice?.comment, settings) &&
    ((profileUserId === window.authenticatedUserId && userChoice?.replies?.some(r => r.username !== window.authenticatedUserId)) ||
     (profileUserId !== window.authenticatedUserId));

  if (readOnly) {
    // Create comment display
    if (userChoice?.comment) {
      const commentContainer = document.createElement('div');
      commentContainer.className = 'comment-display';

      const usernameLabel = document.createElement('span');
      usernameLabel.className = 'username-label';
      usernameLabel.textContent = `${profileUserId}: `;
      tippy(usernameLabel, {
        content: formatTimestamp(userChoice.commentTime),
        placement: 'top'
      });

      const commentText = document.createElement('span');
      commentText.textContent = userChoice.comment;

      commentContainer.appendChild(usernameLabel);
      commentContainer.appendChild(commentText);
      container.appendChild(commentContainer);

      // Create replies container unconditionally
      repliesContainer = createRepliesContainer(userChoice, profileUserId, belief, container);

      // Add toggle button if there are replies or user can reply
      if (userChoice.replies?.length > 0 || canReply) {
        const toggleReplies = document.createElement('button');
        toggleReplies.className = 'toggle-replies';

        if (userChoice.replies?.length > 0) {
          toggleReplies.textContent = `show ${userChoice.replies.length} ${userChoice.replies.length === 1 ? 'reply' : 'replies'}`;
        } else if (canReply) {
          toggleReplies.textContent = 'reply';
        }

        toggleReplies.onclick = () => {
          repliesContainer.style.display = 'flex';
          if (canReply) {
            const replyContainer = createReplyInput(profileUserId, belief, container, repliesContainer, userChoice);
            container.appendChild(replyContainer);
          }
          toggleReplies.remove();
        };
        container.appendChild(toggleReplies);
      }

      // Add replies container
      container.appendChild(repliesContainer);
    }
  } else {
    // Show textarea for editing
    const commentTextarea = document.createElement('textarea');
    commentTextarea.classList.add('comment-input');
    const placeholder = settings.allowAllDebates ?
      'Add nuance or context.' :
      'Add nuance or context. Include \'debate me\' to allow replies';
    commentTextarea.placeholder = placeholder;
    commentTextarea.maxLength = 400;
    makeTextareaAutoExpand(commentTextarea);
    if (userChoice?.comment) {
      commentTextarea.value = userChoice.comment;
    }

    let commentTimeout;
    commentTextarea.addEventListener('input', () => {
      clearTimeout(commentTimeout);
      commentTimeout = setTimeout(() => {
        const comment = commentTextarea.value.trim();
        onChange(undefined, comment);
      }, 500);
    });

    container.appendChild(commentTextarea);

    // Create replies container unconditionally
    repliesContainer = createRepliesContainer(userChoice, profileUserId, belief, container);

    // Add toggle button if there are replies or user can reply
    if (userChoice.replies?.length > 0 || canReply) {
      const toggleReplies = document.createElement('button');
      toggleReplies.className = 'toggle-replies';

      if (userChoice.replies?.length > 0) {
        toggleReplies.textContent = `show ${userChoice.replies.length} ${userChoice.replies.length === 1 ? 'reply' : 'replies'}`;
      } else if (canReply) {
        toggleReplies.textContent = 'reply';
      }

      toggleReplies.onclick = () => {
        repliesContainer.style.display = 'flex';
        if (canReply) {
          const replyContainer = createReplyInput(profileUserId, belief, container, repliesContainer, userChoice);
          container.appendChild(replyContainer);
        }
        toggleReplies.remove();
      };
      container.appendChild(toggleReplies);
    }

    // Add replies container
    container.appendChild(repliesContainer);
  }

  return container;
}

function getBeliefsInfo(userBeliefs, beliefsData) {
  const allBeliefs = Object.entries(beliefsData)
        .map(([_, beliefs]) => Object.entries(beliefs))
        .flat();
  const statedBeliefs = Object.entries(userBeliefs)
        .filter(([_, { choice }]) => typeof choice !== 'undefined');
  const comments = Object.entries(userBeliefs)
        .filter(([_, { comment }]) => comment);
  const debatableBeliefs = Object.entries(userBeliefs)
        .filter(([_, { comment }]) => isDebatable(comment))
        .map(([name]) => name);
  const beliefsWithReplies = Object.entries(userBeliefs)
        .filter(([_, belief]) => belief.replies?.length > 0)
        .map(([name, belief]) => ({
          name,
          replyCount: belief.replies.length
        }));
  const totalReplies = Object.entries(userBeliefs)
        .reduce((sum, [_, belief]) => sum + (belief.replies?.length || 0), 0);
  return {
    stated: statedBeliefs.length,
    total: allBeliefs.length,
    comments: comments.length,
    debatable: debatableBeliefs.length,
    replies: totalReplies,
    debatableBeliefs,
    beliefsWithReplies
  };
}

const createBeliefCardObserver = (beliefsGrid) => {
  let beliefCards = [];

  const observer = new IntersectionObserver(
    (entries, observer) => requestAnimationFrame(() => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          beliefCards.forEach(({element, name}) => {
            const imageUrl = `/img/min/${encodeURIComponent(name).replaceAll("'", "\\'")}.webp`;
            // Set the background image
            element.style.backgroundImage = `url('${imageUrl}')`;
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
            element.style.backgroundRepeat = 'no-repeat';
          });
          beliefCards = [];
          // Stop observing after the image has loaded
          observer.unobserve(beliefsGrid);
          return;
        }
      };
    }),
    {
      root: null,
      rootMargin: '1000px',
      threshold: 0.01,
    }
  );
  observer.observe(beliefsGrid);

  return { observer, beliefCards };
};

// Function to create a category section
function createCategorySection(category, beliefs, userBeliefs, readOnly, profileUserId, settings) {
  // If no beliefs to show in this category after filtering, return null
  if (readOnly) {
    beliefs = beliefs.filter(belief => {
      const userChoice = userBeliefs[belief.name];
      return userChoice?.choice || userChoice?.comment;
    });
    if (beliefs.length === 0) return null;
  }

  const categoryDiv = document.createElement('div');
  categoryDiv.className = 'category';

  const categoryTitle = document.createElement('h2');
  categoryTitle.textContent = category;
  categoryDiv.appendChild(categoryTitle);

  const beliefsGrid = document.createElement('div');
  beliefsGrid.className = 'beliefs-grid';
  categoryDiv.appendChild(beliefsGrid);

  const { observer, beliefCards } = createBeliefCardObserver(beliefsGrid);

  beliefs.forEach(belief => {
    const userChoice = userBeliefs[belief.name];
    const beliefElement = createBeliefOption(
      belief,
      userChoice,
      async ({ choice, comment }) => {
        if (readOnly) return;

        const beliefData = {};

        if (choice !== undefined) {
          beliefData.choice = choice;
        }

        if (comment !== undefined) {
          beliefData.comment = comment;
        }

        // Update the local userBeliefs object
        if (!userBeliefs[belief.name]) {
          userBeliefs[belief.name] = {};
        }

        if (beliefData.choice !== undefined) {
          userBeliefs[belief.name].choice = beliefData.choice;
        }

        if (beliefData.comment !== undefined) {
          if (beliefData.comment === '') {
            delete userBeliefs[belief.name].comment;
          } else {
            userBeliefs[belief.name].comment = beliefData.comment;
          }
        }

        // Save belief data and wait for it to complete before refreshing the pie chart
        await saveUserBelief(profileUserId, belief.name, beliefData);
        flushBeliefsCache();
        refreshPieChart();
      },
      readOnly,
      profileUserId,
      settings
    );

    if (beliefElement) {
      beliefsGrid.appendChild(beliefElement);
      beliefCards.push({ element: beliefElement, name: belief.name });
    }
  });

  return categoryDiv;
}

// Function to initialize the beliefs grid
async function initializeBeliefsGrid(beliefsData, userBeliefs, profileUserId, settings) {
  const beliefsContainer = document.getElementById('beliefs-container');
  if (!beliefsContainer) return;

  const readOnly = profileUserId !== window.authenticatedUserId;

  // Create and append each category section
  Object.entries(beliefsData).forEach(([category, beliefs]) => {
    const categorySection = createCategorySection(
      category,
      beliefs,
      userBeliefs,
      readOnly,
      profileUserId,
      settings
    );

    if (categorySection) {
      beliefsContainer.appendChild(categorySection);
    }
  });
}

// Function to initialize the correlation section
async function initializeCorrelation(beliefsData, userBeliefs, profileUserId) {
  const correlationDiv = document.querySelector('#correlation-container');
  if (!correlationDiv) return;

  if (profileUserId === window.authenticatedUserId) {
    await updateOwnBeliefsStats(userBeliefs, beliefsData, correlationDiv);
  } else if (window.authenticatedUserId) {
    // Compute correlation coefficient for other users
    const correlationResult = await computeCorrelation(profileUserId, window.authenticatedUserId);

    if (correlationResult === null) {
      correlationDiv.textContent = `Not enough shared beliefs with ${profileUserId} to compute correlation. `;
      updateOwnBeliefsStats(userBeliefs, beliefsData, correlationDiv);
    } else {
      const percentage = (correlationResult * 100).toFixed();
      correlationDiv.textContent = `Belief correlation with you: ${percentage}%, `;
      updateOwnBeliefsStats(userBeliefs, beliefsData, correlationDiv);
    }
  }
}

// Function to initialize navigation handlers
function initializeNavigation() {
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const title = link.textContent.trim();
      handleNavigation(title);
    });
  });

  window.addEventListener('hashchange', handleHashNavigation);
  handleHashNavigation();
}

// Main initialization function
async function init() {
  try {
    const [beliefsData, userBeliefs] = await Promise.all([
      fetchBeliefs(),
      fetchUserBeliefs(window.userId)
    ]);

    window.viewerBeliefs = window.authenticatedUserId ?
      await fetchUserBeliefs(window.authenticatedUserId) :
      {};

    const settings = await getUserSettings(window.userId);

    await initializeBeliefsGrid(beliefsData, userBeliefs, window.userId, settings);
    await initializeCorrelation(beliefsData, userBeliefs, window.userId);
    initializeNavigation();

  } catch (error) {
    console.error('Error initializing application:', error);
    showError('Failed to initialize application');
  }
}

function updateOwnBeliefsStats(userBeliefs, beliefsData, correlationDiv) {
  const { total, stated, comments, debatable, replies, debatableBeliefs, beliefsWithReplies } = getBeliefsInfo(userBeliefs, beliefsData);
  let parts = [];
  if (stated > 0)
    parts.push(`${stated} / ${total} stated`);
  if (debatable > 0 || comments > 0)
    parts.push(`${debatable} / ${comments} <span class="debatable-count">debatable</span>`);
  if (replies > 0)
    parts.push(`${replies} <span class="replies-count">replies</span>`);

  correlationDiv.innerHTML += parts.join(', ');

  const debatableSpan = correlationDiv.querySelector('.debatable-count');
  tippy(debatableSpan, {
    content: `Beliefs with comments that include 'debate me'<br> are marked as debatable` +
      (debatableBeliefs.length > 0 ? ':<div class="tippy-beliefs-list">' : '') +
      debatableBeliefs.map(name =>
        `<div class="tippy-belief-link" data-belief="${name}">${name}</div>`
      ).join('') +
      (debatableBeliefs.length > 0 ? '</div>' : ''),
    allowHTML: true,
    interactive: true,
    theme: 'light',
    placement: 'bottom',
    onShow(instance) {
      instance.popper.querySelectorAll('.tippy-belief-link').forEach(link => {
        link.onclick = () => {
          handleNavigation(link.dataset.belief);
          instance.hide();
        };
      });
    }
  });

  if (beliefsWithReplies.length > 0) {
    const repliesSpan = correlationDiv.querySelector('.replies-count');
    tippy(repliesSpan, {
      content: 'Comments from other users: <div class="tippy-beliefs-list">' +
        beliefsWithReplies.map(belief =>
          `<div class="tippy-belief-link" data-belief="${belief.name}">${belief.name} (${belief.replyCount})</div>`
        ).join('') +
        '</div>',
      allowHTML: true,
      interactive: true,
      theme: 'light',
      placement: 'bottom',
      onShow(instance) {
        instance.popper.querySelectorAll('.tippy-belief-link').forEach(link => {
          link.onclick = () => {
            handleNavigation(link.dataset.belief);
            instance.hide();
          };
        });
      }
    });
  }
}

function handleNavigation (title) {
  const beliefElement = document.querySelector(
    `.belief[data-belief-name="${title}"]`
  );
  if (beliefElement) {
    // Highlight the belief
    beliefElement.classList.add('highlighted');
    // Scroll to the belief
    beliefElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Click show replies link if it exists
    const showRepliesLink = beliefElement.querySelector('.toggle-replies');
    if (showRepliesLink) {
      showRepliesLink.click();
    }
    // Remove highlight after some time
    setTimeout(() => {
      beliefElement.classList.remove('highlighted');
    }, 1000);
  }
}

function handleHashNavigation() {
  const hash = decodeURIComponent(window.location.hash.substring(1));
  if (hash) {
    handleNavigation(hash);
  }
}

function showError(message) {
  Toastify({
    text: message,
    duration: 3000,
    gravity: 'top',
    position: 'right',
    backgroundColor: '#d32f2f',
    stopOnFocus: true
  }).showToast();
}

// Function to format timestamp into human readable form
function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'unknown time';
  }
  const date = new Date(parseInt(timestamp));
  const now = new Date();
  const diff = now - date;

  // Less than a minute
  if (diff < 60000) {
    return 'just now';
  }
  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  // Less than a week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  // Otherwise show full date
  return date.toLocaleString();
}

init();
