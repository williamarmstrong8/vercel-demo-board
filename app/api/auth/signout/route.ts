import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth"

// No longer reachable from the UI, but kept as the one supported way to end a
// session: "/" is behind the gate, so this hands the browser to the sign-in
// page rather than letting it bounce off the redirect.
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/signin", request.url))
  response.cookies.delete(SESSION_COOKIE)
  return response
}
