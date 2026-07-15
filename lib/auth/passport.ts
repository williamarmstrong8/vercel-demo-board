import "server-only"

// Vercel Passport identity, read from the request at the edge.
//
// When a deployment is gated by Vercel Passport, Vercel authenticates the
// visitor with your identity provider and injects a signed JWT into the
// `x-vercel-oidc-passport-token` request header. Per Vercel's guidance we do NOT
// verify the signature: Vercel validates the session and strips any
// client-supplied value before injecting the trusted token. We only decode the
// payload to read the identity claims.
//
// `external_sub` is the stable per-visitor identifier we key everything on.

export const PASSPORT_HEADER = "x-vercel-oidc-passport-token"

export interface PassportIdentity {
  externalSub: string
  email: string | null
  name: string | null
}

interface PassportClaims {
  external_sub?: string
  sub?: string
  email?: string
  name?: string
}

function decodeJwtPayload(token: string): PassportClaims | null {
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8")
    return JSON.parse(json) as PassportClaims
  } catch {
    return null
  }
}

// Local development fallback. Vercel Passport only runs on Vercel, so locally we
// synthesize a stable identity from env vars (or a default) so the app is fully
// usable without the IdP. This is NEVER used in production.
function devIdentity(): PassportIdentity | null {
  if (process.env.NODE_ENV === "production") return null
  const externalSub = process.env.DEV_PASSPORT_SUB || "dev-user"
  return {
    externalSub,
    email: process.env.DEV_PASSPORT_EMAIL || `${externalSub}@localhost.dev`,
    name: process.env.DEV_PASSPORT_NAME || "Local Developer",
  }
}

export function readPassportIdentity(headers: Headers): PassportIdentity | null {
  const token = headers.get(PASSPORT_HEADER)
  if (!token) return devIdentity()

  const claims = decodeJwtPayload(token)
  const externalSub = claims?.external_sub || claims?.sub
  if (!claims || !externalSub) return devIdentity()

  return {
    externalSub,
    email: claims.email ?? null,
    name: claims.name ?? null,
  }
}
