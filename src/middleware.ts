import NextAuth from "next-auth";
import { authConfig } from "./server/auth.config";

// Edge-safe middleware: gates app routes and bounces between /onboarding and
// /dashboard based on the `onboarded` flag carried in the JWT. The `authorized`
// callback in authConfig contains the logic.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Run on everything except API routes (the extension API does its own bearer
  // auth; NextAuth's own routes must be skipped), static assets, the image
  // optimizer and favicon.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
