import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { genericOAuth } from "better-auth/plugins"
import { db } from "@/lib/db"

// Better Auth is our application auth/user layer. Sign-in is "Sign in with
// Vercel" (Vercel's OAuth 2.0 / OpenID Connect), so users authenticate with
// their Vercel account — no passwords stored here. On first sign-in Better Auth
// creates a `user` row from the Vercel profile; every board is scoped to that
// user id.
//
// The baseURL / trustedOrigins cascade below is what makes sessions work across
// every environment we run in: local dev, the v0 preview iframe, Vercel preview
// deployments, and production. Better Auth rejects cookies from origins not in
// this list, so dropping any of these silently breaks auth in that environment.
//
// Register the OAuth app at https://vercel.com/account/settings and set the
// callback URL to <origin>/api/auth/oauth2/callback/vercel. It provides
// AUTH_VERCEL_CLIENT_ID and AUTH_VERCEL_CLIENT_SECRET.
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
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "vercel",
          clientId: process.env.AUTH_VERCEL_CLIENT_ID as string,
          clientSecret: process.env.AUTH_VERCEL_CLIENT_SECRET as string,
          // Vercel implements OIDC discovery, so Better Auth can resolve the
          // authorize/token/userinfo endpoints from this one URL.
          discoveryUrl: "https://vercel.com/.well-known/openid-configuration",
          scopes: ["openid", "email", "profile"],
          pkce: true,
        },
      ],
    }),
    // nextCookies() must stay last so it can attach Set-Cookie headers to the
    // OAuth callback response.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
