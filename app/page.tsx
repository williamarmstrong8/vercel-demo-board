import { listMyBoards } from "@/app/actions/boards"
import { BoardCard } from "@/components/home/board-card"
import { NewBoardButton } from "@/components/home/new-board-button"

function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" className={className} aria-hidden="true">
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  )
}

export default async function HomePage() {
  const myBoards = await listMyBoards()

  return (
    <main className="light min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <VercelMark className="size-4" />
            <span className="text-sm font-semibold tracking-tight">Canvas</span>
          </div>
          <NewBoardButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Your infinite whiteboards
          </h1>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Sketch architectures, flows, and demos on an infinite canvas. Boards are saved to your
            account and sync across devices.
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

      </div>
    </main>
  )
}
