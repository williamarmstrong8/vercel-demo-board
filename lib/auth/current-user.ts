import "server-only"

import { cache } from "react"
import { readPassportIdentity } from "@/lib/auth/passport"

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
}

// Derive a friendly display name when the IdP doesn't provide one: prefer the
// local-part of the email, otherwise fall back to the raw identifier.
function displayName(name: string | null, email: string | null, id: string): string {
  if (name?.trim()) return name.trim()
  if (email) return email.split("@")[0]
  return id
}

// Resolve the current user from the Vercel Passport identity on the request.
// Memoized per request so a single render/action that touches several board
// helpers only decodes the token once.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const identity = await readPassportIdentity()
  if (!identity) return null
  return {
    id: identity.externalSub,
    name: displayName(identity.name, identity.email, identity.externalSub),
    email: identity.email ?? "",
    image: null,
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser()
  if (!current) {
    throw new Error("Unauthorized: no Vercel Passport identity on request")
  }
  return current
}

export async function requireUserId(): Promise<string> {
  return (await requireUser()).id
}
