import type { NextResponse } from "next/server"

// The cookie names and the token exchange live apart from lib/auth.ts so that
// proxy.ts can import them without pulling `jose` and `next/headers` into the
// middleware bundle — the middleware renews sessions, but verifying what's
// inside a token stays on the pages and route handlers behind it.
export const SESSION_COOKIE = "vercel_id_token"
export const REFRESH_COOKIE = "vercel_refresh_token"

// Where the user was headed before the gate bounced them to sign in, stashed
// for the length of the OAuth round trip.
export const RETURN_TO_COOKIE = "vercel_oauth_return_to"

// Vercel's refresh tokens last 30 days, so that's the ceiling on how long
// someone can stay signed in without touching the consent screen again. Both
// cookies get that lifetime: the ID token inside the session cookie goes stale
// after an hour, but the cookie has to outlive it or there'd be nothing left in
// the request to tell an expired session apart from no session at all.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

// Start renewing this long before the ID token actually expires. Refresh tokens
// are single use and rotate on exchange, so two requests that arrive together
// both spend the same one and the loser gets `invalid_grant` back. Renewing
// early means the loser is still holding a valid token and can just try again on
// its next request, instead of the race costing someone their session.
const RENEW_BEFORE_SECONDS = 10 * 60

// SameSite=Lax rather than Strict: a board link opened from Slack or email is a
// cross-site navigation, and Strict would withhold the cookies on exactly that
// request — the shared link would bounce off the sign-in page even though the
// person is signed in.
const COOKIE_PATH = "/"

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
}

// A Set-Cookie without an explicit Path is scoped to the directory of the URL
// that sent it, so deleting by name alone from a route under /api/auth would
// write an expiry for /api/auth and leave the real, "/"-scoped cookie in place.
// Every deletion has to name the path the cookie was written with.
export function deleteCookie(response: NextResponse, name: string) {
  response.cookies.delete({ name, path: COOKIE_PATH })
}

export type Session = {
  idToken: string
  // Absent when `offline_access` isn't among the granted scopes, which leaves
  // the session lasting only as long as the ID token itself.
  refreshToken: string | null
}

// Only ever send people to a path on this site. Anything protocol-relative
// ("//evil.example") or absolute would turn the sign-in flow into an open
// redirect.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  return value
}

// Reads `exp` out of the token without checking the signature. That's enough to
// decide when to renew — a forged token buys an attacker nothing but an early
// refresh attempt — and it keeps the JWKS fetch that real verification needs out
// of the middleware. Anything that trusts the claims goes through
// verifyIdToken() in lib/auth.ts instead.
export function expiresAt(idToken: string): number | null {
  const payload = idToken.split(".")[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const { exp } = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown }
    return typeof exp === "number" ? exp : null
  } catch {
    return null
  }
}

// - fresh: nothing to do.
// - stale: still verifies, but close enough to expiry to renew now.
// - expired: unusable, and the request needs a refresh token to go anywhere.
export type SessionState = "fresh" | "stale" | "expired"

export function sessionState(idToken: string | undefined): SessionState {
  if (!idToken) return "expired"

  const exp = expiresAt(idToken)
  if (exp === null) return "expired"

  const now = Date.now() / 1000
  if (exp <= now) return "expired"
  return exp - now <= RENEW_BEFORE_SECONDS ? "stale" : "fresh"
}

export function applySession(response: NextResponse, session: Session) {
  const exp = expiresAt(session.idToken)

  response.cookies.set(SESSION_COOKIE, session.idToken, {
    ...COOKIE_OPTIONS,
    // With nothing to renew from, the cookie is only worth keeping for as long
    // as the token inside it still verifies.
    ...(session.refreshToken
      ? { maxAge: SESSION_MAX_AGE }
      : { expires: exp ? new Date(exp * 1000) : undefined }),
  })

  if (session.refreshToken) {
    response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: SESSION_MAX_AGE,
    })
  } else {
    deleteCookie(response, REFRESH_COOKIE)
  }
}

export function clearSession(response: NextResponse) {
  deleteCookie(response, SESSION_COOKIE)
  deleteCookie(response, REFRESH_COOKIE)
}

type TokenResponse = {
  id_token?: string
  refresh_token?: string
}

// Trades the refresh token for a new ID token, and for the replacement refresh
// token that Vercel rotates in at the same time. Returns null for every failure
// so callers can treat "couldn't renew" as one case; the reason lands in the
// logs, since the only thing a caller can do about it is fall back to sign in.
export async function exchangeRefreshToken(refreshToken: string): Promise<Session | null> {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error("Vercel OAuth refresh skipped: credentials are not configured")
    return null
  }

  try {
    const response = await fetch("https://api.vercel.com/login/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      // `invalid_grant` is the expected one: the token was already spent by a
      // parallel request, revoked, or is past its 30 days. Everything else
      // points at the app's credentials rather than at this user.
      console.error("Vercel OAuth refresh failed", {
        status: response.status,
        body: await response.text().catch(() => ""),
      })
      return null
    }

    const tokens = (await response.json()) as TokenResponse
    if (!tokens.id_token) {
      console.error("Vercel OAuth refresh returned no ID token")
      return null
    }

    return { idToken: tokens.id_token, refreshToken: tokens.refresh_token ?? null }
  } catch (error) {
    console.error("Vercel OAuth refresh request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}
