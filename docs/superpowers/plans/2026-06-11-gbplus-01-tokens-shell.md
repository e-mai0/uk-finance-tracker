# GB+ Plan 1 of 4 — Token Foundation + App Shell (Spec Phases A+B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Paper-Terminal token layer with the GB+ design system (warm linen, Zilla Slab/Karla/Fragment Mono, pill controls) and swap the dark chrome header for the new light pill-nav shell with route renames — leaving every existing page functional and visually native.

**Architecture:** Two layers. Layer 1 rewrites `globals.css` `@theme` mapping OLD token names to NEW GB+ values (existing pages restyle themselves with zero component edits) and adds new GB+-only tokens. Layer 2 replaces `AppHeader` (dark chrome) with `AppNav` (light pills incl. "Ask Cyclops"), adds `/today` + `/tracker` routes with redirects, and lands the platform-aware shortcut service.

**Tech Stack:** Next.js 15 App Router, Tailwind 4 (`@theme` CSS variables), next/font/google, Prisma (read-only here), vitest.

**Read first:** `AGENTS.md` warns this Next.js version may differ from training data — check `node_modules/next/dist/docs/` if any App Router API behaves unexpectedly. Spec: `docs/superpowers/specs/2026-06-11-cyclops-gbplus-ui-design.md`.

**Plan series:** 1 = Phases A+B (this file) · 2 = Phase C+D (attention store, tracker board+peek) · 3 = Phase E+F (dock+chat, Today) · 4 = Phase G+H (applications, memory/settings/a11y). Plans 2–4 are written after Plan 1 lands.

**Branch:** all work on `gbplus-ui` (created in Task 0). DB is untouched in this plan.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout -b gbplus-ui
```

- [ ] **Step 2: Verify clean state**

Run: `git status --short`
Expected: empty output.

---

### Task 1: Fonts — Karla / Fragment Mono / Zilla Slab

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the font loaders and metadata**

Replace the entire contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Karla, Fragment_Mono, Zilla_Slab } from "next/font/google";
import "./globals.css";

// GB+ UI sans — humanist grotesque with quiet character (Granola's "Melange" role).
// Variable kept as --font-geist-sans so the globals.css mapping stands.
const sans = Karla({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
});

// GB+ data mono — single weight by design; the family has no bold and we never
// synthesize one. Emphasis in mono = color tier or size, never weight.
const mono = Fragment_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// GB+ display slab — page titles, greetings, card heads.
const display = Zilla_Slab({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cyclops — your application OS",
  description:
    "Cyclops tracks UK internship listings, drafts answers in your voice overnight, and brings you only the decisions that need you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
```

