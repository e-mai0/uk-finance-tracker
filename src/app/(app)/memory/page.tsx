import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export const metadata = { title: "Memory — Trackr" };

export default async function MemoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="label text-[0.6rem] text-subtle">Memory</p>
      <h1 className="mt-1 font-mono text-xl font-semibold text-ink">
        What Cyclops knows
      </h1>
      <p className="mt-4 font-mono text-sm text-muted">
        Memory browser arriving shortly.
      </p>
    </div>
  );
}
