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

  it("revert returns a diff string", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "profile.md", "v2 content", "CYCLOPS");
    const file = await db.findFile("u1", "profile.md");
    const [rev] = await db.listRevisions(file!.id);
    const result = await svc.revert("u1", rev.id);
    expect(result).toHaveProperty("diff");
    expect(result.diff).toContain("v2 content");
  });

  it("revert throws for a revision belonging to another user", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1");
    await svc.write("u1", "profile.md", "u1 content", "CYCLOPS");
    const file = await db.findFile("u1", "profile.md");
    const [rev] = await db.listRevisions(file!.id);
    await expect(svc.revert("u2", rev.id)).rejects.toThrow("not your revision");
  });

  it("PROFILE.MD normalizes to profile.md and does not create a duplicate", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1"); // seeds profile.md
    await svc.write("u1", "PROFILE.MD", "# Profile\nnew content", "CYCLOPS");
    const files = await db.listFiles("u1");
    const profileFiles = files.filter((f) => f.path.toLowerCase() === "profile.md");
    expect(profileFiles).toHaveLength(1);
    expect(profileFiles[0].path).toBe("profile.md");
    expect(profileFiles[0].content).toContain("new content");
  });

  it("revisions respects the limit parameter", async () => {
    const db = fakeDb();
    const svc = createMemoryService(db);
    await svc.list("u1"); // seed
    // Write 5 revisions
    for (let i = 1; i <= 5; i++) {
      await svc.write("u1", "profile.md", `v${i}`, "CYCLOPS");
    }
    const all = await svc.revisions("u1", "profile.md");
    expect(all.length).toBe(5);
    const limited = await svc.revisions("u1", "profile.md", 3);
    expect(limited.length).toBe(3);
    // Should be the 3 most-recent (newest first)
    expect(limited[0].after).toBe("v5");
    expect(limited[2].after).toBe("v3");
  });

  it("seeds missing canonical files even when tree is non-empty", async () => {
    const db = fakeDb();
    // Pre-populate with a non-canonical file so seed skips with the old logic
    await db.upsertFile("u1", "stories/x.md", "content");
    const svc = createMemoryService(db);
    const files = await svc.list("u1");
    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain("profile.md");
    expect(paths).toContain("voice.md");
    expect(paths).toContain("strategy.md");
    expect(paths).toContain("stories/x.md");
  });
});
