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

const PATH_RE = /^(?!.*\.\.)[a-z0-9][a-z0-9\-_/.]*\.md$/;

/** Lowercases the path and throws if it is not valid. Returns the normalized path. */
function normalizePath(path: string): string {
  const p = path.toLowerCase();
  if (!PATH_RE.test(p) || p.startsWith("/")) {
    throw new Error(`invalid memory path: ${path}`);
  }
  return p;
}

export function createMemoryService(db: MemoryDb) {
  async function seed(userId: string): Promise<void> {
    for (const [path, content] of Object.entries(CANONICAL_TEMPLATES)) {
      const existing = await db.findFile(userId, path);
      if (!existing) {
        await db.upsertFile(userId, path, content);
      }
    }
  }

  return {
    async list(userId: string) {
      await seed(userId);
      return db.listFiles(userId);
    },

    async read(userId: string, path: string) {
      path = normalizePath(path);
      return db.findFile(userId, path);
    },

    async write(
      userId: string,
      path: string,
      content: string,
      author: MemoryAuthorKind,
      reason?: string,
    ): Promise<{ diff: string }> {
      path = normalizePath(path);
      return db.transact(async (txDb) => {
        const existing = await txDb.findFile(userId, path);
        const before = existing?.content ?? "";
        const file = await txDb.upsertFile(userId, path, content);
        await txDb.createRevision({
          memoryFileId: file.id,
          before,
          after: content,
          author,
          reason: reason ?? null,
        });
        return { diff: createTwoFilesPatch(path, path, before, content) };
      });
    },

    async revisions(userId: string, path: string) {
      path = normalizePath(path);
      const file = await db.findFile(userId, path);
      if (!file) return [];
      return db.listRevisions(file.id);
    },

    /**
     * Restores a file to its state BEFORE the chosen revision ("restore this version").
     * Uses findFileById for O(1) ownership check without loading the full tree.
     * Returns { diff } from the inner write so the UI can display what changed.
     */
    async revert(userId: string, revisionId: string): Promise<{ diff: string }> {
      const rev = await db.findRevision(revisionId);
      if (!rev) throw new Error("revision not found");
      const file = await db.findFileById(rev.memoryFileId);
      if (!file || file.userId !== userId) throw new Error("not your revision");
      return this.write(userId, file.path, rev.before, "USER", "revert");
    },
  };
}

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function prismaMemoryDbFor(client: typeof prisma | PrismaTransactionClient): Omit<MemoryDb, "transact"> {
  return {
    findFile: (userId, path) =>
      client.memoryFile.findUnique({ where: { userId_path: { userId, path } } }),
    findFileById: (id) =>
      client.memoryFile.findUnique({ where: { id } }),
    listFiles: (userId) =>
      client.memoryFile.findMany({ where: { userId } }),
    upsertFile: (userId, path, content) =>
      client.memoryFile.upsert({
        where: { userId_path: { userId, path } },
        create: { userId, path, content },
        update: { content },
      }),
    createRevision: async (rev) => {
      await client.memoryRevision.create({ data: rev });
    },
    listRevisions: (memoryFileId) =>
      client.memoryRevision.findMany({
        where: { memoryFileId },
        orderBy: { createdAt: "desc" },
      }),
    findRevision: (id) =>
      client.memoryRevision.findUnique({ where: { id } }),
  };
}

export const prismaMemoryDb: MemoryDb = {
  ...prismaMemoryDbFor(prisma),
  transact: <T>(fn: (db: MemoryDb) => Promise<T>) =>
    prisma.$transaction((tx) =>
      fn({ ...prismaMemoryDbFor(tx), transact: prismaMemoryDb.transact }),
    ),
};

export const memoryService = createMemoryService(prismaMemoryDb);
