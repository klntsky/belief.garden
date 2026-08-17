import fs from 'fs/promises';
import path from 'path';

export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.') {
    await fs.mkdir(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, data);
  await fs.rename(tmpPath, filePath);
}

