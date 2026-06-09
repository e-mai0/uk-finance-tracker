import type { MemoryDb } from "@/server/memory/service";

export function fakeDb(): MemoryDb {
  const files = new Map<string, { id: string; userId: string; path: string; content: string }>();
  const revisions: {
    id: string; memoryFileId: string; before: string; after: string;
    author: "USER" | "CYCLOPS"; reason: string | null; createdAt: Date;
  }[] = [];
  let n = 0;
  return {
    async findFile(userId, path) {
      return files.get(`${userId}:${path}`) ?? null;
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
    async listRevisions(memoryFileId) {
      return revisions.filter((r) => r.memoryFileId === memoryFileId).reverse();
    },
    async findRevision(id) {
      return revisions.find((r) => r.id === id) ?? null;
    },
  };
}
