import { NextResponse, type NextRequest } from "next/server"

// Defense-in-depth. In production the deployment is gated by Vercel Passport, so
// every request should already carry the signed `x-vercel-oidc-passport-token`
// header (Vercel injects it after authenticating the visitor). If it's somehow
// missing in production, refuse the request rather than fall through to app code.
//
// This is intentionally lightweight: it only inspects a header (no DB, no auth
// library). Identity resolution + user provisioning happens server-side in
// lib/auth/current-user.ts.
//
// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (function
// `middleware` -> `proxy`). See https://nextjs.org/docs/messages/middleware-to-proxy
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next()
  }

  const hasPassport = request.headers.has("x-vercel-oidc-passport-token")
  if (!hasPassport) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  // Run on app + API routes, skip Next internals, static assets, and the Better
  // Auth endpoints.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
}
