async function fetchCorrelation(targetUsername) {
  const response = await fetch(`/api/correlation/${encodeURIComponent(targetUsername)}`, {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error('Unable to load belief correlation');
  }

  const data = await response.json();
  if (data === null || typeof data !== 'object' || !Object.hasOwn(data, 'correlation') ||
      !(data.correlation === null ||
        (typeof data.correlation === 'number' && Number.isFinite(data.correlation)))) {
    throw new Error('Invalid correlation response');
  }
  return data.correlation;
}

/**
 * Gets a color representation for a given correlation coefficient.
 * @param {number} correlation - The correlation coefficient.
 * @returns {string} - A CSS color string.
 */
function getColorForCorrelation(correlation) {
  // Map -1 (red) to 0 (yellow) to 1 (green)
  const red = { r: 255, g: 0, b: 0 };
  const yellow = { r: 255, g: 255, b: 0 };
  const green = { r: 0, g: 128, b: 0 };

  let color;
  if (correlation < 0) {
    const factor = (correlation + 1) / 1; // Map -1 to 0, 0 to 1
    color = {
      r: red.r + factor * (yellow.r - red.r),
      g: red.g + factor * (yellow.g - red.g),
      b: red.b + factor * (yellow.b - red.b),
    };
  } else {
    const factor = correlation / 1; // Map 0 to 0, 1 to 1
    color = {
      r: yellow.r + factor * (green.r - yellow.r),
      g: yellow.g + factor * (green.g - yellow.g),
      b: yellow.b + factor * (green.b - yellow.b),
    };
  }

  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(
      color.b
    )})`;
}

/**
 * Extracts core beliefs from a user's beliefs data.
 * Core beliefs are those with a 'preference' property greater than 0.
 *
 * @param {Object} beliefsData - The user's beliefs data.
 * @returns {Array<string>} - An array of core belief names.
 */
function getCoreBeliefs(beliefsData) {
  return Object.keys(beliefsData).filter((beliefName) => {
    const belief = beliefsData[beliefName];
    return typeof belief.preference === 'number' && belief.preference > 0;
  }).map(belief => ({ belief, choice: beliefsData[belief].choice }));
}

async function addCorrelationBullets() {
  const authenticatedUserId = window.authenticatedUserId;

  const usernameElements = document.querySelectorAll(
    '[data-username]:not([data-correlated])'
  );

  for (const element of usernameElements) {
    // class list could change during iteration
    if (element.getAttribute('data-correlated') == 'true') {
      continue;
    }

    element.setAttribute('data-correlated', true);

    const otherUserId = element.getAttribute('data-username');

    const bullet = document.createElement('span');
    bullet.className = 'correlation-bullet';
    let title;

    if (!authenticatedUserId) {
      title = 'Log in to compute belief correlation';
      bullet.style.display = 'none';
    } else if (otherUserId === authenticatedUserId) {
      bullet.style.backgroundColor = 'white';
      title = '(You)';
    } else {
      try {
        const correlation = await fetchCorrelation(otherUserId);
        if (correlation === null) {
          bullet.style.backgroundColor = '#cccccc';
          title = 'Unable to compute correlation. Not enough data.';
        } else {
          const color = getColorForCorrelation(correlation);
          bullet.style.backgroundColor = color;
          const percentage = (correlation * 100).toFixed(2);
          title = `Correlation with ${otherUserId}: ${percentage}%`;
        }
      } catch {
        bullet.style.backgroundColor = '#cccccc';
        title = 'Unable to load belief correlation.';
      }
    }


    if (typeof tippy !== 'undefined') {
      tippy.setDefaultProps({ maxWidth: '' });
      tippy(element, {
        content: title,
        placement: 'right-start',
        inlinePositioning: false,
        onTrigger: async (instance, event) => {
          try {
            const response = await fetch(`/api/user-beliefs/${encodeURIComponent(otherUserId)}`, {
              cache: 'no-store'
            });
            if (!response.ok) {
              instance.setContent(title);
              return;
            }
            const otherUserCoreBeliefs = getCoreBeliefs(await response.json());
            let newContent = title + (
              otherUserCoreBeliefs.length ?
                '\n\n' +
                otherUserCoreBeliefs.map(({ belief, choice }) =>
                  window.formatChoice(choice, belief, 'light')
                ).join('\n')
              : ''
            );
            instance.setContent(newContent);
          } catch {
            instance.setContent(title);
          }
        }
      });
    } else {
      element.title = title;
    }

    element.prepend(bullet);
    element.classList.add('correlated');
  }
}

window.addCorrelationBullets = addCorrelationBullets;

document.addEventListener('DOMContentLoaded', () => {
  addCorrelationBullets();
});
