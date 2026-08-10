import { NextResponse } from "next/server"
import { verifyIdToken } from "@/lib/auth"
import { RETURN_TO_COOKIE, applySession, deleteCookie, safeReturnTo } from "@/lib/session"

const OAUTH_COOKIE_NAMES = [
  "vercel_oauth_state",
  "vercel_oauth_nonce",
  "vercel_oauth_verifier",
  RETURN_TO_COOKIE,
]

// On failure this lands back on the sign-in page rather than the dashboard: the
// dashboard is behind the gate, so sending an unauthenticated browser there
// would only bounce it here anyway, losing the reason it failed on the way.
function finish(request: Request, error?: string, returnTo?: string | null) {
  const url = new URL(error ? "/signin" : (returnTo ?? "/"), request.url)
  if (error) url.searchParams.set("auth_error", error)
  const response = NextResponse.redirect(url)
  OAUTH_COOKIE_NAMES.forEach((name) => deleteCookie(response, name))
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const authorizationError = url.searchParams.get("error")
  if (authorizationError) {
    // Vercel explains parameter rejections in error_description. Dropping it
    // makes its `invalid_request` indistinguishable from our own checks below.
    console.error("Vercel OAuth authorization rejected", {
      error: authorizationError,
      description: url.searchParams.get("error_description"),
    })
    return finish(request, authorizationError)
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookies = request.headers.get("cookie") ?? ""
  const stateCookie = cookies.match(/(?:^|; )vercel_oauth_state=([^;]*)/)?.[1]
  const nonce = cookies.match(/(?:^|; )vercel_oauth_nonce=([^;]*)/)?.[1]
  const verifier = cookies.match(/(?:^|; )vercel_oauth_verifier=([^;]*)/)?.[1]
  const returnTo = safeReturnTo(
    decodeURIComponent(cookies.match(/(?:^|; )vercel_oauth_return_to=([^;]*)/)?.[1] ?? ""),
  )

  if (!code || !state || !stateCookie || state !== stateCookie || !nonce || !verifier) {
    // The usual cause is the 10-minute cookie window lapsing between clicking
    // sign in and returning from consent, so name it separately from a
    // rejection by Vercel. Values are secrets — log only what is present.
    console.error("Vercel OAuth callback is missing its handshake state", {
      code: Boolean(code),
      state: Boolean(state),
      stateCookie: Boolean(stateCookie),
      stateMatches: state === stateCookie,
      nonce: Boolean(nonce),
      verifier: Boolean(verifier),
    })
    return finish(request, "handshake_expired")
  }

  const clientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error("Vercel OAuth callback is missing credentials", {
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
    })
    return finish(request, "not_configured")
  }

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

    if (!tokenResponse.ok) {
      // The body carries the OAuth error / error_description that says which
      // parameter the token endpoint objected to. `invalid_client` means the
      // secret does not belong to this client ID; `invalid_grant` points at the
      // redirect URI or verifier rather than the credentials.
      console.error("Vercel OAuth token exchange failed", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: await tokenResponse.text().catch(() => ""),
        clientId,
        redirectUri,
        clientSecretLength: clientSecret.length,
      })
      return finish(request, "token_exchange_failed")
    }

    const tokens = (await tokenResponse.json()) as { id_token?: string; refresh_token?: string }
    if (!tokens.id_token) {
      console.error("Vercel OAuth response did not include an ID token")
      return finish(request, "missing_id_token")
    }

    // Vercel only issues a refresh token when `offline_access` is both requested
    // here and enabled under Manage → Permissions. Without one the session can't
    // be renewed and quietly reverts to lasting an hour, which is hard to notice
    // from the outside, so say so rather than letting it look like a bug later.
    if (!tokens.refresh_token) {
      console.warn(
        "Vercel OAuth response included no refresh token — sessions will expire with the ID token. Enable the offline_access scope to keep users signed in.",
      )
    }

    await verifyIdToken(tokens.id_token, nonce)
    const response = finish(request, undefined, returnTo)
    applySession(response, {
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token ?? null,
    })
    return response
  } catch (error) {
    console.error("Vercel OAuth callback failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return finish(request, "sign_in_failed")
  }
}
