import Link from "next/link";
import { auth } from "@/server/auth";

function dateLine(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })
    .toUpperCase();
}

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/London",
    }).format(new Date()),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const session = await auth();
  const first = (session?.user?.name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="label text-faint">{dateLine()}</p>
      <h1 className="mt-1 text-[1.75rem] text-ink">{greeting()}, {first}.</h1>
      {/* Interim state — the brief, queue and coming-up land in Plan 3 (Phase F). */}
      <div className="mt-5 rounded-card border border-border bg-surface p-5 shadow-card">
        <p className="text-[0.875rem] leading-relaxed text-muted">
          Cyclops works overnight. Your morning brief, review queue and upcoming
          deadlines will land here — for now, the tracker has everything.
        </p>
        <Link
          href="/tracker"
          className="mt-3 inline-block rounded-pill bg-ink px-4 py-2 text-[0.8125rem] font-extrabold text-canvas"
        >
          Open the tracker
        </Link>
      </div>
    </div>
  );
}
