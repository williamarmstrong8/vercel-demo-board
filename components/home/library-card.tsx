"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, Eye } from "lucide-react"
import { cloneBoard, type BoardSummary } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

export function LibraryCard({ board }: { board: BoardSummary }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const view = () => router.push(`/board/${board.id}`)

  const clone = () => {
    startTransition(async () => {
      const newId = await cloneBoard(board.id)
      if (newId) router.push(`/board/${newId}`)
    })
  }

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30",
        pending && "opacity-60",
      )}
    >
      <button
        onClick={view}
        className="relative block aspect-[4/3] w-full overflow-hidden border-b border-border bg-white"
        aria-label={`Preview ${board.name}`}
      >
        {/* Live, pixel-perfect render of the real board (isolated per iframe). */}
        <iframe
          src={`/board/${board.id}/preview`}
          title={`Preview of ${board.name}`}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none h-full w-full border-0"
        />
      </button>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{board.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">by {board.authorName ?? "Vercel"}</p>
          {board.description ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {board.description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2">
          <button
            onClick={clone}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Copy className="size-3.5" />
            {pending ? "Cloning…" : "Clone"}
          </button>
          <button
            onClick={view}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Eye className="size-3.5" />
            View
          </button>
        </div>
      </div>
    </div>
  )
}
