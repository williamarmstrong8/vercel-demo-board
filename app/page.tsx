import { redirect } from "next/navigation"
import { listMyBoards, listSharedBoards } from "@/app/actions/boards"
import { BoardCard } from "@/components/home/board-card"
import { NewBoardButton } from "@/components/home/new-board-button"
import { AiBoardBuilder } from "@/components/home/ai-board-builder"
import { UserMenu } from "@/components/home/user-menu"
import { VercelMark } from "@/components/vercel-mark"
import { getCurrentUser } from "@/lib/auth"

export default async function HomePage() {
  const user = await getCurrentUser()

  // proxy.ts already turns signed-out visitors away on the cookie alone; this
  // is the authoritative check behind it, and the one that catches a cookie
  // holding an expired or forged token.
  if (!user) redirect("/signin")

  const [myBoards, sharedBoards] = await Promise.all([listMyBoards(), listSharedBoards()])

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
            <UserMenu displayName={user.displayName} email={user.email} />
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
            Sketch architectures, flows, and demos on an infinite canvas. Boards you create are
            private to your Vercel account until you choose to share them.
          </p>
        </section>

        {/* Personal */}
        <section className="mb-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Your boards
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {myBoards.length}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 items-start gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <NewBoardButton variant="tile" />
            {myBoards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </section>

        {/* Shared */}
        <section className="mb-16">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Shared boards
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {sharedBoards.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Boards other people have made public, ranked by stars. Open to read; only their
              owner can edit them.
            </p>
          </div>

          {sharedBoards.length > 0 ? (
            <div className="grid grid-cols-1 items-start gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sharedBoards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing shared yet. Make one of your boards public to see it here.
              </p>
            </div>
          )}
        </section>
      </div>

      <AiBoardBuilder />
    </main>
  )
}
