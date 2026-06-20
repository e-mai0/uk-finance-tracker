import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Dark command rail — same chrome as the desk */}
      <header className="chrome border-b border-chrome-line">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-[1.1rem] font-extrabold tracking-tight text-white"
          >
            Cyclops<span className="text-amber">.</span>
          </Link>
          <Link
            href="/"
            className="label text-[0.62rem] text-chrome-ink-2 transition-colors hover:text-white"
          >
            ‹ Home
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-12 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
