import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE } from "@/lib/session"

// The front door: no session, no site. Everything behind this needs an account
// anyway — boards belong to the person who made them — so gating here means a
// signed-out visitor gets the sign-in page instead of a string of empty grids.
//
// This is deliberately only a cookie-presence check, not a verification. Doing
// the real thing would mean fetching Vercel's JWKS on every request; instead the
// pages and route handlers behind it call getCurrentUser()/requireUser(), which
// verify the token properly and treat a forged or expired one as signed out.
// So this is a redirect for the common case, never the thing keeping data safe.
//
// API routes are exempt: they authenticate themselves and answer with a 401,
// which is what their callers can actually handle — an HTML redirect to the
// sign-in page would just confuse `fetch` and `sendBeacon`.
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|signin|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const signIn = new URL("/signin", request.url)

  // Remember where they were headed so a shared board link still works when
  // it's opened cold. "/" is the default landing spot, so it needs no param.
  const { pathname, search } = request.nextUrl
  if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`)

  return NextResponse.redirect(signIn)
}
