import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config shared by middleware and the full server config.
 * It deliberately contains NO database or Node-only imports (no Prisma, no
 * bcrypt) so it can run in the middleware/edge runtime. The Credentials
 * provider (which needs Prisma + bcrypt) is added only in `auth.ts`.
 */

const APP_PREFIXES = [
  "/dashboard",
  "/tracker",
  "/today",
  "/saved",
  "/settings",
  "/opportunities",
  "/applications",
  "/activity",
];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // real providers added in auth.ts (Node runtime only)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onboarded = !!auth?.user?.onboarded;
      const p = nextUrl.pathname;
      const isApp = APP_PREFIXES.some((r) => p.startsWith(r));
      const isOnboarding = p.startsWith("/onboarding");

      if (isApp || isOnboarding) {
        if (!isLoggedIn) return false; // -> redirect to signIn page
        if (isApp && !onboarded) {
          return Response.redirect(new URL("/onboarding", nextUrl));
        }
        if (isOnboarding && onboarded) {
          return Response.redirect(new URL("/today", nextUrl));
        }
      }
      return true;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.onboarded = (user as { onboarded?: boolean }).onboarded ?? false;
      }
      // When onboarding finishes the client calls `update({ onboarded: true })`.
      if (trigger === "update" && session?.onboarded !== undefined) {
        token.onboarded = session.onboarded;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.onboarded = (token.onboarded as boolean) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
