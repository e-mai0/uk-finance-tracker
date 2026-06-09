import type { MemoryDb } from "@/server/memory/service";

export function fakeDb(): MemoryDb {
  const files = new Map<string, { id: string; userId: string; path: string; content: string }>();
  const revisions: {
    id: string; memoryFileId: string; before: string; after: string;
    author: "USER" | "CYCLOPS"; reason: string | null; createdAt: Date;
  }[] = [];
  let n = 0;

  const self: MemoryDb = {
    async findFile(userId, path) {
      return files.get(`${userId}:${path}`) ?? null;
    },
    async findFileById(id) {
      for (const f of files.values()) {
        if (f.id === id) return f;
      }
      return null;
    },
    async listFiles(userId) {
      return [...files.values()].filter((f) => f.userId === userId);
    },
    async upsertFile(userId, path, content) {
      const key = `${userId}:${path}`;
      const existing = files.get(key);
      const file = existing ? { ...existing, content } : { id: `f${++n}`, userId, path, content };
      files.set(key, file);
      return file;
    },
    async createRevision(rev) {
      revisions.push({ ...rev, id: `r${++n}`, reason: rev.reason ?? null, createdAt: new Date() });
    },
    async listRevisions(memoryFileId, limit) {
      const all = revisions.filter((r) => r.memoryFileId === memoryFileId).reverse();
      return limit !== undefined ? all.slice(0, limit) : all;
    },
    async findRevision(id) {
      return revisions.find((r) => r.id === id) ?? null;
    },
    transact<T>(fn: (db: MemoryDb) => Promise<T>): Promise<T> {
      return fn(self);
    },
  };
  return self;
}
