"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { deleteBoard, renameBoard, type BoardSummary } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function BoardCard({ board }: { board: BoardSummary }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(board.name)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const open = () => router.push(`/board/${board.id}`)

  const commitRename = () => {
    setRenaming(false)
    const next = name.trim()
    if (!next || next === board.name) {
      setName(board.name)
      return
    }
    startTransition(async () => {
      await renameBoard(board.id, next)
      router.refresh()
    })
  }

  const remove = () => {
    setMenuOpen(false)
    startTransition(async () => {
      await deleteBoard(board.id)
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-foreground/30",
        pending && "opacity-60",
      )}
    >
      <button
        onClick={open}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-xl border-b border-border bg-white"
        aria-label={`Open ${board.name}`}
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

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") {
                  setName(board.name)
                  setRenaming(false)
                }
              }}
              className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-foreground"
            />
          ) : (
            <button onClick={open} className="block w-full truncate text-left text-sm font-medium">
              {board.name}
            </button>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Edited {timeAgo(board.updatedAt)}
          </p>
        </div>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menuOpen}
            aria-label="Board options"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div className="dark absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Pencil className="size-3.5" />
                Rename
              </button>
              <button
                onClick={remove}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
