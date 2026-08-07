"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Copy, Eye, Star } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { duplicateBoard, toggleBoardStar } from "@/app/actions/boards"

export function BoardTopBar({
  canEdit = true,
  authorName = null,
  initialStarCount = 0,
  initiallyStarred = false,
}: {
  canEdit?: boolean
  authorName?: string | null
  initialStarCount?: number
  initiallyStarred?: boolean
}) {
  const current = useWhiteboard((s) => s.current())
  const renameProject = useWhiteboard((s) => s.renameProject)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current.name)
  const [duplicating, startDuplicate] = useTransition()
  const [starring, startStar] = useTransition()
  const [starred, setStarred] = useState(initiallyStarred)
  const starCount = initialStarCount + (starred === initiallyStarred ? 0 : starred ? 1 : -1)
  const router = useRouter()

  const commit = () => {
    setEditing(false)
    if (draft.trim()) renameProject(current.id, draft.trim())
    else setDraft(current.name)
  }

  // The whole point of duplicating a read-only board is to get an editable
  // one, so this lands straight on the new copy rather than back on "/".
  const duplicate = () => {
    startDuplicate(async () => {
      const id = await duplicateBoard(current.id)
      router.push(`/board/${id}`)
    })
  }

  const toggleStar = () => {
    setStarred((previous) => !previous)
    startStar(async () => {
      try {
        setStarred(await toggleBoardStar(current.id))
      } catch {
        setStarred(initiallyStarred)
      }
    })
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 py-1.5 pl-2 pr-2 text-sm text-white">
      <button
        onClick={() => router.push("/")}
        className="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
        aria-label="Back to boards"
      >
        <ArrowLeft className="size-4" />
      </button>

      <div className="h-4 w-px bg-white/10" />

      {editing && canEdit ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === "Enter") commit()
            if (event.key === "Escape") {
              setDraft(current.name)
              setEditing(false)
            }
          }}
          className="w-40 rounded border border-white/15 bg-neutral-800 px-1.5 py-0.5 text-sm text-white outline-none focus:border-white/40"
        />
      ) : canEdit ? (
        <button
          onClick={() => {
            setDraft(current.name)
            setEditing(true)
          }}
          className="flex items-center gap-1.5 truncate font-medium"
          title="Rename board"
        >
          <span className="max-w-[200px] truncate">{current.name}</span>
        </button>
      ) : (
        <span className="max-w-[200px] truncate font-medium">{current.name}</span>
      )}

      {/* Says why the toolbar is missing, and credits whoever shared the board. */}
      {!canEdit && (
        <>
          <div className="h-4 w-px bg-white/10" />
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
            title={authorName ? `Shared by ${authorName}` : "Shared board"}
          >
            <Eye className="size-3.5" />
            View only
            {authorName && (
              <span className="hidden max-w-[140px] truncate text-neutral-500 sm:inline">
                · {authorName}
              </span>
            )}
          </span>

          {/* Can't edit this one, but can always take a copy. */}
          <button
            onClick={duplicate}
            disabled={duplicating}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Copy className="size-3.5" />
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <button
            onClick={toggleStar}
            disabled={starring}
            className={`flex shrink-0 items-center gap-1.5 rounded-none bg-neutral-800 px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              starred ? "text-amber-400" : "text-neutral-200 hover:text-white"
            }`}
            aria-label={starred ? "Remove star" : "Star this board"}
            aria-pressed={starred}
          >
            <Star className={`size-3.5 ${starred ? "fill-current" : ""}`} />
            {starCount}
          </button>
        </>
      )}
    </div>
  )
}
