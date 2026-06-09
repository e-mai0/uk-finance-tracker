import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { CyclopsChat } from "./cyclops-chat";
import { createThread } from "./actions";
import { rowToUIMessage } from "@/server/chat/messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cyclops — Trackr" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  // item 6: coerce string | string[] → string | undefined
  const tParam = Array.isArray(sp.t) ? sp.t[0] : sp.t;

  // Load up to 50 threads, newest first
  const threads = await prisma.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // No threads at all → create one and redirect
  if (threads.length === 0) {
    const created = await prisma.chatSession.create({
      data: { userId },
    });
    redirect(`/chat?t=${created.id}`);
  }

  // No `t` param → redirect to newest thread
  if (!tParam) {
    redirect(`/chat?t=${threads[0]!.id}`);
  }

  // Load the active thread (ownership-scoped)
  const activeThread = await prisma.chatSession.findFirst({
    where: { id: tParam, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Thread not found or doesn't belong to user → redirect to newest
  if (!activeThread) {
    redirect(`/chat?t=${threads[0]!.id}`);
  }

  // Map stored messages to UIMessages (shared helper — item 11)
  const initialMessages = activeThread.messages.map(rowToUIMessage);

  return (
    <div className="animate-rise flex h-[calc(100vh-2.75rem)] overflow-hidden">
      {/* Left rail — thread list */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface sm:flex">
        {/* New conversation */}
        <div className="border-b border-border px-3 py-2.5">
          <form action={createThread}>
            <button
              type="submit"
              className="label w-full border border-border px-2.5 py-1.5 text-left text-[0.62rem] text-accent transition-colors hover:border-accent hover:bg-accent-tint"
            >
              <span aria-hidden className="mr-1 text-accent">
                +
              </span>
              New conversation
            </button>
          </form>
        </div>

        {/* Thread list */}
        <nav className="flex-1 overflow-y-auto py-1" aria-label="Conversations">
          {threads.map((t) => {
            const isActive = t.id === activeThread.id;
            return (
              <Link
                key={t.id}
                href={`/chat?t=${t.id}`}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "block border-l-2 border-accent bg-accent-tint px-3 py-2"
                    : "block border-l-2 border-transparent px-3 py-2 hover:bg-surface-2"
                }
              >
                <span className="block truncate font-mono text-[0.72rem] text-ink">
                  {t.title}
                </span>
                <span className="block font-mono text-[0.58rem] text-subtle">
                  {t.updatedAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer label */}
        <div className="border-t border-border px-3 py-2">
          <span className="label text-[0.58rem] text-faint">Cyclops · AI</span>
        </div>
      </aside>

      {/* Main chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Pane header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="flex items-baseline gap-2">
            <span className="label text-[0.6rem] text-subtle">Cyclops</span>
            <span className="truncate font-mono text-[0.78rem] font-semibold text-ink">
              {activeThread.title}
            </span>
          </div>
          {/* Mobile new-thread button */}
          <form action={createThread} className="sm:hidden">
            <button
              type="submit"
              className="label px-2 py-1 text-[0.6rem] text-accent hover:underline"
            >
              + New
            </button>
          </form>
        </div>

        {/* Chat client component */}
        <div className="flex-1 overflow-hidden">
          <CyclopsChat
            key={activeThread.id}
            sessionId={activeThread.id}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
