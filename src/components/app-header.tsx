"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";
import { Brand } from "@/components/brand";

const NAV = [
  { href: "/dashboard", label: "Tracker" },
  { href: "/saved", label: "Saved" },
  { href: "/applications", label: "Applications" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader({ name, savedCount }: { name: string; savedCount: number }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Brand href="/dashboard" />

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface-2 text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {item.label}
                {item.href === "/saved" && savedCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent tabular">
                    {savedCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{name}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
