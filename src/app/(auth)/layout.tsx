import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">
            T
          </span>
          <span className="text-sm font-semibold tracking-tight">Trackr</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-10 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