Note: this removes the `StatusBar` import and render (the GB+ shell has no footer bar). Do NOT delete `src/components/status-bar.tsx` yet — the landing page may reference it; it's removed in Task 6 if unreferenced.

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (warnings ok, zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(gbplus): swap fonts to Karla / Fragment Mono / Zilla Slab, drop footer status bar"
```

---

### Task 2: globals.css — GB+ token layer

**Files:**
- Modify: `src/app/globals.css` (full rewrite of the `@theme` block and base styles; keep the ticker/caret/rise animation block as-is)

- [ ] **Step 1: Rewrite globals.css**

Replace everything from the top of the file through the `.rule` block (lines 1–186) with the following; keep the existing "Terminal motion" animation section (`@keyframes rise` onward) untouched below it:

```css
@import "tailwindcss";

/* ---------------------------------------------------------------------------
   "GB+" — Cyclops application OS. Warm linen paper, cream cards, slab display
   over a humanist sans, single-weight data mono. Amber means agent — always
   and only. Pill controls, 14px cards, hairline rules. Type floor: 11px.
   Spec: docs/superpowers/specs/2026-06-11-cyclops-gbplus-ui-design.md
--------------------------------------------------------------------------- */
@theme {
  /* Surfaces — old token names remapped so existing pages degrade gracefully */
  --color-canvas: #f4f1ea;    /* linen page base */
  --color-surface: #fffdf9;   /* cream cards */
  --color-surface-2: #faf6ee; /* card heads + hover */
  --color-surface-3: #f0ebdf; /* table heads / pressed */

  /* Ink scale — all text-grade values are WCAG-measured on their surfaces */
  --color-ink: #2b2722;
  --color-muted: #5d564b;
  --color-subtle: #6b6256;    /* replaces failing #847b6e for text */
  --color-faint: #756c5f;     /* micro-labels ≥11px only */
  --color-deco: #a39885;      /* NON-TEXT only: decorative rules, tracks */

  /* Borders */
  --color-border: #e3dccd;            /* decorative card hairlines */
  --color-hairline: #efe9dc;          /* row dividers */
  --color-border-strong: #d4cab6;     /* decorative emphasis (legacy mapping) */
  --color-border-interactive: #847b6e;/* input + secondary-button boundaries */
  --color-border-agent: #ecd9bd;      /* dock + proposal cards only */

  /* Agent — amber. Text vs mark split is the a11y law. */
  --color-accent: #9a4c0c;        /* agent TEXT at any size (legacy accent was text-heavy) */
  --color-accent-2: #c05f10;      /* legacy alias of the mark */
  --color-agent-mark: #c05f10;    /* fills, bars, rules, dots, focus ring — non-text */
  --color-accent-hover: #7a3c0a;
  --color-accent-fg: #fffdf9;
  --color-accent-soft: #f8ead9;   /* agent tint chips */
  --color-accent-tint: #fdf6ea;   /* agent-warmed row wash (--hot) */
  --color-agent-on-dark: #f0b35f; /* badge text inside dark pills */

  /* Dark ink surfaces (primary buttons, active pills, user bubbles) */
  --color-chrome: #2b2722;        /* legacy chrome remaps to warm ink */
  --color-chrome-2: #3d372e;
  --color-chrome-line: #4a4234;
  --color-chrome-ink: #f4f1ea;
  --color-chrome-ink-2: #c4b9a6;
  --color-chrome-dim: #9d917f;
  --color-amber: #f0b35f;         /* live signal on dark ink */
  --color-amber-2: #f5c57e;

  /* Semantics — green is for EVENTS, never default states */
  --color-success: #3a6246;       /* text-grade green */
  --color-good-mark: #4e7d5b;     /* bar fills, large glyphs */
  --color-success-soft: #e8efe6;
  --color-warning: #8f6b22;       /* text-grade gold */
  --color-warning-soft: #f6ecd8;
  --color-danger: #a93226;
  --color-danger-soft: #f6e3e0;
  --color-info: #9a4c0c;
  --color-info-soft: #f8ead9;

  /* Diff pair (proposal cards) */
  --color-diff-del: #a93226;
  --color-diff-del-bg: #f9ecea;
  --color-diff-add: #2e6b46;
  --color-diff-add-bg: #ebf2ec;

  /* Fit tiers — ramp independent of row state; number always rendered beside bar */
  --color-tier-strong: #4e7d5b;
  --color-tier-good: #9a4c0c;
  --color-tier-mod: #8f6b22;
  --color-tier-low: #b9b0a0;

  /* Radii — GB+ is soft: 6 / 10 / 14 / pill */
  --radius-card: 0.875rem;    /* 14px cards, dock, composer */
  --radius-control: 0.625rem; /* 10px inputs, nested cards */
  --radius-pill: 999px;
  --radius-bar: 999px;
  --radius: 0.625rem;
  --radius-sm: 0.375rem;  /* 6px micro glyphs, diff lines */
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;
  --radius-xl: 0.875rem;
  --radius-2xl: 0.875rem;
  --radius-3xl: 0.875rem;

  --shadow-card: 0 2px 6px rgba(70, 60, 40, 0.05), 0 12px 32px -20px rgba(70, 60, 40, 0.14);
  --shadow-pop: 0 10px 28px -16px rgba(70, 60, 40, 0.22);
  --shadow-frame: 0 2px 6px rgba(70, 60, 40, 0.05), 0 12px 32px -20px rgba(70, 60, 40, 0.14);

  /* Fonts fed by next/font in app/layout.tsx:
     --font-geist-sans → Karla · --font-geist-mono → Fragment Mono
     --font-display → Zilla Slab. */
  --font-display: var(--font-display), Georgia, serif;
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace;
}

html {
  background: var(--color-canvas);
  color-scheme: light;
}

body {
  color: var(--color-ink);
  font-family: var(--font-sans);
  background-color: var(--color-canvas);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Slab display for page-level headings. */
h1,
h2 {
  font-family: var(--font-display);
  letter-spacing: -0.01em;
  font-weight: 500;
}

/* All numerics render in mono with tabular figures. Fragment Mono is single
   weight — never set font-weight above 400 on mono text. */
.tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* Uppercase mono micro-label — column heads, eyebrows, chips.
   TYPE FLOOR: 11px. Never smaller, anywhere. */
.label {
  font-family: var(--font-mono);
  font-size: 0.6875rem; /* 11px floor */
  font-weight: 400;     /* Fragment Mono has no bold */
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Dark ink rail (legacy .chrome consumers: landing page). Warm ink, not black. */
.chrome {
  background-color: var(--color-chrome);
  color: var(--color-chrome-ink);
}

.live-dot {
  box-shadow: 0 0 0 2px rgba(78, 125, 91, 0.18), 0 0 7px 0 rgba(78, 125, 91, 0.5);
}

::selection {
  background: var(--color-agent-mark);
  color: var(--color-accent-fg);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

/* Global focus ring — never border-color-only focus. */
:focus-visible {
  outline: 2px solid var(--color-agent-mark);
  outline-offset: 2px;
}

/* Hairline divider. */
.rule {
  height: 1px;
  background: var(--color-hairline);
}
```

- [ ] **Step 2: Visual smoke check**

Run: `npm run dev` (background), open http://localhost:3000/dashboard after logging in, confirm: linen background, cream cards, no crash, pills where radius utilities are used. Stop the dev server.

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: same pass/fail profile as before the change (these are server tests; none read CSS).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(gbplus): GB+ token layer — linen palette, soft radii, 11px type floor, focus ring"
```

---

### Task 3: Shortcut service

**Files:**
- Create: `src/lib/shortcuts.ts`
- Test: `src/lib/__tests__/shortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/shortcuts.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/shortcuts.test.ts`
Expected: FAIL — cannot resolve `@/lib/shortcuts`.

- [ ] **Step 3: Implement**

```ts
// src/lib/shortcuts.ts
/**
 * Platform-aware shortcut service. The spec's keyboard law:
 * - printed hints are NEVER hardcoded glyphs — always rendered via formatShortcut
 * - Ctrl+Shift+J is browser-reserved on Windows (DevTools) so the dock-collapse
 *   chord is ⌘⇧J on mac and Ctrl+\ on win/linux.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined" || !navigator) return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
}

type Chord = "mod+K" | "mod+J" | "mod+Enter" | "collapse";

export function formatShortcut(chord: Chord | string): string {
  const mac = isMacPlatform();
  if (chord === "collapse") return mac ? "⌘⇧J" : "Ctrl+\\";
  const [mod, key] = chord.split("+");
  if (mod !== "mod") return chord;
  const k = key === "Enter" ? "⏎" : key.toUpperCase();
  return mac ? `⌘${k}` : `Ctrl+${k}`;
}

export function matchesShortcut(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
  chord: Chord | string,
): boolean {
  const mac = isMacPlatform();
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (chord === "collapse") {
    return mac
      ? mod && e.shiftKey && e.key.toLowerCase() === "j"
      : mod && !e.shiftKey && e.key === "\\";
  }
  const [m, key] = chord.split("+");
  if (m !== "mod") return false;
  const want = key === "Enter" ? "enter" : key.toLowerCase();
  return mod && !e.shiftKey && e.key.toLowerCase() === want;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/__tests__/shortcuts.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shortcuts.ts src/lib/__tests__/shortcuts.test.ts
git commit -m "feat(gbplus): platform-aware shortcut service (Ctrl+Shift+J reserved on win)"
```

---

### Task 4: Routes — /today and /tracker (+redirects)

**Files:**
- Create: `src/app/(app)/today/page.tsx`
- Move: `src/app/(app)/dashboard/` → `src/app/(app)/tracker/` (entire directory, `git mv`)
- Modify: new `src/app/(app)/dashboard/page.tsx` (redirect stub)
- Modify: `src/app/(app)/saved/page.tsx` (replace with redirect stub)

- [ ] **Step 1: Move the dashboard directory**

```bash
git mv "src/app/(app)/dashboard" "src/app/(app)/tracker"
```

- [ ] **Step 2: Create the redirect stubs**

```tsx
// src/app/(app)/dashboard/page.tsx  (new file in a re-created dashboard dir)
import { redirect } from "next/navigation";

export default function DashboardRedirect() {
  redirect("/tracker");
}
```

Replace the contents of `src/app/(app)/saved/page.tsx` with:

```tsx
// /saved folds into the tracker's ★ filter (spec §4.1). The filter itself
// ships in Plan 2 (Phase D); until then this lands on the full board.
import { redirect } from "next/navigation";

export default function SavedRedirect() {
  redirect("/tracker?filter=starred");
}
```

If the `saved` directory contains other files (loading.tsx etc.), delete them: the route is now a pure redirect.

- [ ] **Step 3: Create the interim Today page**

```tsx
// src/app/(app)/today/page.tsx
import { auth } from "@/server/auth";

function dateLine(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

export default async function TodayPage() {
  const session = await auth();
  const first = (session?.user?.name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="label text-faint">{dateLine()}</p>
      <h1 className="mt-1 text-[1.75rem] text-ink">Good morning, {first}.</h1>
      {/* Interim state — the brief, queue and coming-up land in Plan 3 (Phase F). */}
      <div className="mt-5 rounded-card border border-border bg-surface p-5 shadow-card">
        <p className="text-[0.875rem] leading-relaxed text-muted">
          Cyclops works overnight. Your morning brief, review queue and upcoming
          deadlines will land here — for now, the tracker has everything.
        </p>
        <a
          href="/tracker"
          className="mt-3 inline-block rounded-pill bg-ink px-4 py-2 text-[0.8125rem] font-extrabold text-canvas"
        >
          Open the tracker
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update hardcoded /dashboard references**

Run: `grep -rn '"/dashboard"' src/ --include=*.tsx --include=*.ts`
For every hit OUTSIDE `src/app/(app)/dashboard/page.tsx` (the redirect stub keeps none): replace `"/dashboard"` with `"/tracker"`, EXCEPT post-login/onboarding destinations which become `"/today"` (the new landing). Expected hits include: `src/components/app-header.tsx` (wordmark href — replaced anyway in Task 5), auth actions/login form redirects, onboarding completion redirect, landing page CTAs.

- [ ] **Step 5: Build and verify routes**

Run: `npm run build`
Expected: success; route list shows `/today`, `/tracker`, `/dashboard`, `/saved`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(gbplus): /today landing + /dashboard→/tracker rename with redirects"
```

---

### Task 5: AppNav — the GB+ shell header

**Files:**
- Create: `src/components/app-nav.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create the AppNav component**

```tsx
// src/components/app-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";
import { formatShortcut } from "@/lib/shortcuts";

const NAV: { href: string; label: string; badgeKey?: "today" | "applications" | "chat" }[] = [
  { href: "/today", label: "Today", badgeKey: "today" },
  { href: "/tracker", label: "Tracker" },
  { href: "/applications", label: "Applications", badgeKey: "applications" },
  { href: "/chat", label: "Ask Cyclops", badgeKey: "chat" },
  { href: "/memory", label: "Memory" },
];

export type NavBadges = { today: number; applications: number; chat: number };

export function AppNav({
  name,
  badges,
  activity,
}: {
  name: string;
  badges: NavBadges;
  /** Agent activity pill text, e.g. "worked overnight" | "idle". */
  activity: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kHint, setKHint] = useState("⌘K");
  const menuRef = useRef<HTMLDivElement>(null);

  // Platform-aware hint must render client-side (navigator).
  useEffect(() => setKHint(formatShortcut("mod+K")), []);

  // Close the avatar menu on outside click / esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm">
      <div className="flex items-center gap-2.5 px-5 py-2.5">
        <Link
          href="/today"
          className="font-display text-[1.0625rem] font-semibold text-ink"
        >
          cyclops<span className="text-accent">.</span>
        </Link>

        <nav aria-label="Primary" className="ml-3 flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const count = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  count > 0
                    ? `${item.label}, ${count} items need attention`
                    : item.label
                }
                className={cn(
                  "rounded-pill px-3 py-1.5 text-[0.8125rem] font-bold transition-colors",
                  active
                    ? "bg-ink text-canvas"
                    : "text-subtle hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
                {count > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "tabular ml-1.5 text-[0.6875rem]",
                      active ? "text-amber" : "text-accent",
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* ⌘K affordance — palette itself lands with the dock (Plan 3) */}
          <button
            type="button"
            className="label flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1.5 text-faint"
          >
            <span aria-hidden className="text-accent">
              ›
            </span>
            <span suppressHydrationWarning>{kHint}</span>
          </button>

          {/* Agent activity pill — click target becomes the activity log (Plan 4) */}
          <span className="label flex items-center gap-2 rounded-pill bg-surface-2 px-3 py-1.5 text-subtle">
            <span aria-hidden className="text-agent-mark">
              ●
            </span>
            {activity}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account: ${name}`}
              onClick={() => setMenuOpen((v) => !v)}
              className="tabular flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[0.6875rem] text-canvas"
            >
              {initials}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 w-44 rounded-control border border-border bg-surface py-1 shadow-pop"
              >
                <Link
                  role="menuitem"
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3.5 py-2 text-[0.8125rem] font-bold text-muted hover:bg-surface-2 hover:text-ink"
                >
                  Settings
                </Link>
                <form action={signOutAction}>
                  <button
                    role="menuitem"
                    type="submit"
                    className="block w-full px-3.5 py-2 text-left text-[0.8125rem] font-bold text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Wire it into the app layout**

Replace the contents of `src/app/(app)/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.onboarded) redirect("/onboarding");

  // Badge counts become live views over the attention store in Plan 2 (Phase C).
  const badges = { today: 0, applications: 0, chat: 0 };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav
        name={session.user.name ?? "You"}
        badges={badges}
        activity="idle"
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

Note: `savedCount`/`prisma` usage is removed (Saved left the nav). The old `src/components/app-header.tsx` is now unreferenced by the app shell — leave the file in place until Step 3 confirms nothing else imports it, then delete it.

- [ ] **Step 3: Remove dead components**

Run: `grep -rn "app-header\|AppHeader" src/ --include=*.tsx | grep -v app-header.tsx` and `grep -rn "status-bar\|StatusBar" src/ --include=*.tsx | grep -v status-bar.tsx`
If zero hits outside the component files themselves:

```bash
git rm src/components/app-header.tsx src/components/status-bar.tsx
```

If the landing page (`src/app/page.tsx`) imports StatusBar, leave `status-bar.tsx` and only remove `app-header.tsx`.

- [ ] **Step 4: Build + visual check**

Run: `npm run build`
Expected: success. Then `npm run dev`, log in, verify: light linen header with pills (Today active on /today), Ask Cyclops pill navigates to /chat, avatar menu opens with Settings + Sign out, no dark chrome bar, no footer status bar. Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(gbplus): GB+ shell — pill nav with Ask Cyclops, avatar menu, activity pill"
```

---

### Task 6: Sweep legacy visual idioms on app pages

**Files:**
- Modify: pages under `src/app/(app)/` and components under `src/components/tracker/`, `src/components/chat/` that reference removed idioms

- [ ] **Step 1: Find stragglers**

Run: `grep -rn "chrome\|sticky top-11\|animate-rise" "src/app/(app)" src/components --include=*.tsx`

- [ ] **Step 2: Apply mechanical fixes**

- Any `sticky top-11` (table headers positioned under the old 44px chrome bar): change to `sticky top-[3.25rem]` (new header height ≈52px).
- Any `.chrome`-styled in-app element (the chat page header, if any): replace `chrome` class with `border-b border-border bg-surface`.
- `h-[calc(100vh-2.75rem)]` (chat page full-height math against the old 44px header): change to `h-[calc(100vh-3.25rem)]`.
- Leave the marketing landing page (`src/app/page.tsx`) and `(auth)` pages untouched — they restyle via tokens alone in this plan.

- [ ] **Step 3: Build, test, eyeball every app route**

Run: `npm run build && npm test`
Expected: build success, test profile unchanged. Dev-server check each route: /today /tracker /applications /chat /memory /settings — readable, no overlapping sticky headers, no dark remnants.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(gbplus): sweep legacy chrome idioms and header-height offsets on app pages"
```

---

## Self-review checklist (run after writing, before executing)

1. **Spec coverage (Phases A+B only):** tokens ✓ (Task 2) · fonts ✓ (Task 1) · graceful old-token mapping ✓ · shell with Ask Cyclops pill ✓ (Task 5) · ⌘K stub ✓ · activity pill ✓ · avatar menu ✓ · route renames + redirects ✓ (Task 4) · shortcut service incl. win collision ✓ (Task 3) · esc-stack utility — deliberately deferred to Plan 3 where its first consumer (dock) lands (YAGNI).
2. **Placeholders:** none — every step has complete code or an exact command.
3. **Type consistency:** `NavBadges` keys match `badges` object in layout; `formatShortcut`/`matchesShortcut` signatures match tests; `signOutAction` import path matches old header's.
