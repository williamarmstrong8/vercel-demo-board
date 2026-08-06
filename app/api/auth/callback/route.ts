import { NextResponse } from "next/server"
import { SESSION_COOKIE, verifyIdToken } from "@/lib/auth"

const OAUTH_COOKIE_NAMES = ["vercel_oauth_state", "vercel_oauth_nonce", "vercel_oauth_verifier"]

function finish(request: Request, error?: string) {
  const url = new URL("/", request.url)
  if (error) url.searchParams.set("auth_error", error)
  const response = NextResponse.redirect(url)
  OAUTH_COOKIE_NAMES.forEach((name) => response.cookies.delete(name))
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const authorizationError = url.searchParams.get("error")
  if (authorizationError) return finish(request, authorizationError)

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookies = request.headers.get("cookie") ?? ""
  const stateCookie = cookies.match(/(?:^|; )vercel_oauth_state=([^;]*)/)?.[1]
  const nonce = cookies.match(/(?:^|; )vercel_oauth_nonce=([^;]*)/)?.[1]
  const verifier = cookies.match(/(?:^|; )vercel_oauth_verifier=([^;]*)/)?.[1]

  if (!code || !state || !stateCookie || state !== stateCookie || !nonce || !verifier) {
    return finish(request, "invalid_request")
  }

  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) return finish(request, "not_configured")

  const redirectUri = new URL("/api/auth/callback", request.url).toString()
  try {
    const tokenResponse = await fetch("https://api.vercel.com/login/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) return finish(request, "token_exchange_failed")

    const tokens = (await tokenResponse.json()) as { id_token?: string }
    if (!tokens.id_token) return finish(request, "missing_id_token")

    const payload = await verifyIdToken(tokens.id_token, nonce)
    const response = finish(request)
    response.cookies.set(SESSION_COOKIE, tokens.id_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: payload.exp ? new Date(payload.exp * 1000) : undefined,
    })
    return response
  } catch {
    return finish(request, "sign_in_failed")
  }
}
