import { del, get, keys, set } from 'idb-keyval';

export interface StorageAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const idbStorage: StorageAdapter = {
  get: (key) => get(key),
  set: (key, value) => set(key, value),
  del: (key) => del(key),
  keys: async () => (await keys()).filter((key): key is string => typeof key === 'string'),
};

export class MemoryStorage implements StorageAdapter {
  readonly data = new Map<string, unknown>();
  writes = 0;
  async get(key: string): Promise<unknown> {
    return this.data.get(key);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.writes++;
    this.data.set(key, structuredClone(value));
  }
  async del(key: string): Promise<void> {
    this.data.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.data.keys()];
  }
}

export const LAST_OPENED_KEY = 'meta:lastOpenedId';
export const FLOW_KEY_PREFIX = 'flow:';
export const flowKey = (id: string): string => `${FLOW_KEY_PREFIX}${id}`;
