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
    alert(`Error: ${errorData.error}`);
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
        // Display error using Toastify.js
        Toastify({
          text: data.error,
          duration: 5000,
          gravity: 'top',
          position: 'right',
          backgroundColor: '#d32f2f',
        }).showToast();
      }
    })
    .catch((error) => {
      console.error('Error updating favorite status:', error);
    });
}

function createBeliefOption(belief, userChoice, onChange, readOnly, profileUserId) {
  const beliefDiv = createBeliefDiv(belief);

  const overlayDiv = createOverlayDiv();

  const titleContainer = createTitleContainer(belief, userChoice, onChange, readOnly, profileUserId);
  overlayDiv.appendChild(titleContainer);

  const descriptionContainer = createDescriptionContainer(belief);
  overlayDiv.appendChild(descriptionContainer);

  const buttonsDiv = createButtonsDiv(belief, userChoice, onChange, readOnly, profileUserId);
  if (!buttonsDiv) {
    return null; // Skip rendering if conditions are not met
  }
  overlayDiv.appendChild(buttonsDiv);

  const commentSection = createCommentSection(belief, userChoice, onChange, readOnly, profileUserId);
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
function createTitleContainer(belief, userChoice, onChange, readOnly, profileUserId) {
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

// Function to create the choice buttons
function createButtonsDiv(belief, userChoice, onChange, readOnly, profileUserId) {
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'choice-buttons';

  const choices = ['reject', 'neutral', 'support'];

  // If readOnly and neither choice nor comment is made, skip rendering this belief
  if (readOnly && !userChoice?.choice && !userChoice?.comment) {
    return null;
  }

  const addButtonTitle = (button) => {
    // If the viewer is authenticated and not viewing their own profile
    if (window.authenticatedUserId &&
        window.authenticatedUserId !== profileUserId) {
      // Fetch the viewer's belief for this belief
      const viewerBelief = window.viewerBeliefs[belief.name];
      if (viewerBelief && viewerBelief.choice) {
        const viewerChoice = viewerBelief.choice;
        if (viewerChoice !== userChoice?.choice) {
          if (viewerChoice === 'neutral') {
            buttonsDiv.title = `You are neutral towards ${belief.name}`;
          } else {
            buttonsDiv.title = `You ${viewerChoice} ${belief.name}`;
          }
        } else {
          buttonsDiv.title = 'You have the same choice';
        }
      } else {
        buttonsDiv.title = 'You have not made a choice';
      }
    }
  };

  {
    if (readOnly && !userChoice.choice && userChoice.comment) {
      const button = document.createElement('button');
      button.textContent = 'No choice';
      button.className = `choice-button no-choice selected`;
      button.disabled = true;
      addButtonTitle(button);
      buttonsDiv.appendChild(button);
      return buttonsDiv;
    }
  }

  choices.forEach((choiceValue) => {
    const button = document.createElement('button');
    button.textContent = choiceValue.charAt(0).toUpperCase() + choiceValue.slice(1);
    button.className = `choice-button ${choiceValue}`;
    if (userChoice?.choice === choiceValue) {
      button.classList.add('selected');
      buttonsDiv.classList.add('has-selection');
    }
    if (readOnly) {
      button.disabled = true; // Make buttons non-clickable for read-only view
      addButtonTitle(button);
    } else {
      // Editable mode
      button.addEventListener('click', () => {
        const isSelected = button.classList.contains('selected');
        const siblingButtons = button.parentElement.querySelectorAll('.choice-button');
        siblingButtons.forEach((btn) => btn.classList.remove('selected'));

        if (isSelected) {
          buttonsDiv.classList.remove('has-selection');
          onChange(null);
        } else {
          button.classList.add('selected');
          buttonsDiv.classList.add('has-selection');
          onChange(choiceValue);
        }
        flushBeliefsCache();
      });
    }
    buttonsDiv.appendChild(button);
  });

  return buttonsDiv;
}

// Function to create a reply element
function createReplyElement(reply, profileUserId, onDelete) {
  const replyDiv = document.createElement('div');
  replyDiv.className = 'reply-display';

  const replyUsername = document.createElement('span');
  replyUsername.className = 'username-label';
  replyUsername.textContent = `${reply.username}: `;

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
    deleteButton.onclick = onDelete;
    replyDiv.appendChild(deleteButton);
  }

  replyDiv.appendChild(replyUsername);
  replyDiv.appendChild(replyText);
  return replyDiv;
}

// Function to create replies container
function createRepliesContainer(userChoice, profileUserId, belief, container, replyInput) {
  const repliesContainer = document.createElement('div');
  repliesContainer.className = 'replies-container';
  repliesContainer.style.display = 'none';

  userChoice.replies.forEach(reply => {
    const replyDiv = createReplyElement(reply, profileUserId, async () => {
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
          throw new Error(error.error || 'Failed to delete reply');
        }
        replyDiv.remove();

        // Update reply count
        const remainingReplies = repliesContainer.children.length - 1;
        if (remainingReplies === 0) {
          repliesContainer.remove();
        }

        // If this was the last reply and it's the user's own profile,
        // remove the reply input if it exists
        if (profileUserId === window.authenticatedUserId &&
            remainingReplies === 0) {
          const replyInput = container.querySelector('.reply-input-container');
          if (replyInput) replyInput.remove();
        }
      } catch (error) {
        console.error('Error deleting reply:', error);
        alert(error.message);
      }
    });
    repliesContainer.appendChild(replyDiv);
  });

  return repliesContainer;
}

