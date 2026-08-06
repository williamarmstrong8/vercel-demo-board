import { listBoards } from "@/app/actions/boards"
import { BoardCard } from "@/components/home/board-card"
import { NewBoardButton } from "@/components/home/new-board-button"
import { AiBoardBuilder } from "@/components/home/ai-board-builder"
import { getCurrentUser } from "@/lib/auth"

function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" className={className} aria-hidden="true">
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  )
}

// Each of these is fixed somewhere different, so name the cause rather than
// sending everyone back through the same failing button.
const AUTH_ERRORS: Record<string, string> = {
  invalid_scope: "This app is not allowed to request one of the sign in scopes.",
  access_denied: "Sign in was cancelled.",
  not_configured: "Sign in is not configured on this deployment.",
  handshake_expired: "Sign in took too long. Please try again.",
  token_exchange_failed: "Vercel rejected this app's credentials.",
  missing_id_token: "Vercel did not return an identity token.",
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>
}) {
  const [boards, user, params] = await Promise.all([listBoards(), getCurrentUser(), searchParams])

  return (
    <main className="light min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2">
            <VercelMark className="size-4" />
            <span className="text-sm font-semibold tracking-tight">Canvas</span>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-medium">{user.displayName}</div>
                {user.email && user.email !== user.displayName && (
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                )}
              </div>
              <form action="/api/auth/signout" method="post">
                <button className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" type="submit">
                  Sign out
                </button>
              </form>
              <NewBoardButton />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                href="/api/auth/authorize"
              >
                Sign in with Vercel
              </a>
              <NewBoardButton />
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {params.auth_error && (
          <p className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {AUTH_ERRORS[params.auth_error] ?? "Sign in did not complete. Please try again."}{" "}
            <span className="text-destructive/70">({params.auth_error})</span>
          </p>
        )}
        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Your infinite whiteboards
          </h1>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Sketch architectures, flows, and demos on an infinite canvas. Boards remain shared
            and open to everyone; sign in with Vercel to use your Vercel identity.
          </p>
        </section>

        {/* Boards */}
        <section className="mb-16">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              All boards
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {boards.length}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <NewBoardButton variant="tile" />
            {boards.map((board) => (
              <BoardCard key={board.id} board={board} />
            ))}
          </div>
        </section>

      </div>

      <AiBoardBuilder />
    </main>
  )
}
