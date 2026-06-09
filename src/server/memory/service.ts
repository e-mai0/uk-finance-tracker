import { createTwoFilesPatch } from "diff";
import { prisma } from "@/server/db";
import { CANONICAL_TEMPLATES } from "@/server/memory/templates";

export type MemoryAuthorKind = "USER" | "CYCLOPS";

export interface MemoryDb {
  findFile(userId: string, path: string): Promise<{ id: string; userId: string; path: string; content: string } | null>;
  findFileById(id: string): Promise<{ id: string; userId: string; path: string; content: string } | null>;
  listFiles(userId: string): Promise<{ id: string; userId: string; path: string; content: string }[]>;
  upsertFile(userId: string, path: string, content: string): Promise<{ id: string; userId: string; path: string; content: string }>;
  createRevision(rev: { memoryFileId: string; before: string; after: string; author: MemoryAuthorKind; reason?: string | null }): Promise<void>;
  listRevisions(memoryFileId: string): Promise<{ id: string; memoryFileId: string; before: string; after: string; author: MemoryAuthorKind; reason: string | null; createdAt: Date }[]>;
  findRevision(id: string): Promise<{ id: string; memoryFileId: string; before: string; after: string } | null>;
  transact<T>(fn: (db: MemoryDb) => Promise<T>): Promise<T>;
}

const PATH_RE = /^(?!.*\.\.)[a-z0-9][a-z0-9\-_/.]*\.md$/i;

function assertPath(path: string): void {
  if (!PATH_RE.test(path) || path.startsWith("/")) {
    throw new Error(`invalid memory path: ${path}`);
  }
}

export function createMemoryService(db: MemoryDb) {
  async function seed(userId: string): Promise<void> {
    const existing = await db.listFiles(userId);
    if (existing.length > 0) return;
    for (const [path, content] of Object.entries(CANONICAL_TEMPLATES)) {
      await db.upsertFile(userId, path, content);
    }
  }

  return {
    async list(userId: string) {
      await seed(userId);
      return db.listFiles(userId);
    },

    async read(userId: string, path: string) {
      assertPath(path);
      return db.findFile(userId, path);
    },

    async write(
      userId: string,
      path: string,
      content: string,
      author: MemoryAuthorKind,
      reason?: string,
    ): Promise<{ diff: string }> {
      assertPath(path);
      const existing = await db.findFile(userId, path);
      const before = existing?.content ?? "";
      const file = await db.upsertFile(userId, path, content);
      await db.createRevision({ memoryFileId: file.id, before, after: content, author, reason: reason ?? null });
      return { diff: createTwoFilesPatch(path, path, before, content) };
    },

    async revisions(userId: string, path: string) {
      assertPath(path);
      const file = await db.findFile(userId, path);
      if (!file) return [];
      return db.listRevisions(file.id);
    },

    async revert(userId: string, revisionId: string): Promise<void> {
      const rev = await db.findRevision(revisionId);
      if (!rev) throw new Error("revision not found");
      const files = await db.listFiles(userId);
      const file = files.find((f) => f.id === rev.memoryFileId);
      if (!file) throw new Error("not your revision");
      await this.write(userId, file.path, rev.before, "USER", "revert");
    },
  };
}

export const prismaMemoryDb: MemoryDb = {
  findFile: (userId, path) =>
    prisma.memoryFile.findUnique({ where: { userId_path: { userId, path } } }),
  listFiles: (userId) => prisma.memoryFile.findMany({ where: { userId } }),
  upsertFile: (userId, path, content) =>
    prisma.memoryFile.upsert({
      where: { userId_path: { userId, path } },
      create: { userId, path, content },
      update: { content },
    }),
  createRevision: async (rev) => {
    await prisma.memoryRevision.create({ data: rev });
  },
  listRevisions: (memoryFileId) =>
    prisma.memoryRevision.findMany({ where: { memoryFileId }, orderBy: { createdAt: "desc" } }),
  findRevision: (id) => prisma.memoryRevision.findUnique({ where: { id } }),
};

export const memoryService = createMemoryService(prismaMemoryDb);
