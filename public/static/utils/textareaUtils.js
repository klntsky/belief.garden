/**
 * Makes a textarea automatically expand its height based on content while respecting min-height
 * @param {HTMLTextAreaElement} textarea - The textarea element to make auto-expandable
 */
window.makeTextareaAutoExpand = function(textarea) {
  if (!textarea) return;

  const adjustHeight = () => {
    // Reset height to allow shrinking
    textarea.style.height = '';

    // Get the computed styles
    const style = window.getComputedStyle(textarea);
    const minHeight = parseInt(style.minHeight) || 0;

    // Calculate border and padding
    const borderTop = parseInt(style.borderTopWidth) || 0;
    const borderBottom = parseInt(style.borderBottomWidth) || 0;
    const paddingTop = parseInt(style.paddingTop) || 0;
    const paddingBottom = parseInt(style.paddingBottom) || 0;

    // Set height to scrollHeight + borders + padding
    const newHeight = Math.max(
      minHeight,
      textarea.scrollHeight + borderTop + borderBottom
    );

    textarea.style.height = newHeight + 'px';
  };

  // Bind the adjustment to various events
  textarea.addEventListener('input', adjustHeight);
  textarea.addEventListener('change', adjustHeight);
  textarea.addEventListener('focus', adjustHeight);
  textarea.addEventListener('blur', adjustHeight);

  // Initial adjustment
  // Use setTimeout to ensure the adjustment happens after the textarea is fully rendered
  setTimeout(adjustHeight, 0);
};

function createSaveIndicator(textarea) {
  const indicator = document.createElement('div');
  indicator.className = 'indicator';
  document.body.appendChild(indicator);

  function updatePosition() {
    const rect = textarea.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    indicator.style.position = 'absolute';
    indicator.style.left = `${rect.right - indicator.offsetWidth - 5 + scrollX}px`;
    indicator.style.top = `${rect.bottom - indicator.offsetHeight - 5 + scrollY}px`;
  }

  // Update position initially and on relevant events
  updatePosition();
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition);
  textarea.addEventListener('input', updatePosition);

  let hideTimeout;

  function showSaving() {
    clearTimeout(hideTimeout);
    indicator.classList.add('saving');
    indicator.classList.remove('success', 'error');
    indicator.style.display = 'block';
    updatePosition();
  }

  function showSuccess() {
    clearTimeout(hideTimeout);
    indicator.classList.add('success');
    indicator.classList.remove('saving', 'error');
    indicator.style.display = 'block';
    updatePosition();
    hideTimeout = setTimeout(() => {
      indicator.style.display = 'none';
    }, 5000);
  }

  function showError() {
    clearTimeout(hideTimeout);
    indicator.classList.add('error');
    indicator.classList.remove('saving', 'success');
    indicator.style.display = 'block';
    updatePosition();
    Toastify({
      text: "Failed to save changes",
      duration: 3000,
      gravity: "top",
      position: "right",
      style: {
        background: "linear-gradient(to right, #ff6b6b, #ff4757)",
      }
    }).showToast();
  }

  // Clean up event listeners when indicator is removed
  function cleanup() {
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition);
    textarea.removeEventListener('input', updatePosition);
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }

  return {
    saving: showSaving,
    success: showSuccess,
    error: showError,
    cleanup: cleanup,
  };
}

window.createSaveIndicator = createSaveIndicator;
