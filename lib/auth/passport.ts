import "server-only"

import { headers } from "next/headers"
import { decodeJwt } from "jose"

// Vercel Passport gates every deployment at the edge. Once a visitor is
// authenticated through the team's identity provider, Vercel injects a signed
// JWT into the `x-vercel-oidc-passport-token` request header. Vercel strips any
// client-supplied value from this header and validates the session before
// injecting it, so we can trust it and decode (not verify) it server-side.
//
// Claims:
//   - external_sub: stable, unique user id from the IdP (always present)
//   - email / name: optional, only present if the IdP returns them
//
// See app/api/whoami-debug (temporary) for the raw claims on a live deployment.
const PASSPORT_HEADER = "x-vercel-oidc-passport-token"

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

// A stable local identity so the app is usable in local dev and the v0 preview
// iframe, where there is no edge Passport to inject a token.
function devIdentity(): PassportIdentity {
  return {
    externalSub: "dev-user",
    email: "dev@localhost.dev",
    name: "Dev User",
  }
}

export async function readPassportIdentity(): Promise<PassportIdentity | null> {
  const token = (await headers()).get(PASSPORT_HEADER)

  if (!token) {
    // No token: in development fall back to a dev identity; in production the
    // edge should always inject one, so a missing token means "not signed in".
    return process.env.NODE_ENV === "development" ? devIdentity() : null
  }

  try {
    const claims = decodeJwt(token) as PassportClaims
    const externalSub = claims.external_sub ?? claims.sub
    if (!externalSub) return null
    return {
      externalSub,
      email: claims.email ?? null,
      name: claims.name ?? null,
    }
  } catch {
    return null
  }
}
