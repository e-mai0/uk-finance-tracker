import { describe, expect, it } from "vitest";
import { createMemoryService } from "@/server/memory/service";
import { fakeDb } from "./helpers/fake-memory-db";

describe("memory service", () => {
  it("seeds canonical tree on first list", async () => {
    const svc = createMemoryService(fakeDb());
    const files = await svc.list("u1");
    expect(files.map((f) => f.path).sort()).toEqual(["profile.md", "strategy.md", "voice.md"]);
  });

  it("write creates a revision with before/after and author", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1"); // seed
    await svc.write("u1", "strategy.md", "# Strategy\nnew content", "CYCLOPS", "user stated goal");
    const file = await db.findFile("u1", "strategy.md");
    const revs = await db.listRevisions(file!.id);
    expect(revs[0].after).toContain("new content");
    expect(revs[0].before).toContain("Current direction");
    expect(revs[0].author).toBe("CYCLOPS");
  });

  it("revert restores the before content as a USER revision", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "profile.md", "v2", "CYCLOPS");
    const file = await db.findFile("u1", "profile.md");
    const [rev] = await db.listRevisions(file!.id);
    await svc.revert("u1", rev.id);
    const after = await svc.read("u1", "profile.md");
    expect(after!.content).toContain("# Profile");
  });

  it("rejects path traversal and absolute paths", async () => {
    const svc = createMemoryService(fakeDb());
    await expect(svc.write("u1", "../evil.md", "x", "USER")).rejects.toThrow();
    await expect(svc.read("u1", "/etc/passwd")).rejects.toThrow();
  });

  it("unified diff is produced for display", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    const { diff } = await svc.write("u1", "profile.md", "# Profile\n- new fact (confidence: high, confirmed: 2026-06-09)\n", "CYCLOPS");
    expect(diff).toContain("+- new fact");
  });
});
