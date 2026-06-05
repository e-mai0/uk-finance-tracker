import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Create account — Trackr" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.onboarded ? "/dashboard" : "/onboarding");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Create your tracker
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Two minutes to set up. Then onboard and see your matches.
      </p>

      <div className="mt-6">
        <SignupForm />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
