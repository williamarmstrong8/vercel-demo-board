import { db } from "@/lib/db"
import { boards, users, type UserRow } from "@/lib/db/schema"
import type { VercelIdentity } from "@/lib/auth"
import { and, eq, ne } from "drizzle-orm"

// Re-exported so server callers can reach it from the same place as the rest of
// the profile helpers; the implementation lives apart so client code can import
// it without the `db` above (see lib/users/href.ts).
export { profileHref } from "./href"

// The People directory and profile pages read from here. Identity itself still
// lives in the Vercel session JWT — this table (see lib/db/schema.ts) is only a
// cache that lets the app name and picture someone who *isn't* the current
// viewer. Every function here is a read or an idempotent upsert; none of it
// grants access to anything.

// The legacy owner id that predates ownership; it credits nobody, so it never
// surfaces as a person.
const ANONYMOUS = "anonymous"

// A person as the directory and profile header need them: who they are, plus how
// many boards they've shared (the only thing worth ranking a stranger by here).
export interface PersonSummary {
  id: string
  username: string | null
  displayName: string
  picture: string | null
  publicBoardCount: number
}

function displayNameFor(row: Pick<UserRow, "displayName">, fallback?: string | null): string {
  return row.displayName?.trim() || fallback?.trim() || "Vercel user"
}

// Refresh the cached row for whoever just proved who they are. Called on sign-in
// and on landing at the dashboard, so a returning user's username/picture stay
// current and the dev-bypass identity (which never hits the OAuth callback) still
// makes it into the directory. Best-effort: a profile cache failing must never
// take down the page that triggered it, so callers can ignore a rejection.
export async function upsertUser(identity: VercelIdentity): Promise<void> {
  if (identity.id === ANONYMOUS) return

  await db
    .insert(users)
    .values({
      id: identity.id,
      username: identity.username,
      name: identity.name,
      displayName: identity.displayName,
      email: identity.email,
      picture: identity.picture,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username: identity.username,
        name: identity.name,
        displayName: identity.displayName,
        email: identity.email,
        picture: identity.picture,
        updatedAt: new Date(),
      },
    })
}

// Everyone the app knows about, each with a live count of the boards they've made
// public, ranked by that count (most-shared first, then name) so the directory
// opens on its most active authors. Users with no public boards still appear —
// a profile with nothing shared yet is a valid, if empty, page.
//
// The count is a correlated subquery rather than a GROUP BY join so a user with
// zero public boards isn't dropped and doesn't need a coalesce; a missing match
// is simply 0. Ranking happens in JS: the directory is a page of people, not a
// feed, so there's nothing to gain from pushing the sort into Postgres.
export async function listPeople(): Promise<PersonSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      picture: users.picture,
      publicBoardCount: db.$count(
        boards,
        and(eq(boards.ownerId, users.id), eq(boards.isPublic, true)),
      ),
    })
    .from(users)
    .where(ne(users.id, ANONYMOUS))

  return rows
    .map((row) => ({
      id: row.id,
      username: row.username,
      displayName: displayNameFor(row),
      picture: row.picture,
      publicBoardCount: Number(row.publicBoardCount),
    }))
    .sort(
      (a, b) =>
        b.publicBoardCount - a.publicBoardCount ||
        a.displayName.localeCompare(b.displayName),
    )
}

// Resolve a profile from the value in a `/u/[handle]` URL, which is either a
// username (the nice case, for anyone who has one) or the raw identity id (the
// fallback for accounts that predate a captured username). Username wins when
// both could match, so the readable URL is the canonical one.
export async function getPersonByHandle(handle: string): Promise<PersonSummary | null> {
  const decoded = decodeURIComponent(handle)

  const [byUsername] = await db
    .select()
    .from(users)
    .where(and(ne(users.id, ANONYMOUS), eq(users.username, decoded)))
    .limit(1)

  const resolved =
    byUsername ??
    (
      await db
        .select()
        .from(users)
        .where(and(ne(users.id, ANONYMOUS), eq(users.id, decoded)))
        .limit(1)
    )[0]

  if (!resolved) return null

  const publicBoardCount = await db.$count(
    boards,
    and(eq(boards.ownerId, resolved.id), eq(boards.isPublic, true)),
  )

  return {
    id: resolved.id,
    username: resolved.username,
    displayName: displayNameFor(resolved),
    picture: resolved.picture,
    publicBoardCount,
  }
}
