import { NextResponse, type NextRequest } from "next/server"
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  applySession,
  exchangeRefreshToken,
  sessionState,
} from "@/lib/session"

// The front door: no session, no site. Everything behind this needs an account
// anyway — boards belong to the person who made them — so gating here means a
// signed-out visitor gets the sign-in page instead of a string of empty grids.
//
// It's also the only place a session can be renewed, because it's the only thing
// that runs before every page, Server Action and route handler and can still put
// a cookie on the response. The ID token that is the session lasts an hour;
// renewing it here from the refresh token is what stretches that to 30 days
// without the user seeing a sign-in page.
//
// This deliberately reads the token's expiry rather than verifying it. Real
// verification would mean fetching Vercel's JWKS on every request, and it isn't
// needed for a scheduling decision — the pages and route handlers behind this
// call getCurrentUser()/requireUser(), which verify properly and treat a forged
// or expired token as signed out. So this is a redirect for the common case,
// never the thing keeping data safe.
//
// The auth routes are exempt because they're the ones handing out the cookies
// this reads.
export const config = {
  matcher: [
    "/((?!api/auth/|_next/static|_next/image|signin|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}

export async function proxy(request: NextRequest) {
  const idToken = request.cookies.get(SESSION_COOKIE)?.value
  const state = sessionState(idToken)
  if (state === "fresh") return NextResponse.next()

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    const session = await exchangeRefreshToken(refreshToken)
    if (session) {
      // Rewriting the request cookie as well as setting the response one means
      // whatever runs behind this already sees a signed-in user, so the request
      // that triggered the renewal is served normally instead of costing the
      // user a redirect.
      request.cookies.set(SESSION_COOKIE, session.idToken)
      const response = NextResponse.next({ request })
      applySession(response, session)
      return response
    }

    // Nothing is cleared on failure. Refresh tokens are single use, so the usual
    // cause is a parallel request having just spent this one — and that request
    // has already put the replacement on its own response. Deleting the cookie
    // here would throw away a working session to punish losing a race.
  }

  // A renewal that failed early still leaves a token that verifies, so the
  // request can go through and try again on the next one.
  if (state === "stale") return NextResponse.next()

  // API routes authenticate themselves and answer with a 401, which is what
  // their callers can actually handle — an HTML redirect to the sign-in page
  // would just confuse `fetch` and `sendBeacon`.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next()

  const signIn = new URL("/signin", request.url)

  // Remember where they were headed so a shared board link still works when
  // it's opened cold. "/" is the default landing spot, so it needs no param.
  const { pathname, search } = request.nextUrl
  if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`)

  return NextResponse.redirect(signIn)
}
