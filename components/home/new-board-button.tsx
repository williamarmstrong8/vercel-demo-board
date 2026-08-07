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
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card text-muted-foreground shadow-sm transition-[border-color,box-shadow,color] hover:border-foreground/40 hover:text-foreground hover:shadow-md disabled:opacity-60"
      >
        <Plus className="size-6" />
        <span className="text-sm font-medium">{pending ? "Creating…" : "New board"}</span>
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
