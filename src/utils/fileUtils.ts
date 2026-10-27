import path from 'path';

export class UnsafePathError extends Error {
  constructor(message = 'Invalid path') {
    super(message);
    this.name = 'UnsafePathError';
  }
}

export function isSafePathSegment(name: string): boolean {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= 200
    && !name.includes('\0')
    && !name.includes('/')
    && !name.includes('\\')
    && !name.includes('..');
}

export function assertSafePathSegment(name: string): void {
  if (!isSafePathSegment(name)) {
    throw new UnsafePathError('Invalid path');
  }
}

export function resolveContainedFile(directory: string, filename: string): string {
  assertSafePathSegment(filename);
  const resolved = path.resolve(directory, filename);
  const root = path.resolve(directory);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== path.join(root, filename) && !resolved.startsWith(rootWithSep)) {
    throw new UnsafePathError('Invalid path');
  }
  if (!resolved.startsWith(rootWithSep) && resolved !== root) {
    throw new UnsafePathError('Invalid path');
  }
  return resolved;
}


