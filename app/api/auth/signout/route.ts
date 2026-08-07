import { NextResponse, type NextRequest } from "next/server"
import { REFRESH_COOKIE, clearSession } from "@/lib/session"

// Now that a session renews itself, dropping the cookies isn't enough to end
// one: the refresh token stays good on Vercel's side for 30 days, and anything
// that kept a copy could go on minting ID tokens with it. Revoking is what
// actually closes the session. Best effort — a failure here shouldn't leave
// someone stuck signed in on their own browser.
async function revokeRefreshToken(refreshToken: string) {
  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) return

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    const response = await fetch("https://api.vercel.com/login/oauth/token/revoke", {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshToken }),
    })

    if (!response.ok) {
      console.error("Vercel OAuth token revocation failed", {
        status: response.status,
        body: await response.text().catch(() => ""),
      })
    }
  } catch (error) {
    console.error("Vercel OAuth token revocation request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

// The one supported way to end a session: "/" is behind the gate, so this hands
// the browser to the sign-in page rather than letting it bounce off the
// redirect. 303 so the form POST turns into a GET on the way there.
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (refreshToken) await revokeRefreshToken(refreshToken)

  const response = NextResponse.redirect(new URL("/signin", request.url), 303)
  clearSession(response)
  return response
}