// Function to create reply input
function createReplyInput(profileUserId, belief, container, repliesContainer) {
  const replyContainer = document.createElement('div');
  replyContainer.className = 'reply-input-container';

  const replyInput = document.createElement('textarea');
  replyInput.className = 'reply-input';
  replyInput.placeholder = 'Write a reply...';
  replyInput.maxLength = 400;

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

      // Add the new reply to the UI
      const replyDiv = createReplyElement(reply, profileUserId, null);

      if (!repliesContainer) {
        repliesContainer = document.createElement('div');
        repliesContainer.className = 'replies-container';
        repliesContainer.style.display = 'flex';
        container.insertBefore(repliesContainer, replyContainer);
      }
      repliesContainer.appendChild(replyDiv);

      // Clear the input
      replyInput.value = '';
    } catch (error) {
      console.error('Error adding reply:', error);
      alert(error.message);
    }
  };

  replyContainer.appendChild(replyInput);
  replyContainer.appendChild(replyButton);
  return replyContainer;
}

// Function to create the comment section
function createCommentSection(belief, userChoice, onChange, readOnly, profileUserId) {
  const container = document.createElement('div');
  container.className = 'comment-section';

  let repliesContainer;
  if (userChoice?.replies && userChoice.replies.length > 0) {
    repliesContainer = createRepliesContainer(userChoice, profileUserId, belief, container);
  }

  // Check if user can reply
  const canReply = window.authenticatedUserId &&
    userChoice?.comment?.toLowerCase().includes('debate me') &&
    ((profileUserId === window.authenticatedUserId && userChoice.replies?.some(r => r.username !== window.authenticatedUserId)) ||
     (profileUserId !== window.authenticatedUserId));

  if (readOnly) {
    // Create comment display
    if (userChoice?.comment) {
      const commentContainer = document.createElement('div');
      commentContainer.className = 'comment-display';

      const usernameLabel = document.createElement('span');
      usernameLabel.className = 'username-label';
      usernameLabel.textContent = `${profileUserId}: `;

      const commentText = document.createElement('span');
      commentText.textContent = userChoice.comment;

      commentContainer.appendChild(usernameLabel);
      commentContainer.appendChild(commentText);
      container.appendChild(commentContainer);

      // Add toggle button if there are replies or user can reply
      if (repliesContainer || canReply) {
        const toggleReplies = document.createElement('button');
        toggleReplies.className = 'toggle-replies';

        if (userChoice.replies?.length > 0) {
          toggleReplies.textContent = `show ${userChoice.replies.length} ${userChoice.replies.length === 1 ? 'reply' : 'replies'}`;
        } else if (canReply) {
          toggleReplies.textContent = 'reply';
        }

        toggleReplies.onclick = () => {
          if (repliesContainer) {
            repliesContainer.style.display = 'flex';
          }
          if (canReply) {
            const replyContainer = createReplyInput(profileUserId, belief, container, repliesContainer);
            container.appendChild(replyContainer);
          }
          toggleReplies.remove();
        };
        container.appendChild(toggleReplies);
      }

      // Add replies container if it exists
      if (repliesContainer) {
        container.appendChild(repliesContainer);
      }
    }
  } else {
    // Show textarea for editing
    const commentTextarea = document.createElement('textarea');
    commentTextarea.classList.add('comment-input');
    commentTextarea.placeholder = 'Add nuance or context. Include \'debate me\' to allow replies';
    commentTextarea.maxLength = 400;
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

    // Add toggle button if there are replies or user can reply
    if (repliesContainer || canReply) {
      const toggleReplies = document.createElement('button');
      toggleReplies.className = 'toggle-replies';

      if (userChoice.replies?.length > 0) {
        toggleReplies.textContent = `show ${userChoice.replies.length} ${userChoice.replies.length === 1 ? 'reply' : 'replies'}`;
      } else if (canReply) {
        toggleReplies.textContent = 'reply';
      }

      toggleReplies.onclick = () => {
        if (repliesContainer) {
          repliesContainer.style.display = 'flex';
        }
        if (canReply) {
          const replyContainer = createReplyInput(profileUserId, belief, container, repliesContainer);
          container.appendChild(replyContainer);
        }
        toggleReplies.remove();
      };
      container.appendChild(toggleReplies);
    }

    // Add replies container if it exists
    if (repliesContainer) {
      container.appendChild(repliesContainer);
    }
  }

  return container;
}

