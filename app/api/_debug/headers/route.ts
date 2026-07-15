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

  return NextResponse.json({ interesting, all }, { headers: { "cache-control": "no-store" } })
}
