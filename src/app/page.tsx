import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { prisma } from "@/server/db";
import { ROLE_FAMILIES } from "@/lib/constants";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/dashboard" : "/onboarding");
  }

  const [employers, opportunities] = await Promise.all([
    prisma.employer.count().catch(() => 0),
    prisma.opportunity.count().catch(() => 0),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Brand href={null} />
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6">
        <section className="flex max-w-3xl flex-col items-center pt-20 text-center sm:pt-28">
          <span className="animate-rise mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-[var(--shadow-card)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            UK finance · Summer 2027 cycle · live
          </span>
          <h1 className="animate-rise text-balance text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">
            The disciplined tracker for UK finance{" "}
            <em className="font-display italic text-accent">summer internships</em>
          </h1>
          <p className="animate-rise mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Browse every opening across investment banking, markets, asset
            management, private equity and quant — ranked by how well each role{" "}
            <em className="font-display italic text-ink">fits</em> your
            background. Built for ambitious students who want signal, not noise.
          </p>
          <div className="animate-rise mt-9 flex items-center gap-3">
            <Link href="/signup">
              <Button size="lg">Create your tracker</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                I already have an account
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-subtle">
            Free to start · No card required
          </p>
        </section>

        <section className="mt-16 grid w-full max-w-3xl grid-cols-3 gap-4">
          <Stat value={`${opportunities || "40+"}`} label="Live opportunities" />
          <Stat value={`${employers || "20+"}`} label="Employers tracked" />
          <Stat value={`${ROLE_FAMILIES.length}`} label="Role families" />
        </section>

        <section className="mt-16 grid w-full max-w-4xl gap-4 pb-20 sm:grid-cols-3">
          <Feature
            title="A dashboard, not a list"
            body="Dense, sortable and searchable. Filter by status, location, division and deadline in one sticky bar."
          />
          <Feature
            title="Personalized fit scores"
            body="Every role is scored 0–100 against your degree, timing, location and target firms — with a plain-English why."
          />
          <Feature
            title="Built to apply, not browse"
            body="Save roles, track deadlines, and focus your effort where you have the strongest shot."
          />
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 text-xs text-subtle">
          <span>Trackr — UK finance internships</span>
          <span>Original product · not affiliated with any employer listed</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-4 py-5 text-center shadow-[var(--shadow-card)]">
      <div className="text-[1.75rem] font-medium tracking-tight text-ink tabular">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]">
      <h3 className="font-display text-base font-medium text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
