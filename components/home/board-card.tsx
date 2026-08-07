"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, Globe, Lock, MoreVertical, Pencil, Star, Trash2 } from "lucide-react"
import {
  deleteBoard,
  duplicateBoard,
  renameBoard,
  setBoardVisibility,
  toggleBoardStar,
  type BoardSummary,
} from "@/app/actions/boards"
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
  // Only the viewer's own star is tracked locally; the total is derived from the
  // server's count plus that one vote, so a refresh can't double-count it. This
  // has its own transition, separate from the shared `pending` below, so
  // starring never dims the whole card — just the one button.
  const [starred, setStarred] = useState(board.isStarred)
  const [starPending, startStarTransition] = useTransition()
  const starCount = board.starCount + (starred === board.isStarred ? 0 : starred ? 1 : -1)
  // Delete needs a second, distinct click before it does anything — this is
  // the flag for "the next click on this same button is the real one".
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // Whatever closes the menu — clicking away, rename, publish/unpublish —
  // also drops back out of the "confirm delete" state, so reopening the menu
  // later never lands straight on the armed button.
  useEffect(() => {
    if (!menuOpen) setConfirmingDelete(false)
  }, [menuOpen])

  // A safety net for "opened the menu, got distracted": the armed state
  // quietly disarms itself rather than sitting there indefinitely.
  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

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

  const toggleVisibility = () => {
    setMenuOpen(false)
    startTransition(async () => {
      await setBoardVisibility(board.id, !board.isPublic)
      router.refresh()
    })
  }

  const remove = () => {
    setMenuOpen(false)
    setConfirmingDelete(false)
    startTransition(async () => {
      await deleteBoard(board.id)
      router.refresh()
    })
  }

  // Copies straight into a new board of your own, then jumps there — the
  // point of duplicating is to start editing, not to admire the copy sitting
  // back in the grid.
  const duplicate = () => {
    setMenuOpen(false)
    startTransition(async () => {
      try {
        router.push(`/board/${await duplicateBoard(board.id)}`)
      } catch {
        router.refresh()
      }
    })
  }

  // Flips immediately and reconciles against the server, entirely client-side —
  // no router.refresh(), so the rest of the card (and grid) never re-renders
  // just because one star changed. A rejected star is a dead end, not a
  // broken page, so a failure just puts the button back.
  const toggleStar = () => {
    setStarred((previous) => !previous)
    startStarTransition(async () => {
      try {
        setStarred(await toggleBoardStar(board.id))
      } catch {
        setStarred(board.isStarred)
      }
    })
  }

  return (
    <div className={cn("group relative flex flex-col", pending && "opacity-60")}>
      <button
        onClick={open}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-md"
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

        {/* On your own boards this reads as status; the shared grid is public by
            definition, so a badge there would be noise. */}
        {board.isOwner && board.isPublic && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-foreground/85 px-1.5 py-0.5 text-[11px] font-medium text-background">
            <Globe className="size-3" />
            Public
          </span>
        )}
      </button>

      <div className="mt-2.5 space-y-0.5 px-0.5">
        <div className="flex items-center gap-1">
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
          </div>

          {/* Every card gets the same always-visible menu; what's inside it
              depends on ownership, since rename, publish and delete are the
              owner's alone while anyone can take a copy. */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Options for ${board.name}`}
              aria-expanded={menuOpen}
            >
              <MoreVertical className="size-4" />
            </button>
            {menuOpen && (
              <div className="dark absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl">
                {board.isOwner && (
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
                )}
                <button
                  onClick={duplicate}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                {board.isOwner && (
                  <>
                    <button
                      onClick={toggleVisibility}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {board.isPublic ? (
                        <>
                          <Lock className="size-3.5" />
                          Make private
                        </>
                      ) : (
                        <>
                          <Globe className="size-3.5" />
                          Make public
                        </>
                      )}
                    </button>
                    {confirmingDelete ? (
                      <button
                        onClick={remove}
                        className="flex w-full items-center gap-2 bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90"
                      >
                        <Trash2 className="size-3.5" />
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmingDelete(true)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {board.isOwner || !board.authorName
              ? `Edited ${timeAgo(board.updatedAt)}`
              : `${board.authorName} · ${timeAgo(board.updatedAt)}`}
          </p>

          {/* Stars only mean something on a public board. Your own board shows
              the tally as read-out — you don't get to vote for yourself. Sits
              right next to the timestamp rather than pinned to the far edge,
              so the line reads as one piece of metadata. */}
          {board.isPublic &&
            (board.isOwner ? (
              <span
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                title={`${starCount} ${starCount === 1 ? "star" : "stars"}`}
              >
                <Star className="size-3.5" />
                {starCount}
              </span>
            ) : (
              <button
                onClick={toggleStar}
                disabled={starPending}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-1 text-xs transition-colors hover:bg-muted disabled:opacity-60",
                  starred
                    ? "text-amber-500 hover:text-amber-500"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={starred ? `Remove star from ${board.name}` : `Star ${board.name}`}
                aria-pressed={starred}
                title={starred ? "Remove star" : "Star this board"}
              >
                <Star className={cn("size-3.5", starred && "fill-current")} />
                {starCount}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
