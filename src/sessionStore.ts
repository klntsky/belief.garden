import session from 'express-session';
import { deleteRecord, hasRecord, readRecord, writeRecord } from './storage.js';

type StoredSession = session.SessionData & { __lastAccess?: number };

export class SQLiteSessionStore extends session.Store {
  override get(sid: string, callback: (error: unknown, value?: session.SessionData | null) => void): void {
    try {
      const key = this.key(sid);
      if (!hasRecord(key)) {
        callback(null, null);
        return;
      }
      const value = JSON.parse(readRecord(key)) as StoredSession;
      const expires = value.cookie.expires
        ? new Date(value.cookie.expires).getTime()
        : (value.__lastAccess ?? 0) + 3600000;
      if (expires <= Date.now()) {
        deleteRecord(key);
        callback(null, null);
      } else {
        callback(null, value);
      }
    } catch (error) {
      callback(error);
    }
  }

  override set(sid: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    try {
      writeRecord(this.key(sid), JSON.stringify({ ...value, __lastAccess: Date.now() }));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    try {
      const key = this.key(sid);
      if (hasRecord(key)) deleteRecord(key);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  override touch(sid: string, _value: session.SessionData, callback?: (error?: unknown) => void): void {
    try {
      const key = this.key(sid);
      if (hasRecord(key)) {
        const stored = JSON.parse(readRecord(key)) as StoredSession;
        stored.__lastAccess = Date.now();
        stored.cookie = _value.cookie;
        writeRecord(key, JSON.stringify(stored));
      }
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  private key(sid: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(sid)) throw new Error('Invalid session ID');
    return `sessions/${sid}.json`;
  }
}