function countUserBeliefs (userBeliefs, beliefsData) {
  const allBeliefs = Object.entries(beliefsData)
        .map(([_, beliefs]) => Object.entries(beliefs))
        .flat();
  const statedBeliefs = Object.entries(userBeliefs)
        .filter(([_, { choice }]) => typeof choice !== 'undefined');
  return {
    stated: statedBeliefs.length,
    total: allBeliefs.length
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

async function init() {
  const beliefsData = await fetchBeliefs();
  const userId = window.userId;
  const authenticatedUserId = window.authenticatedUserId;
  const userBeliefs = await fetchUserBeliefs(userId);
  // Fetch viewer's beliefs if viewing another user's profile
  if (authenticatedUserId && authenticatedUserId !== userId) {
    window.viewerBeliefs = await fetchUserBeliefs(authenticatedUserId);
  } else {
    window.viewerBeliefs = {};
  }
  const beliefsContainer = document.getElementById('beliefs-container');
  const isReadOnly = userId !== authenticatedUserId;

  let correlationMessage = '';

  if (isReadOnly) {
    if (authenticatedUserId) {
      // Compute correlation coefficient
      const correlationResult = await computeCorrelation(userId, authenticatedUserId);

      if (correlationResult === null) {
        correlationMessage = `Not enough shared beliefs with ${userId} to compute correlation`;
      } else {
        const percentage = (correlationResult * 100).toFixed();
        correlationMessage = `Belief correlation with you: ${percentage}%`;
      }
    } else {
      // this case is handled by the backend rendering
    }
  } else {
    const { total, stated } = countUserBeliefs(userBeliefs, beliefsData);
    correlationMessage = `You stated ${stated} beliefs of ${total} total`;
  }

  if (correlationMessage) {
    const correlationDiv = document.querySelector('#correlation-container');
    correlationDiv.textContent = correlationMessage;
  }

  Object.keys(beliefsData).forEach((category) => {
    const categoryBeliefs = beliefsData[category];

    // Filter beliefs based on whether the user has made a choice or comment
    let filteredBeliefs = categoryBeliefs;

    if (isReadOnly) {
      filteredBeliefs = categoryBeliefs.filter((belief) => {
        const userChoice = userBeliefs[belief.name];
        return userChoice?.choice || userChoice?.comment;
      });
    }

    // If no beliefs to show in this category, skip it
    if (filteredBeliefs.length === 0) {
      return;
    }

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category';

    const categoryTitle = document.createElement('h2');
    categoryTitle.textContent = category;
    categoryDiv.appendChild(categoryTitle);

    const beliefsGrid = document.createElement('div');
    beliefsGrid.className = 'beliefs-grid';

    const { observer, beliefCards } = createBeliefCardObserver(beliefsGrid);

    filteredBeliefs.forEach((belief) => {
      const userChoice = userBeliefs[belief.name];
      const beliefElement = createBeliefOption(
        belief,
        userChoice,
        (choice, comment) => {
          console.log('choice', choice, 'comment', comment);
          if (isReadOnly) return;

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

          if (beliefData.choice) {
            userBeliefs[belief.name].choice = beliefData.choice;
          }

          if (beliefData.comment !== undefined) {
            if (beliefData.comment === '') {
              delete userBeliefs[belief.name].comment;
            } else {
              userBeliefs[belief.name].comment = beliefData.comment;
            }
          }

          saveUserBelief(userId, belief.name, beliefData);
        },
        isReadOnly,
        userId // Pass the profileUserId for username label
      );

      if (beliefElement) {
        beliefsGrid.appendChild(beliefElement);
        beliefCards.push({ element: beliefElement, name: belief.name });
      }
    });

    categoryDiv.appendChild(beliefsGrid);
    beliefsContainer.appendChild(categoryDiv);
  });

  handleHashNavigation();
}

// Compute Pearson correlation coefficient
function computeCorrelation(userBeliefs1, userBeliefs2) {
  const beliefNames = Object.keys(userBeliefs1).filter((beliefName) => {
    return userBeliefs1[beliefName].choice && userBeliefs2[beliefName]?.choice;
  });

  if (beliefNames.length < 5) {
    return null;
  }

  const scores1 = [];
  const scores2 = [];

  beliefNames.forEach((beliefName) => {
    scores1.push(choiceToScore(userBeliefs1[beliefName].choice));
    scores2.push(choiceToScore(userBeliefs2[beliefName].choice));
  });

  return pearsonCorrelation(scores1, scores2);
}

// Map choices to numerical scores
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

// Calculate Pearson correlation coefficient
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

function handleNavigation (title) {
  const beliefElement = document.querySelector(
    `.belief[data-belief-name="${title}"]`
  );
  if (beliefElement) {
    // Highlight the belief
    beliefElement.classList.add('highlighted');
    // Scroll to the belief
    beliefElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

init();
