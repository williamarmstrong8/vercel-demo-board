import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { account, user } from "@/lib/db/auth-schema"
import { readPassportIdentity, type PassportIdentity } from "@/lib/auth/passport"

const PASSPORT_PROVIDER = "vercel-passport"

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
  externalSub: string
}

function newId() {
  return crypto.randomUUID()
}

// Resolve (and lazily provision) the Better Auth user for the current Passport
// identity. Better Auth owns the user/account tables; Vercel Passport is the
// authentication layer at the edge. We link the two via an `account` row keyed by
// the Passport `external_sub`.
async function resolveUser(identity: PassportIdentity): Promise<CurrentUser> {
  // 1. Already linked? Return the existing user.
  const [link] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(
      and(
        eq(account.providerId, PASSPORT_PROVIDER),
        eq(account.accountId, identity.externalSub),
      ),
    )
    .limit(1)

  if (link) {
    const [row] = await db.select().from(user).where(eq(user.id, link.userId)).limit(1)
    if (row) {
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        externalSub: identity.externalSub,
      }
    }
  }

  // 2. Not linked yet. Provision a user (or attach to an existing one that
  // already owns this email) and create the Passport account link.
  const email = identity.email ?? `${identity.externalSub}@passport.local`
  const name = identity.name ?? identity.email ?? identity.externalSub
  const now = new Date()

  const userId = newId()
  const [inserted] = await db
    .insert(user)
    .values({
      id: userId,
      name,
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: user.email })
    .returning({ id: user.id })

  // If the email already existed, fall back to that user row.
  let resolvedId = inserted?.id
  let resolved
  if (!resolvedId) {
    const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
    resolved = existing
    resolvedId = existing?.id
  } else {
    const [row] = await db.select().from(user).where(eq(user.id, resolvedId)).limit(1)
    resolved = row
  }

  if (!resolvedId || !resolved) {
    throw new Error("Failed to provision user for Passport identity")
  }

  await db
    .insert(account)
    .values({
      id: newId(),
      accountId: identity.externalSub,
      providerId: PASSPORT_PROVIDER,
      userId: resolvedId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()

  return {
    id: resolved.id,
    name: resolved.name,
    email: resolved.email,
    image: resolved.image,
    externalSub: identity.externalSub,
  }
}

// Memoized per request so a single render/action that touches several board
// helpers only resolves the user once.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const identity = readPassportIdentity(await headers())
  if (!identity) return null
  return resolveUser(identity)
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
