import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import { resolveGardenerQuestionForm } from "@/server/actions/attention";
import { MemoryEditor } from "./memory-editor";
import type { MemoryRevision } from "./memory-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memory — Trackr" };

// Canonical files shown first, in order
const CANONICAL_ORDER = ["profile.md", "voice.md", "strategy.md"];

// Prefix-based grouping for the sidebar
function groupFiles(files: { path: string }[]) {
  const canonical: typeof files = [];
  const stories: typeof files = [];
  const companies: typeof files = [];
  const other: typeof files = [];

  for (const f of files) {
    if (CANONICAL_ORDER.includes(f.path)) {
      canonical.push(f);
    } else if (f.path.startsWith("stories/")) {
      stories.push(f);
    } else if (f.path.startsWith("companies/")) {
      companies.push(f);
    } else {
      other.push(f);
    }
  }

  // Sort canonical by prescribed order
  canonical.sort(
    (a, b) => CANONICAL_ORDER.indexOf(a.path) - CANONICAL_ORDER.indexOf(b.path),
  );

  return { canonical, stories, companies, other };
}

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  // Coerce string | string[] → string | undefined
  const fParam = Array.isArray(sp.f) ? sp.f[0] : sp.f;

  // Seeds canonical files on first visit
  const files = await memoryService.list(userId);

  // Open gardener questions — surfaced above the editor until answered or
  // dismissed. The table predates the gardener SQL being applied everywhere,
  // so tolerate its absence.
  const pendingQuestions = await prisma.gardenerQuestion
    .findMany({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 5,
    })
    .catch(() => []);

  const { canonical, stories, companies, other } = groupFiles(files);
  const allOrdered = [...canonical, ...stories, ...companies, ...other];

  // Determine active file
  const DEFAULT_PATH = "profile.md";
  const activePath =
    fParam && files.some((f) => f.path === fParam)
      ? fParam
      : (files.find((f) => f.path === DEFAULT_PATH)?.path ??
         allOrdered[0]?.path ??
         null);

  const activeFile = activePath
    ? files.find((f) => f.path === activePath) ?? null
    : null;

  // Load revisions for the active file (capped at 20)
  const rawRevisions = activeFile
    ? await memoryService.revisions(userId, activeFile.path, 20)
    : [];
  const revisions: MemoryRevision[] = rawRevisions.map((r) => ({
    id: r.id,
    author: r.author,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));

  // Determine updatedAt for the editor key — use first revision's timestamp or now
  const updatedAt =
    rawRevisions[0]?.createdAt.toISOString() ?? new Date(0).toISOString();

  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Cyclops wants to know — open gardener questions, agent surface. */}
      {pendingQuestions.length > 0 && (
        <section className="shrink-0 border-b border-border bg-canvas px-4 py-3">
          <div className="rounded-card border border-border border-l-[3px] border-l-agent-mark bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="label rounded-pill bg-accent-soft px-2.5 py-0.5 text-accent">
                ◆ CYCLOPS WANTS TO KNOW
              </span>
              <span className="tabular label ml-auto text-faint">
                {pendingQuestions.length}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {pendingQuestions.map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-4 py-2.5">
                  <p className="min-w-0 flex-1 text-[0.875rem] text-ink">
                    {q.question}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href={`/chat?prefill=${encodeURIComponent(q.question)}`}
                      className="rounded-pill border border-border-interactive bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2"
                    >
                      Answer in chat
                    </Link>
                    <form action={resolveGardenerQuestionForm.bind(null, q.id)}>
                      <button
                        type="submit"
                        className="label min-h-6 px-1.5 py-1 text-subtle transition-colors hover:text-ink"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left rail — file list */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface sm:flex">
        {/* Heading */}
        <div className="border-b border-border px-3 py-2.5">
          <p className="label text-subtle">Cyclops</p>
          <p className="font-mono text-[0.78rem] text-ink">
            What Cyclops knows
          </p>
        </div>

        {/* File list */}
        <nav
          className="flex-1 overflow-y-auto py-1"
          aria-label="Memory files"
        >
          {/* Canonical group */}
          {canonical.length > 0 && (
            <>
              <div className="px-3 pb-0.5 pt-2">
                <span className="label uppercase tracking-widest text-faint">
                  Profile
                </span>
              </div>
              {canonical.map((f) => (
                <FileLink
                  key={f.path}
                  path={f.path}
                  isActive={f.path === activePath}
                />
              ))}
            </>
          )}

          {/* Stories group */}
          {stories.length > 0 && (
            <>
              <div className="px-3 pb-0.5 pt-3">
                <span className="label uppercase tracking-widest text-faint">
                  Stories
                </span>
              </div>
              {stories.map((f) => (
                <FileLink
                  key={f.path}
                  path={f.path}
                  isActive={f.path === activePath}
                />
              ))}
            </>
          )}

          {/* Companies group */}
          {companies.length > 0 && (
            <>
              <div className="px-3 pb-0.5 pt-3">
                <span className="label uppercase tracking-widest text-faint">
                  Companies
                </span>
              </div>
              {companies.map((f) => (
                <FileLink
                  key={f.path}
                  path={f.path}
                  isActive={f.path === activePath}
                />
              ))}
            </>
          )}

          {/* Other */}
          {other.length > 0 && (
            <>
              <div className="px-3 pb-0.5 pt-3">
                <span className="label uppercase tracking-widest text-faint">
                  Other
                </span>
              </div>
              {other.map((f) => (
                <FileLink
                  key={f.path}
                  path={f.path}
                  isActive={f.path === activePath}
                />
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2">
          <span className="label text-faint">
            Memory · {files.length} file{files.length !== 1 ? "s" : ""}
          </span>
        </div>
      </aside>

      {/* Main pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Pane header */}
        <div className="flex items-center border-b border-border bg-surface px-4 py-2">
          <div className="flex items-baseline gap-2">
            <span className="label text-subtle">Memory</span>
            <span className="truncate font-mono text-[0.78rem] text-ink">
              {activePath ?? "—"}
            </span>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeFile ? (
            <MemoryEditor
              key={`${activeFile.path}:${updatedAt}`}
              path={activeFile.path}
              content={activeFile.content}
              revisions={revisions}
            />
          ) : (
            <p className="font-mono text-sm text-muted">
              No memory files found.
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sidebar file link — extracted to keep JSX readable
// ---------------------------------------------------------------------------
function FileLink({ path, isActive }: { path: string; isActive: boolean }) {
  // Strip directory prefix for display label
  const label = path.includes("/") ? path.split("/").pop() ?? path : path;

  return (
    <Link
      href={`/memory?f=${encodeURIComponent(path)}`}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "block border-l-2 border-accent bg-accent-tint px-3 py-2"
          : "block border-l-2 border-transparent px-3 py-2 hover:bg-surface-2"
      }
    >
      <span className="block truncate font-mono text-[0.72rem] text-ink">
        {label}
      </span>
      {path.includes("/") && (
        <span className="block truncate font-mono text-[0.6875rem] text-faint">
          {path}
        </span>
      )}
    </Link>
  );
}
