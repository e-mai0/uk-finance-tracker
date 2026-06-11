import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db";
import { ROLE_FAMILIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
      {/* Dark command rail — nav + ticker stack into one black bar, like the desk */}
      <header className="chrome sticky top-0 z-40 border-b border-chrome-line">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-baseline gap-4">
            <span className="text-[1.1rem] font-extrabold tracking-tight text-white">
              Trackr<span className="text-amber">.</span>
            </span>
            <span className="label hidden text-[0.6rem] text-chrome-dim sm:inline">
              UK Finance · SU27
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

      <DemoTape />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Hero */}
        <section className="grid items-center gap-12 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="animate-rise flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-subtle">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              UK finance · Summer 2027 cycle
            </div>
            <h1 className="animate-rise mt-5 text-balance text-[2.7rem] leading-[1.04] text-ink sm:text-[3.4rem]">
              The disciplined desk for UK finance{" "}
              <em className="font-display italic text-accent">internships</em>.
            </h1>
            <p className="animate-rise mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              One dense terminal for every opening across investment banking,
              markets, asset management, private equity and quant — each scored{" "}
              <span className="font-mono text-ink">0–100</span> for how well it
              fits your background, with a plain-English why.
            </p>
            <div className="animate-rise mt-8 flex flex-wrap items-center gap-5">
              <Link href="/signup">
                <Button size="lg">Create your tracker</Button>
              </Link>
              <Link href="/login">
                <Button variant="link" size="lg">
                  I already have an account
                </Button>
              </Link>
            </div>
            <p className="mt-4 font-mono text-xs uppercase tracking-wider text-subtle">
              Free to start · no card required
            </p>
          </div>

          {/* Sample fit-score card — the product, in miniature */}
          <ScoreCard />
        </section>

        {/* Stat ribbon */}
        <section className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-4">
          <Stat value={`${opportunities || "45"}`} label="Live opportunities" />
          <Stat value={`${employers || "24"}`} label="Employers tracked" />
          <Stat value={`${ROLE_FAMILIES.length}`} label="Role families" />
          <Stat value="0" suffix="ML" label="Deterministic scoring" />
        </section>

        {/* Features — numbered editorial panels */}
        <section className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border pb-px sm:grid-cols-3">
          <Feature
            n="01"
            title="A desk, not a list"
            body="Sort, filter and scan dozens of roles at terminal density. Status, deadline pressure and fit, readable in one glance — no twelve open tabs."
          />
          <Feature
            n="02"
            title="Transparent fit scores"
            body="Every 0–100 score breaks down into the exact factors behind it — degree, timing, location, target firms. You see the maths, not a vibe."
          />
          <Feature
            n="03"
            title="Built to apply"
            body="Save roles, watch deadlines count down, and let the copilot draft tailored cover material grounded in your CV. You review and submit."
          />
        </section>
      </main>

      <footer className="mt-20 border-t border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 font-mono text-[0.7rem] uppercase tracking-wider text-subtle">
          <span>Trackr — UK finance internships</span>
          <span className="hidden sm:inline">
            Original product · not affiliated with any employer listed
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A live-style tape across the top of the landing — the product's signature,
 *  previewed. CSS marquee (globals.css), pauses on hover, halts on reduced
 *  motion. Sample positions; the real desk renders your tracked roles. */
function DemoTape() {
  const up = "text-[#46c178]";
  const down = "text-[#f0584f]";
  const lanes = [
    ["MERC", "▲", up, "12d"],
    ["BLAC", "▲", up, "8d"],
    ["LAZ", "◆", "text-amber", "SOON"],
    ["GRNH", "▲", up, "21d"],
    ["HLVR", "▼", down, "3d"],
    ["ARDN", "▲", up, "16d"],
    ["WLTN", "▲", up, "9d"],
    ["KEST", "◆", "text-amber", "SOON"],
    ["BRYN", "▲", up, "27d"],
    ["CALD", "▲", up, "5d"],
    ["ORML", "▼", down, "2d"],
    ["VANE", "▲", up, "18d"],
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
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
          <span className="label text-[0.6rem] text-chrome-ink-2">Live tape</span>
        </div>
        <div className="ticker relative min-w-0 flex-1 overflow-hidden">
          <div className="ticker-track" style={{ "--ticker-duration": "46s" } as CSSProperties}>
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

function ScoreCard() {
  const reasons = [
    ["+30", "Matches your interest in Investment Banking"],
    ["+20", "London is one of your preferred cities"],
    ["+15", "On your target-employer shortlist"],
    ["+15", "Graduating 2028 fits the summer cycle"],
  ];
  return (
    <div className="animate-rise overflow-hidden rounded-[var(--radius-card)] border border-border-strong bg-surface shadow-[var(--shadow-pop)]">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-accent">
              HELC
            </span>
            <span className="text-sm font-semibold text-ink">
              Helvar Capital
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-wide text-subtle">
            Investment Banking · Summer Analyst
          </div>
        </div>
        <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-wide text-success">
          Strong fit
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-5xl font-semibold leading-none text-accent">
            88
          </span>
          <span className="font-mono text-sm text-subtle">/100</span>
        </div>
        <div
          className="mt-3 h-2 w-full"
          style={{
            background:
              "repeating-linear-gradient(90deg, var(--color-border-strong) 0 4px, transparent 4px 5px)",
          }}
        >
          <div
            className="h-full"
            style={{
              width: "88%",
              background:
                "repeating-linear-gradient(90deg, var(--color-accent) 0 4px, transparent 4px 5px)",
            }}
          />
        </div>
        <ul className="mt-4 space-y-2">
          {reasons.map(([pts, why]) => (
            <li key={why} className="flex gap-3 text-xs text-muted">
              <span className="font-mono font-semibold text-success">{pts}</span>
              <span>{why}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-2.5 font-mono text-[0.62rem] uppercase tracking-wider text-subtle">
        <span>Deterministic · no ML</span>
        <span>Deadline · 11 Jul</span>
      </div>
    </div>
  );
}

function Stat({
  value,
  suffix,
  label,
}: {
  value: string;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="bg-surface px-5 py-5">
      <div className="tabular text-3xl font-semibold tracking-tight text-ink">
        {value}
        {suffix && <span className="ml-1 text-lg text-accent">{suffix}</span>}
      </div>
      <div className="mt-1.5 font-mono text-[0.68rem] uppercase tracking-wider text-subtle">
        {label}
      </div>
    </div>
  );
}

function Feature({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-surface p-6">
      <div className="font-mono text-xs font-semibold tracking-wider text-accent">
        {n}
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
