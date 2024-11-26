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

  // Initial adjustment
  // Use setTimeout to ensure the adjustment happens after the textarea is fully rendered
  setTimeout(adjustHeight, 0);
};
