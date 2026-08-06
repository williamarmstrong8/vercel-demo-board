import { createHash, randomBytes } from "node:crypto"
import { NextResponse } from "next/server"

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 10 * 60,
  path: "/",
}

function randomValue() {
  return randomBytes(32).toString("base64url")
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

// Scopes are enabled per app under Settings → Apps → Manage → Permissions, and
// requesting one that is disabled there fails the whole authorization with
// `invalid_scope`. Keeping this in an env var means a mismatch can be corrected
// without a code change.
const DEFAULT_SCOPE = "openid profile email"

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  if (!clientId) {
    console.error("Vercel OAuth authorize aborted: NEXT_PUBLIC_VERCEL_APP_CLIENT_ID is not set")
    return NextResponse.redirect(new URL("/?auth_error=not_configured", request.url))
  }

  const state = randomValue()
  const nonce = randomValue()
  const verifier = randomValue()
  const scope = process.env.VERCEL_APP_OAUTH_SCOPE ?? DEFAULT_SCOPE
  const redirectUri = new URL("/api/auth/callback", request.url).toString()
  const authorizationUrl = new URL("https://vercel.com/oauth/authorize")

  authorizationUrl.searchParams.set("client_id", clientId)
  authorizationUrl.searchParams.set("redirect_uri", redirectUri)
  authorizationUrl.searchParams.set("response_type", "code")
  authorizationUrl.searchParams.set("scope", scope)
  authorizationUrl.searchParams.set("state", state)
  authorizationUrl.searchParams.set("nonce", nonce)
  authorizationUrl.searchParams.set("code_challenge", codeChallenge(verifier))
  authorizationUrl.searchParams.set("code_challenge_method", "S256")

  // These are the exact values Vercel validates, so logging them turns a generic
  // rejection on the callback into a directly comparable request. The client ID
  // is public; state/nonce/verifier are not logged.
  console.log("Vercel OAuth authorize request", {
    clientId,
    redirectUri,
    scope,
    hasClientSecret: Boolean(process.env.VERCEL_APP_CLIENT_SECRET),
  })

  const response = NextResponse.redirect(authorizationUrl)
  response.cookies.set("vercel_oauth_state", state, OAUTH_COOKIE_OPTIONS)
  response.cookies.set("vercel_oauth_nonce", nonce, OAUTH_COOKIE_OPTIONS)
  response.cookies.set("vercel_oauth_verifier", verifier, OAUTH_COOKIE_OPTIONS)
  return response
}
