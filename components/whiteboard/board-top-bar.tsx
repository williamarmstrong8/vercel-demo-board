"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"

export function BoardTopBar({
  canEdit = true,
  authorName = null,
}: {
  canEdit?: boolean
  authorName?: string | null
}) {
  const current = useWhiteboard((s) => s.current())
  const renameProject = useWhiteboard((s) => s.renameProject)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current.name)
  const router = useRouter()

  const commit = () => {
    setEditing(false)
    if (draft.trim()) renameProject(current.id, draft.trim())
    else setDraft(current.name)
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
        </>
      )}
    </div>
  )
}
