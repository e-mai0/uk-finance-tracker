"use client";

import { useActionState } from "react";
import { signupAction, type AuthFormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signupAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div>
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="mt-1.5"
          placeholder="Alex Morgan"
        />
        <FieldError message={state.fieldErrors?.name?.[0]} />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1.5"
          placeholder="you@university.ac.uk"
        />
        <FieldError message={state.fieldErrors?.email?.[0]} />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1.5"
          placeholder="At least 8 characters"
        />
        <FieldError message={state.fieldErrors?.password?.[0]} />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
