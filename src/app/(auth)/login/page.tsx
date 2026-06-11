import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Trackr" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/today" : "/onboarding");
  }

  return (
    <div className="border border-border-strong bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-4 py-2">
        <span className="label text-[0.62rem] text-accent">▸ Sign in</span>
        <span className="label text-[0.6rem] text-subtle">Secure</span>
      </div>
      <div className="p-5">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Sign in to your tracker to pick up where you left off.
        </p>

        <div className="mt-5">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>

        <div className="mt-5 border border-border bg-surface-2 px-3 py-2.5 font-mono text-xs text-muted">
          <span className="label text-[0.58rem] text-subtle">Demo</span>{" "}
          <span className="text-ink">demo@trackr.local</span> /{" "}
          <span className="text-ink">demo1234</span>
        </div>
      </div>
    </div>
  );
}
