import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Trackr" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/dashboard" : "/onboarding");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Sign in to your tracker to pick up where you left off.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
        <span className="font-medium text-ink">Demo account:</span>{" "}
        demo@trackr.local / demo1234
      </div>
    </div>
  );
}
