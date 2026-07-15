import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
}

// Resolve the current Better Auth user from the request's session cookie.
// Memoized per request so a single render/action that touches several board
// helpers only reads the session once.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser()
  if (!current) {
    throw new Error("Unauthorized: no active session")
  }
  return current
}

export async function requireUserId(): Promise<string> {
  return (await requireUser()).id
}
