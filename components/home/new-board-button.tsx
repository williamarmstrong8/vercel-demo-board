"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { createBoard } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

export function NewBoardButton({ variant = "solid" }: { variant?: "solid" | "tile" }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const create = () => {
    startTransition(async () => {
      const id = await createBoard()
      router.push(`/board/${id}`)
    })
  }

  if (variant === "tile") {
    return (
      <button
        onClick={create}
        disabled={pending}
        className="relative flex w-full flex-col overflow-hidden rounded-xl border border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60"
      >
        {/* invisible sizer matching BoardCard's 4:3 thumbnail + title/timestamp
            footer, so this tile's total height lines up with real board cards */}
        <span aria-hidden className="aspect-[4/3] w-full" />
        <span aria-hidden className="w-full px-3 py-2.5">
          <span className="block h-5" />
          <span className="mt-0.5 block h-4" />
        </span>
        {/* the plus + label are centered over the whole card, not just the
            thumbnail area, so they sit in the visual middle of the tile */}
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Plus className="size-6" />
          <span className="text-sm font-medium">{pending ? "Creating…" : "New board"}</span>
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={create}
      disabled={pending}
      className={cn(
        "flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60",
      )}
    >
      <Plus className="size-4" />
      {pending ? "Creating…" : "New board"}
    </button>
  )
}
