"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { signIn, signOut } from "../auth";
import { signupSchema, loginSchema } from "../../lib/validation";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    inviteCode: formData.get("inviteCode"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, email, password, inviteCode } = parsed.data;

  // Early-access gate: enforced only while EARLY_ACCESS_CODE is set. Trimmed,
  // case-insensitive compare so a code pasted from a chat message still works.
  // Unset the env var to open signups to everyone.
  const required = process.env.EARLY_ACCESS_CODE?.trim();
  if (required) {
    if ((inviteCode ?? "").toLowerCase() !== required.toLowerCase()) {
      return {
        fieldErrors: {
          inviteCode: ["That invite code isn’t valid. Cyclops is in early access."],
        },
      };
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { name, email, passwordHash } });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/onboarding",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw e; // re-throw the redirect
  }

  return {};
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/today",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw e; // re-throw the redirect
  }

  return {};
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
