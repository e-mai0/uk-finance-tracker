import { describe, it, expect, vi, afterEach } from "vitest";
import { isMacPlatform, formatShortcut, matchesShortcut } from "@/lib/shortcuts";

afterEach(() => vi.unstubAllGlobals());

describe("isMacPlatform", () => {
  it("detects mac", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(isMacPlatform()).toBe(true);
  });
  it("detects windows", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(isMacPlatform()).toBe(false);
  });
  it("is false when navigator is absent (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isMacPlatform()).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("renders mac glyphs", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(formatShortcut("mod+K")).toBe("⌘K");
    expect(formatShortcut("mod+J")).toBe("⌘J");
    // collapse chord differs per platform (Ctrl+Shift+J is browser-reserved on win)
    expect(formatShortcut("collapse")).toBe("⌘⇧J");
  });
  it("renders windows text", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(formatShortcut("mod+K")).toBe("Ctrl+K");
    expect(formatShortcut("collapse")).toBe("Ctrl+\\");
  });
});

describe("matchesShortcut", () => {
  it("matches mod+K with ctrl on windows", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    const e = { key: "k", ctrlKey: true, metaKey: false, shiftKey: false } as KeyboardEvent;
    expect(matchesShortcut(e, "mod+K")).toBe(true);
  });
  it("matches mod+K with meta on mac", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    const e = { key: "k", ctrlKey: false, metaKey: true, shiftKey: false } as KeyboardEvent;
    expect(matchesShortcut(e, "mod+K")).toBe(true);
  });
  it("matches the collapse chord per platform", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    const e = { key: "\\", ctrlKey: true, metaKey: false, shiftKey: false } as KeyboardEvent;
    expect(matchesShortcut(e, "collapse")).toBe(true);
  });
});
