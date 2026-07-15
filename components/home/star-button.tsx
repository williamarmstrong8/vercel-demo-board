"use client"

import { useOptimistic, useTransition } from "react"
import { Star } from "lucide-react"
import { starBoard, unstarBoard } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

export function StarButton({
  boardId,
  starCount,
  isStarred,
}: {
  boardId: string
  starCount: number
  isStarred: boolean
}) {
  const [, startTransition] = useTransition()
  const [state, setOptimistic] = useOptimistic(
    { starred: isStarred, count: starCount },
    (prev, next: boolean) => ({
      starred: next,
      count: prev.count + (next ? 1 : -1),
    }),
  )

  const toggle = () => {
    startTransition(async () => {
      const next = !state.starred
      setOptimistic(next)
      if (next) await starBoard(boardId)
      else await unstarBoard(boardId)
    })
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        state.starred
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-pressed={state.starred}
      aria-label={state.starred ? "Unstar board" : "Star board"}
      title={state.starred ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={cn("size-3.5", state.starred && "fill-current")} />
      {state.count}
    </button>
  )
}
