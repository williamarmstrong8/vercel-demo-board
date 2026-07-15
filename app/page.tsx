import {
  listFavoriteBoards,
  listMyBoards,
  listPublicBoards,
  searchPublicBoards,
} from "@/app/actions/boards"
import { getCurrentUser } from "@/lib/auth/current-user"
import { BoardCard } from "@/components/home/board-card"
import { LibraryCard } from "@/components/home/library-card"
import { NewBoardButton } from "@/components/home/new-board-button"
import { LibrarySearch } from "@/components/home/library-search"
import { UserMenu } from "@/components/home/user-menu"
import { Star } from "lucide-react"

function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" className={className} aria-hidden="true">
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ""

  const [user, myBoards, favorites, libraryBoards] = await Promise.all([
    getCurrentUser(),
    listMyBoards(),
    listFavoriteBoards(),
    query ? searchPublicBoards(query) : listPublicBoards(),
  ])

  return (
    <main className="light min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <VercelMark className="size-4" />
            <span className="text-sm font-semibold tracking-tight">Canvas</span>
          </div>
          <div className="flex items-center gap-3">
            <NewBoardButton />
            {user ? (
              <UserMenu user={{ name: user.name, email: user.email, image: user.image }} />
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Your infinite whiteboards
          </h1>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Sketch architectures, flows, and demos on an infinite canvas. Boards are private to your
            account by default — publish one to share it with the community library.
          </p>
        </section>

        {/* My boards */}
        <section className="mb-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Your boards
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {myBoards.length}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <NewBoardButton variant="tile" />
            {myBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </section>

        {/* Favorites */}
        {favorites.length > 0 ? (
          <section className="mb-16">
            <div className="mb-1 flex items-center gap-2">
              <Star className="size-4 text-amber-500" />
              <h2 className="text-lg font-semibold tracking-tight">
                Your favorites
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {favorites.length}
                </span>
              </h2>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              Public boards you&apos;ve starred.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((board) => (
                <LibraryCard key={board.id} board={board} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Public library */}
        <section>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <VercelMark className="size-3.5 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-tight">Community library</h2>
            </div>
            <LibrarySearch initialQuery={query} />
          </div>
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            Public boards shared by the community. Open one to explore, clone it into your own boards,
            or star it to save it to your favorites.
          </p>

          {libraryBoards.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {query
                ? `No public boards match “${query}”.`
                : "No public boards yet. Publish one from its editor to share it here."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {libraryBoards.map((board) => (
                <LibraryCard key={board.id} board={board} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
