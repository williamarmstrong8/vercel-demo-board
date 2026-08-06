// The session cookie name lives apart from lib/auth.ts so that proxy.ts can
// import it without pulling `jose` and `next/headers` into the middleware
// bundle — middleware only needs to know whether the cookie is present, not how
// to verify what's inside it.
export const SESSION_COOKIE = "vercel_id_token"

// Where the user was headed before the gate bounced them to sign in, stashed
// for the length of the OAuth round trip.
export const RETURN_TO_COOKIE = "vercel_oauth_return_to"

// Only ever send people to a path on this site. Anything protocol-relative
// ("//evil.example") or absolute would turn the sign-in flow into an open
// redirect.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  return value
}
