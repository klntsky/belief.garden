import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { downloadImageFromUrl } from '../src/generateImage.js';

test.describe('downloadImageFromUrl security', () => {
  const copiedPackagePath = path.join('public', 'img', 'security-copy.webp');
  const escapedOutputPath = path.join('public', 'security-escaped.webp');

  test.afterEach(() => {
    for (const filePath of [copiedPackagePath, escapedOutputPath]) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  test('rejects local preview paths outside the preview directory', async () => {
    await expect(
      downloadImageFromUrl('/img/../../package.json', 'security-copy'),
    ).rejects.toThrow('Invalid image URL');
  });

  test('rejects belief names that escape the output directory', async () => {
    await expect(
      downloadImageFromUrl('/img/../../package.json', '../security-escaped'),
    ).rejects.toThrow('Invalid belief name');
  });

  test('rejects remote image hosts that are not allowlisted', async () => {
    await expect(
      downloadImageFromUrl('http://127.0.0.1/internal', 'security-copy'),
    ).rejects.toThrow('Image host is not allowed');
  });

  test('does not follow redirects from allowlisted image hosts', async () => {
    const originalFetch = globalThis.fetch;
    let redirectMode: string | undefined;
    globalThis.fetch = (async (_input, init) => {
      redirectMode = init?.redirect;
      throw new Error('mock request stopped');
    }) as typeof fetch;

    try {
      await expect(
        downloadImageFromUrl(
          'https://oaidalleapiprodscus.blob.core.windows.net/image.webp',
          'security-copy',
        ),
      ).rejects.toThrow('mock request stopped');
      expect(redirectMode).toBe('manual');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
