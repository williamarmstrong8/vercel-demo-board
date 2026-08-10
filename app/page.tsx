import { redirect } from "next/navigation"
import { listMyBoards, listSharedBoards } from "@/app/actions/boards"
import { BoardCard } from "@/components/home/board-card"
import { NewBoardButton } from "@/components/home/new-board-button"
import { AiBoardBuilder } from "@/components/home/ai-board-builder"
import { AppShell } from "@/components/app-shell"
import { getCurrentUser } from "@/lib/auth"
import { upsertUser } from "@/lib/users/service"

export default async function HomePage() {
  const user = await getCurrentUser()

  // proxy.ts already turns signed-out visitors away on the cookie alone; this
  // is the authoritative check behind it, and the one that catches a cookie
  // holding an expired or forged token.
  if (!user) redirect("/signin")

  // Refresh this person's directory entry on the way in. It's the reliable place
  // to catch every signed-in user — including the dev-bypass identity, which
  // never touches the OAuth callback — and a profile cache write must never sink
  // the dashboard, so a failure is logged and swallowed.
  await upsertUser(user).catch((error) => {
    console.error("Failed to sync user profile", error)
  })

  const [myBoards, sharedBoards] = await Promise.all([listMyBoards(), listSharedBoards()])

  return (
    <AppShell
      user={{ displayName: user.displayName, email: user.email }}
      actions={<NewBoardButton />}
    >
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
    </AppShell>
  )
}
