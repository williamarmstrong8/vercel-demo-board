import { headers } from "next/headers"
import { NextResponse } from "next/server"

// TEMPORARY diagnostic route. Dumps the request headers that Vercel's edge
// injects so we can see exactly how the internal playground passes identity
// (email/name/subject). Delete this once identity wiring is confirmed.
export const dynamic = "force-dynamic"

export async function GET() {
  const h = await headers()
  const all: Record<string, string> = {}
  h.forEach((value, key) => {
    // Redact obviously huge/secret tokens but keep their presence + length.
    if (key.includes("token") || key.includes("authorization") || key.includes("cookie")) {
      all[key] = `<present, length=${value.length}>`
    } else {
      all[key] = value
    }
  })

  // Highlight the headers most likely to carry identity.
  const interesting = Object.fromEntries(
    Object.entries(all).filter(
      ([k]) =>
        k.startsWith("x-vercel") ||
        k.includes("email") ||
        k.includes("user") ||
        k.includes("passport") ||
        k.includes("oidc") ||
        k.includes("sso") ||
        k.includes("forwarded"),
    ),
  )

  // Decode (WITHOUT verifying) the OIDC token's claims so we can see which
  // fields carry the email/name. This is diagnostic only.
  let oidcClaims: unknown = null
  const oidcToken = h.get("x-vercel-oidc-token")
  if (oidcToken) {
    try {
      const payload = oidcToken.split(".")[1]
      const json = Buffer.from(payload, "base64url").toString("utf8")
      oidcClaims = JSON.parse(json)
    } catch (e) {
      oidcClaims = { decodeError: (e as Error).message }
    }
  }

  return NextResponse.json(
    { oidcClaims, interesting, all },
    { headers: { "cache-control": "no-store" } },
  )
}
