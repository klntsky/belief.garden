// src/utils/fileUtils.js

import fs from 'fs/promises';
import { randomBytes } from 'crypto';

/**
 * Write data to a file atomically by using a temporary file and rename.
 * @param {string} filePath - The target file path
 * @param {string|Buffer} data - The data to write
 * @returns {Promise<void>}
 */
export async function writeFileAtomic(filePath, data) {
  const tempPath = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tempPath, data, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch (unlinkErr) {
      // Ignore error if temp file doesn't exist
    }
    throw err;
  }
}
