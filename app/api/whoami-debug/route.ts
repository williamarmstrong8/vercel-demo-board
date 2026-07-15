import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { decodeJwt } from "jose"

// TEMPORARY diagnostic. Lists every request header key the app receives and
// decodes any JWT-looking header, so we can see exactly what identity (if any)
// the edge injects. Delete once Passport wiring is confirmed.
export const dynamic = "force-dynamic"

export async function GET() {
  const h = await headers()
  const keys: string[] = []
  h.forEach((_value, key) => keys.push(key))
  keys.sort()

  // Any header whose name hints at identity/passport/oidc/auth.
  const identityHeaders = keys.filter(
    (k) =>
      k.includes("passport") ||
      k.includes("oidc") ||
      k.includes("auth") ||
      k.includes("user") ||
      k.includes("email") ||
      k.includes("sso"),
  )

  // Decode (WITHOUT verifying) any header that looks like a JWT so we can see
  // its claims and identify which one carries the human identity.
  const decoded: Record<string, unknown> = {}
  for (const k of keys) {
    const v = h.get(k)
    if (v && v.split(".").length === 3 && v.length > 40) {
      try {
        decoded[k] = decodeJwt(v)
      } catch {
        decoded[k] = "(not a decodable jwt)"
      }
    }
  }

  return NextResponse.json(
    { allHeaderKeys: keys, identityHeaders, decodedJwts: decoded },
    { headers: { "cache-control": "no-store" } },
  )
}
