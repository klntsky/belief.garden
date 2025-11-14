/**
 * Truncate text with ellipsis if it exceeds maxLength
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function ellipsis(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.slice(0, maxLength - 3) + '...';
  }
  return text;
}

