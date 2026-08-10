"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import type { PersonSummary } from "@/lib/users/service"
import { profileHref } from "@/lib/users/href"
import { PersonAvatar } from "@/components/people/person-avatar"
import { Input } from "@/components/ui/input"

function boardCountLabel(count: number): string {
  return `${count} public ${count === 1 ? "board" : "boards"}`
}

// The people directory: everyone the app knows about, searchable by name or
// @username, already ranked by most-shared (see listPeople). Filtering is
// client-side over the full list the server handed down — a directory is small
// enough that a round trip per keystroke would be pure latency, and instant
// filtering is the whole point of a search box.
export function PeopleDirectory({ people }: { people: PersonSummary[] }) {
  const [query, setQuery] = useState("")

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (person) =>
        person.displayName.toLowerCase().includes(q) ||
        person.username?.toLowerCase().includes(q),
    )
  }, [people, query])

  return (
    <div>
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people by name or username"
          aria-label="Search people"
          className="pl-9"
        />
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {people.length === 0
              ? "No one's here yet. Profiles show up as people sign in and share boards."
              : `No people match “${query}”.`}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((person) => (
            <li key={person.id}>
              <Link
                href={profileHref(person)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/25 hover:bg-muted"
              >
                <PersonAvatar
                  name={person.displayName}
                  picture={person.picture}
                  className="size-10 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {person.displayName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {person.username && <span>@{person.username} · </span>}
                    {boardCountLabel(person.publicBoardCount)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
