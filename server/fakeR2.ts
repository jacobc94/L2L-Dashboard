import type { R2Body, R2Bucket } from './types';

/** In-memory R2 with the same conditional-write behaviour as the real thing (for tests and local experiments). */
export class FakeR2 implements R2Bucket {
  files = new Map<string, { text: string; etag: string }>();
  private n = 0;
  /** Test hook: run just before the next put to simulate a concurrent writer */
  beforePut?: (key: string) => void;

  async get(key: string): Promise<R2Body | null> {
    const f = this.files.get(key);
    return f ? { etag: f.etag, text: async () => f.text } : null;
  }
  async put(key: string, value: string, options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } }): Promise<R2Body | null> {
    const hook = this.beforePut;
    if (hook) { this.beforePut = undefined; hook(key); }
    const cur = this.files.get(key);
    const c = options?.onlyIf;
    if (c?.etagMatches !== undefined && cur?.etag !== c.etagMatches) return null;
    if (c?.etagDoesNotMatch !== undefined && cur && (c.etagDoesNotMatch === '*' || cur.etag === c.etagDoesNotMatch)) return null;
    const etag = `e${++this.n}`;
    this.files.set(key, { text: value, etag });
    return { etag, text: async () => value };
  }
  async delete(key: string) {
    this.files.delete(key);
  }
  async list(options?: { prefix?: string }) {
    return { objects: [...this.files.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).map((key) => ({ key })), truncated: false };
  }
}
