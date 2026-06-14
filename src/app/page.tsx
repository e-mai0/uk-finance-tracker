import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db";
import { cn } from "@/lib/utils";
import { Reveal } from "./_landing/reveal";
import type { CSSProperties } from "react";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/today" : "/onboarding");
  }

  const [employers, opportunities] = await Promise.all([
    prisma.employer.count().catch(() => 0),
    prisma.opportunity.count().catch(() => 0),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Dark command rail — header + live tape stack into one warm-ink bar, the desk
          chrome bleeding into the marketing page. */}
      <header className="chrome sticky top-0 z-40 border-b border-chrome-line">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-baseline gap-4">
            <span className="text-[1.1rem] font-extrabold tracking-tight text-white">
              Cyclops<span className="text-amber">.</span>
            </span>
            <span className="label hidden text-[0.6rem] text-chrome-dim sm:inline">
              Application OS · UK Finance
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="label px-2.5 py-1.5 text-[0.62rem] text-chrome-ink-2 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <CoverageTape />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="grid items-center gap-12 pb-8 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="animate-rise flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.18em] text-subtle">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-good-mark" />
              One eye, always open · Summer 2027 cycle
            </div>
            <h1
              className="animate-rise mt-5 text-balance text-[2.6rem] leading-[1.03] text-ink sm:text-[3.45rem]"
              style={{ animationDelay: "60ms" }}
            >
              The application OS that{" "}
              <em className="font-display italic text-accent">watches</em> finance
              so you don&apos;t have to.
            </h1>
            <p
              className="animate-rise mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              Cyclops tracks every UK internship across the major banks and funds,
              scores each <span className="font-mono text-ink">0–100</span> for how
              well it fits you, and drafts answers in your voice overnight — then
              brings you only the decisions that actually need you.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap items-center gap-5"
              style={{ animationDelay: "180ms" }}
            >
              <Link href="/signup">
                <Button size="lg">Open your desk</Button>
              </Link>
              <Link href="/login">
                <Button variant="link" size="lg">
                  I already have an account
                </Button>
              </Link>
            </div>
            <p
              className="animate-rise mt-4 font-mono text-xs uppercase tracking-wider text-subtle"
              style={{ animationDelay: "240ms" }}
            >
              Free to start · no card · never auto-submits
            </p>
          </div>

          {/* The product, in miniature — a live desk with one agent-flagged row and
              a floating proposal card. The whole loop in one frame. */}
          <HeroDesk />
        </section>

        {/* ── The daily loop ───────────────────────────────────────────────── */}
        <Reveal className="mt-24 sm:mt-28">
          <SectionHead
            kicker="The daily loop"
            title="Four moves, run every night while you sleep."
          />
          <div className="mt-8 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <LoopStep
              n="01"
              glyph="●"
              glyphTone="text-good-mark"
              title="Watch"
              body="Cyclops polls every firm's careers system on a 6-hour cycle. New roles, status changes and closing deadlines — caught the moment they post."
            />
            <LoopStep
              n="02"
              glyph="▦"
              glyphTone="text-ink"
              title="Score"
              body="Each role earns a deterministic 0–100 fit against your degree, timing, location and target firms. No ML black box — you see the exact maths."
            />
            <LoopStep
              n="03"
              glyph="◆"
              glyphTone="text-accent"
              title="Draft"
              body="Overnight, the agent researches the firms closing soonest and drafts answers grounded in your own stories and writing voice."
              agent
            />
            <LoopStep
              n="04"
              glyph="→"
              glyphTone="text-ink"
              title="Decide"
              body="You wake to a one-screen brief: the few proposals, questions and deadlines that need you. Apply, edit first, or skip."
            />
          </div>
        </Reveal>

        {/* ── The surfaces ─────────────────────────────────────────────────── */}
        <Reveal className="mt-24 sm:mt-28">
          <SectionHead
            kicker="Inside the OS"
            title="Six surfaces. One model of you."
            lede="Every part of Cyclops feeds the same private memory — the more you use it, the more it sounds and decides like you."
          />
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <SurfacePanel
              tag="The Desk · Tracker"
              title="A desk, not a list"
              body="Sort, filter and scan dozens of live roles at terminal density. Status, deadline pressure and fit, readable in a single glance — not twelve open tabs."
            >
              <DeskRows />
            </SurfacePanel>
          </Reveal>

          <Reveal delay={80}>
            <SurfacePanel
              tag="The Agent · Ask Cyclops"
              title="An analyst who never sleeps"
              body="Ask in plain English. The agent reads your memory, researches the firm, checks fit and drafts the answer — showing every step it took."
            >
              <AgentTrace />
            </SurfacePanel>
          </Reveal>

          <Reveal>
            <SurfacePanel
              tag="Memory"
              title="Every draft sounds like you"
              body="Your stories, voice and strategy live in plain files you can read and edit. Cyclops writes from them — and asks before it assumes."
            >
              <MemoryCard />
            </SurfacePanel>
          </Reveal>

          <Reveal delay={80}>
            <SurfacePanel
              tag="Apply · Browser extension"
              title="One click to autofill"
              body="Known application forms fill in under a second from your apply profile and answer bank. The submit button stays yours — Cyclops never presses it."
            >
              <AutofillCard />
            </SurfacePanel>
          </Reveal>
        </div>

        {/* ── Control manifesto ────────────────────────────────────────────── */}
        <Reveal className="mt-24 sm:mt-28">
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
            <div className="border-b border-hairline px-6 py-10 text-center sm:px-10 sm:py-14">
              <p className="label text-faint">The line Cyclops won&apos;t cross</p>
              <h2 className="mx-auto mt-4 max-w-2xl text-balance text-[2rem] leading-[1.08] text-ink sm:text-[2.6rem]">
                It drafts, scores and researches.{" "}
                <span className="text-accent">You</span> click submit.
              </h2>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-3">
              <Pledge
                title="Scores you can audit"
                body="Fit is arithmetic, not a vibe. Every point traces back to a fact about you — degree, cycle, city, shortlist."
              />
              <Pledge
                title="You own your memory"
                body="The model of you is a folder of files you can read, edit, correct or delete. Nothing about you is locked away."
              />
              <Pledge
                title="You approve every send"
                body="The extension autofills and the agent drafts — but no application, message or form is ever submitted without you."
              />
            </div>
          </section>
        </Reveal>

        {/* ── Stat ribbon ──────────────────────────────────────────────────── */}
        <Reveal className="mt-16">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-4">
            <Stat value={`${employers || "24"}`} label="Firms watched" />
            <Stat value="13" label="ATS adapters" />
            <Stat value={`${opportunities || "45"}`} label="Live openings" />
            <Stat value="0" label="Auto-submits, ever" agent />
          </section>
          <p className="mt-3 px-1 font-mono text-[0.66rem] uppercase tracking-wider text-faint">
            Goldman Sachs · J.P. Morgan · Morgan Stanley · Barclays · BlackRock ·
            Citi · UBS · Schroders · Jane Street · Citadel · Point72 · Macquarie · &
            more
          </p>
        </Reveal>
      </main>

      {/* ── Closing CTA — back onto the dark rail ──────────────────────────── */}
      <section className="chrome mt-24 border-t border-chrome-line">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-24">
          <Reveal>
            <p className="label text-chrome-dim">Cyclops · Application OS</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-balance text-[2.1rem] leading-[1.07] text-chrome-ink sm:text-[2.9rem]">
              Point one eye at the City.
              <br className="hidden sm:block" /> Spend yours on getting the offer.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-pretty text-chrome-ink-2">
              Build your tracker in two minutes. Cyclops takes the first night
              shift tonight.
            </p>
            <div className="mt-8 flex items-center justify-center gap-5">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-pill bg-canvas px-6 text-[0.85rem] font-extrabold text-ink transition-colors hover:bg-white"
              >
                Open your desk
              </Link>
              <Link
                href="/login"
                className="label text-[0.62rem] text-chrome-ink-2 transition-colors hover:text-white"
              >
                Sign in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 font-mono text-[0.7rem] uppercase tracking-wider text-subtle">
          <span>
            Cyclops<span className="text-accent">.</span> — UK finance application OS
          </span>
          <span className="hidden sm:inline">
            Original product · not affiliated with any employer listed
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Live coverage tape — the product's signature, previewed. CSS marquee
   (globals.css), pauses on hover, halts under reduced motion. Real firm
   tickers; the desk renders your tracked roles.
───────────────────────────────────────────────────────────────────────── */
function CoverageTape() {
  const up = "text-[#46c178]";
  const down = "text-[#f0584f]";
  const lanes = [
    ["GS", "▲", up, "14d"],
    ["MS", "▲", up, "9d"],
    ["JPM", "◆", "text-amber", "SOON"],
    ["BARC", "▲", up, "22d"],
    ["BLK", "▼", down, "3d"],
    ["CITI", "▲", up, "17d"],
    ["UBS", "▲", up, "11d"],
    ["JANE", "◆", "text-amber", "SOON"],
    ["CTDL", "▲", up, "26d"],
    ["P72", "▼", down, "2d"],
    ["SCHR", "▲", up, "19d"],
    ["MACQ", "▲", up, "8d"],
    ["NOM", "▼", down, "4d"],
    ["DB", "▲", up, "15d"],
  ] as const;

  const Cell = ({
    code,
    glyph,
    tone,
    chg,
  }: {
    code: string;
    glyph: string;
    tone: string;
    chg: string;
  }) => (
    <span className="inline-flex items-center gap-2 px-4 py-1.5">
      <span className="tabular text-[0.74rem] font-semibold tracking-wide text-amber">
        {code}
      </span>
      <span className={cn("text-[0.66rem] leading-none", tone)}>{glyph}</span>
      <span className={cn("tabular text-[0.72rem]", tone)}>{chg}</span>
      <span aria-hidden className="ml-2 text-chrome-line">
        │
      </span>
    </span>
  );

  const run = (k: string, hidden: boolean) => (
    <div aria-hidden={hidden} className="flex shrink-0 items-center">
      {lanes.map(([code, glyph, tone, chg]) => (
        <Cell key={`${k}-${code}`} code={code} glyph={glyph} tone={tone} chg={chg} />
      ))}
    </div>
  );

  return (
    <div className="chrome border-b border-chrome-line">
      <div className="mx-auto flex max-w-6xl items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-chrome-line px-4">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-good-mark" />
          <span className="label text-[0.6rem] text-chrome-ink-2">Live coverage</span>
        </div>
        <div className="ticker relative min-w-0 flex-1 overflow-hidden">
          <div
            className="ticker-track"
            style={{ "--ticker-duration": "52s" } as CSSProperties}
          >
            {run("a", false)}
            {run("b", true)}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-chrome to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-chrome to-transparent" />
        </div>
      </div>
    </div>
  );
}

/* ── Hero product visual ─────────────────────────────────────────────────── */

const TIER: Record<string, { text: string; bar: string }> = {
  strong: { text: "text-success", bar: "var(--color-tier-strong)" },
  good: { text: "text-accent", bar: "var(--color-tier-good)" },
  moderate: { text: "text-warning", bar: "var(--color-tier-mod)" },
};

function FitMeter({ fit, tier }: { fit: number; tier: keyof typeof TIER }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 overflow-hidden rounded-bar"
        style={{
          background:
            "repeating-linear-gradient(90deg, var(--color-border-strong) 0 4px, transparent 4px 5px)",
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${fit}%`,
            background: `repeating-linear-gradient(90deg, ${TIER[tier].bar} 0 4px, transparent 4px 5px)`,
          }}
        />
      </div>
      <span className={cn("tabular text-[0.78rem]", TIER[tier].text)}>{fit}</span>
    </div>
  );
}

function HeroDesk() {
  const rows = [
    { code: "GS", firm: "Goldman Sachs", role: "IBD Summer Analyst", status: "Open", tone: "text-success", fit: 91, tier: "strong" as const, agent: false },
    { code: "JPM", firm: "J.P. Morgan", role: "Markets Summer", status: "Open", tone: "text-success", fit: 84, tier: "strong" as const, agent: false },
    { code: "CTDL", firm: "Citadel", role: "Quant Research", status: "Soon", tone: "text-warning", fit: 76, tier: "good" as const, agent: true },
    { code: "SCHR", firm: "Schroders", role: "Asset Mgmt Intern", status: "Open", tone: "text-success", fit: 67, tier: "moderate" as const, agent: false },
  ];

  return (
    <div className="animate-rise relative" style={{ animationDelay: "160ms" }}>
      {/* Desk panel */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-strong bg-surface shadow-[var(--shadow-pop)]">
        {/* Panel head — mimics the desk chrome */}
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="label text-faint">Tracker · 45 live</span>
          <span className="relative flex items-center gap-1.5 overflow-hidden">
            <span className="scanline pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-transparent via-[var(--color-agent-mark)]/25 to-transparent" />
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-good-mark" />
            <span className="label text-[0.6rem] text-subtle">scanning</span>
          </span>
        </div>

        {/* Column heads */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline bg-surface-3 px-4 py-1.5">
          <span className="label text-[0.6rem] text-faint">Firm</span>
          <span className="label text-[0.6rem] text-faint">Role</span>
          <span className="label text-[0.6rem] text-faint text-right">Fit</span>
        </div>

        {/* Rows */}
        {rows.map((r) => (
          <div
            key={r.code}
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0",
              r.agent ? "bg-accent-tint" : "hover:bg-surface-2",
            )}
            style={
              r.agent
                ? { boxShadow: "inset 3px 0 0 var(--color-agent-mark)" }
                : undefined
            }
          >
            <div className="flex w-[4.5rem] items-center gap-1.5">
              {r.agent && (
                <span aria-hidden className="text-[0.7rem] text-accent">
                  ◆
                </span>
              )}
              <span className="tabular text-[0.8rem] text-accent">{r.code}</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[0.82rem] font-bold text-ink">
                {r.firm}
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[0.66rem] text-subtle">
                  {r.role}
                </span>
                <span
                  className={cn(
                    "tabular text-[0.62rem] uppercase tracking-wide",
                    r.tone,
                  )}
                >
                  {r.status}
                </span>
              </div>
            </div>
            <FitMeter fit={r.fit} tier={r.tier} />
          </div>
        ))}
      </div>

      {/* Floating proposal card — the agent's offer, overlapping the desk */}
      <div className="mt-4 rounded-[var(--radius-card)] border border-border-agent bg-surface shadow-[var(--shadow-pop)] lg:absolute lg:-bottom-10 lg:-left-8 lg:mt-0 lg:w-[19rem]">
        <div className="flex items-center gap-2 border-b border-border-agent px-4 py-2.5">
          <span aria-hidden className="text-[0.8rem] text-accent">
            ◆
          </span>
          <span className="text-[0.78rem] font-bold text-accent">Cyclops</span>
          <span className="label ml-auto text-[0.58rem] text-faint">drafted 04:12</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[0.72rem] leading-relaxed text-muted">
            Drafted your{" "}
            <span className="font-bold text-ink">&ldquo;Why Citadel?&rdquo;</span>{" "}
            answer from your options-pricing project and markets internship.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-pill bg-ink px-3 text-[0.7rem] font-extrabold text-canvas">
              Apply ⌘⏎
            </span>
            <span className="inline-flex h-7 items-center rounded-pill border border-border-interactive px-3 text-[0.7rem] font-bold text-ink">
              Edit first
            </span>
            <span className="inline-flex h-7 items-center px-2 text-[0.7rem] font-bold text-subtle">
              Skip
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section scaffolding ─────────────────────────────────────────────────── */

function SectionHead({
  kicker,
  title,
  lede,
}: {
  kicker: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="label text-accent">{kicker}</p>
      <h2 className="mt-3 text-balance text-[1.9rem] leading-[1.1] text-ink sm:text-[2.4rem]">
        {title}
      </h2>
      {lede && (
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted">
          {lede}
        </p>
      )}
    </div>
  );
}

function LoopStep({
  n,
  glyph,
  glyphTone,
  title,
  body,
  agent,
}: {
  n: string;
  glyph: string;
  glyphTone: string;
  title: string;
  body: string;
  agent?: boolean;
}) {
  return (
    <div className={cn("bg-surface p-6", agent && "bg-accent-tint")}>
      <div className="flex items-center justify-between">
        <span className="tabular text-[0.72rem] text-faint">{n}</span>
        <span aria-hidden className={cn("text-sm leading-none", glyphTone)}>
          {glyph}
        </span>
      </div>
      <h3 className="mt-5 text-[1.05rem] font-bold text-ink">{title}</h3>
      <p className="mt-2 text-[0.84rem] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function SurfacePanel({
  tag,
  title,
  body,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="px-6 pt-6">
        <p className="label text-faint">{tag}</p>
        <h3 className="mt-3 text-[1.25rem] font-bold text-ink">{title}</h3>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">{body}</p>
      </div>
      <div className="mt-5 flex-1 px-6 pb-6">{children}</div>
    </div>
  );
}

function Pledge({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-surface px-6 py-7">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-success">
          ✓
        </span>
        <h3 className="text-[0.95rem] font-bold text-ink">{title}</h3>
      </div>
      <p className="mt-2 text-[0.84rem] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Stat({
  value,
  label,
  agent,
}: {
  value: string;
  label: string;
  agent?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-6">
      <div
        className={cn(
          "tabular text-3xl font-semibold tracking-tight",
          agent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-subtle">
        {label}
      </div>
    </div>
  );
}

/* ── Surface mini-UIs ────────────────────────────────────────────────────── */

function DeskRows() {
  const rows = [
    { code: "MS", role: "S&T Summer", status: "Open", tone: "text-success", fit: 88, tier: "strong" as const },
    { code: "BARC", role: "IBD Spring Week", status: "Soon", tone: "text-warning", fit: 73, tier: "good" as const },
    { code: "BLK", role: "Aladdin Intern", status: "Closing", tone: "text-danger", fit: 61, tier: "moderate" as const },
  ];
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline">
      {rows.map((r, i) => (
        <div
          key={r.code}
          className={cn(
            "grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5",
            i < rows.length - 1 && "border-b border-hairline",
          )}
        >
          <span className="tabular w-12 text-[0.76rem] text-accent">{r.code}</span>
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.78rem] font-bold text-ink">
              {r.role}
            </span>
            <span
              className={cn(
                "tabular text-[0.6rem] uppercase tracking-wide",
                r.tone,
              )}
            >
              {r.status}
            </span>
          </div>
          <FitMeter fit={r.fit} tier={r.tier} />
        </div>
      ))}
    </div>
  );
}

function AgentTrace() {
  const steps = [
    ["read memory", "voice.md · stories/markets-internship"],
    ["research", "Citadel · 2027 quant cycle"],
    ["fit check", "76 / 100 · good"],
    ["draft", "answer · 148 words"],
  ];
  return (
    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-2 p-3">
      <div className="space-y-1.5">
        {steps.map(([tool, detail], i) => (
          <div key={tool} className="flex items-center gap-2 text-[0.72rem]">
            <span aria-hidden className="text-accent">
              ◆
            </span>
            <span className="tabular text-subtle">{tool}</span>
            <span className="truncate font-mono text-[0.66rem] text-faint">
              {detail}
            </span>
            {i === steps.length - 1 && (
              <span className="ml-auto text-success" aria-hidden>
                ✓
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2.5 border-t border-hairline pt-2.5 font-mono text-[0.66rem] text-muted">
        <span className="text-accent">Cyclops&nbsp;</span>
        Drafted · grounded in 2 of your stories
        <span className="caret ml-0.5 text-accent">▍</span>
      </div>
    </div>
  );
}

function MemoryCard() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-3 py-2">
        <span className="tabular text-[0.66rem] text-subtle">stories/</span>
        <span className="text-[0.74rem] font-bold text-ink">
          options-pricing-project.md
        </span>
      </div>
      <div className="px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {["quant", "markets", "self-taught"].map((t) => (
            <span
              key={t}
              className="tabular rounded-pill bg-surface-3 px-2 py-0.5 text-[0.62rem] text-subtle"
            >
              {t}
            </span>
          ))}
          <span className="tabular rounded-pill bg-success-soft px-2 py-0.5 text-[0.62rem] text-success">
            confidence · high
          </span>
        </div>
        <p className="mt-3 font-mono text-[0.7rem] leading-relaxed text-muted">
          Built a Black–Scholes pricer in Python to settle a desk debate; backtested
          against live option chains over a vacation.
        </p>
      </div>
    </div>
  );
}

function AutofillCard() {
  const fields = [
    ["Full name", "Ada Whitfield"],
    ["University", "Cambridge · Economics"],
    ["Right to work", "UK citizen"],
  ];
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline">
      <div className="space-y-2.5 px-3 py-3">
        {fields.map(([label, val]) => (
          <div key={label}>
            <div className="label text-[0.58rem] text-faint">{label}</div>
            <div className="mt-1 flex items-center justify-between rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2.5 py-1.5">
              <span className="text-[0.74rem] text-ink">{val}</span>
              <span className="text-success" aria-hidden>
                ✓
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-hairline bg-surface-2 px-3 py-2 font-mono text-[0.62rem] uppercase tracking-wide text-subtle">
        <span>Autofilled · 0.8s</span>
        <span className="text-accent">Review &amp; submit · yours</span>
      </div>
    </div>
  );
}
