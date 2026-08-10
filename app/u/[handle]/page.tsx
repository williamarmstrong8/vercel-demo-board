import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { BoardCard } from "@/components/home/board-card"
import { PersonAvatar } from "@/components/people/person-avatar"
import { listPublicBoardsByOwner } from "@/lib/boards/service"
import { getCurrentUser } from "@/lib/auth"
import { getPersonByHandle } from "@/lib/users/service"

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const viewer = await getCurrentUser()
  if (!viewer) redirect("/signin")

  const { handle } = await params
  const person = await getPersonByHandle(handle)
  // A handle that resolves to nobody is a 404, same as a private or missing
  // board — a profile page only ever shows what's already public.
  if (!person) notFound()

  const boards = await listPublicBoardsByOwner(person.id)
  const isSelf = person.id === viewer.id

  return (
    <AppShell
      user={{ displayName: viewer.displayName, email: viewer.email }}
      title={person.displayName}
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/people"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All people
        </Link>

        {/* Profile header */}
        <section className="mb-12 flex items-center gap-4">
          <PersonAvatar
            name={person.displayName}
            picture={person.picture}
            className="size-16 text-xl"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {person.displayName}
              </h1>
              {isSelf && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  You
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {person.username && <span>@{person.username} · </span>}
              {person.publicBoardCount} public{" "}
              {person.publicBoardCount === 1 ? "board" : "boards"}
            </p>
          </div>
        </section>

        {/* Public boards */}
        {boards.length > 0 ? (
          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {isSelf
                ? "You haven't shared any boards yet. Make one public and it'll appear here."
                : `${person.displayName} hasn't shared any boards yet.`}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
