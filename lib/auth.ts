import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { db } from "@/lib/db"

// Better Auth is our application auth/user layer using email + password.
//
// Access to every deployment is already gated by Vercel's SSO (Okta) at the
// edge, but SSO only controls *who can reach* the app — it does not hand the
// app a per-user identity. Better Auth provides that identity: each visitor
// signs in with email + password and gets a session, and every board is scoped
// to their user id.
//
// The baseURL / trustedOrigins cascade below is what makes sessions work across
// every environment we run in: local dev, the v0 preview iframe, Vercel preview
// deployments, and production. Better Auth rejects cookies from origins not in
// this list, so dropping any of these silently breaks auth in that environment.
export const auth = betterAuth({
  // The Drizzle adapter is intentionally given no `schema` so it falls back to
  // `db._.fullSchema` (which includes the generated auth tables). This avoids the
  // common "model <table> not found" error. See lib/db/index.ts.
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the browser
          // actually stores the session cookie inside the iframe.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
