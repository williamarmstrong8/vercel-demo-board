import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { db } from "@/lib/db"

// Better Auth is our application auth/user layer. Authentication itself happens
// at the edge via Vercel Passport; we bridge the Passport identity into a Better
// Auth user + session (see lib/auth/current-user.ts). We therefore don't surface
// an email/password sign-in UI, but keep Better Auth for the user/session model,
// session issuance, and client-side session state / sign-out.
export const auth = betterAuth({
  // The Drizzle adapter is intentionally given no `schema` so it falls back to
  // `db._.fullSchema` (which includes the generated auth tables). This avoids the
  // common "model <table> not found" error. See lib/db/index.ts.
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    // Not surfaced in the UI (Passport handles authentication), but Better Auth
    // requires at least one auth method to be configured for its user model.
    enabled: true,
  },
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
