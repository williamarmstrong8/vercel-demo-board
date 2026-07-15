"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Globe, Lock } from "lucide-react"
import { setBoardVisibility } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

export function PublishToggle({
  boardId,
  initialIsPublic,
  initialDescription,
}: {
  boardId: string
  initialIsPublic: boolean
  initialDescription: string | null
}) {
  const [open, setOpen] = useState(false)
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [description, setDescription] = useState(initialDescription ?? "")
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const apply = (nextPublic: boolean, nextDescription: string) => {
    setIsPublic(nextPublic)
    startTransition(async () => {
      await setBoardVisibility(boardId, nextPublic, nextDescription)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium shadow-2xl transition-colors",
          isPublic
            ? "border-emerald-500/30 bg-emerald-950 text-emerald-300 hover:bg-emerald-900"
            : "border-white/10 bg-neutral-900 text-neutral-300 hover:bg-neutral-800",
        )}
        title={isPublic ? "This board is public" : "This board is private"}
      >
        {isPublic ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
        {isPublic ? "Public" : "Private"}
      </button>

      {open && (
        <div className="dark absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-2xl">
          <p className="text-sm font-medium">Board visibility</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPublic
              ? "Anyone can find this board in the community library, clone it, and star it."
              : "Only you can see this board."}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => apply(false, description)}
              disabled={pending}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                !isPublic
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              <Lock className="size-3.5" />
              Private
            </button>
            <button
              onClick={() => apply(true, description)}
              disabled={pending}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                isPublic
                  ? "border-emerald-500 bg-emerald-600 text-white"
                  : "border-border hover:bg-muted",
              )}
            >
              <Globe className="size-3.5" />
              Public
            </button>
          </div>

          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => apply(isPublic, description)}
              rows={2}
              placeholder="What is this board about? (shown in the library)"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-foreground"
            />
          </label>
          {pending ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Saving…</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
