import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create account — Trackr" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/today" : "/onboarding");
  }

  // Gate is active only while EARLY_ACCESS_CODE is set; drives the invite field.
  const inviteRequired = Boolean(process.env.EARLY_ACCESS_CODE?.trim());

  return (
    <div className="border border-border-strong bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-4 py-2">
        <span className="label text-[0.62rem] text-accent">▸ New account</span>
        <span className="label text-[0.6rem] text-subtle">SU27</span>
      </div>
      <div className="p-5">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Create your tracker
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Two minutes to set up. Then onboard and see your matches.
        </p>

        <div className="mt-5">
          <SignupForm inviteRequired={inviteRequired} />
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
