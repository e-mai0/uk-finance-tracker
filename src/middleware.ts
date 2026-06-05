import NextAuth from "next-auth";
import { authConfig } from "./server/auth.config";

// Edge-safe middleware: gates app routes and bounces between /onboarding and
// /dashboard based on the `onboarded` flag carried in the JWT. The `authorized`
// callback in authConfig contains the logic.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Run on everything except static assets, image optimizer, favicon and the
  // auth API routes.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
