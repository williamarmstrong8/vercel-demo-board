// The URL path for a person's profile: their username when they have one,
// otherwise their raw identity id. Lives in its own module — with no `db` import
// — so client components can build profile links without pulling the Postgres
// client into the browser bundle. getPersonByHandle() resolves the same scheme
// on the way back in (username first, then id).
export function profileHref(person: { id: string; username: string | null }): string {
  return `/u/${encodeURIComponent(person.username ?? person.id)}`
}
