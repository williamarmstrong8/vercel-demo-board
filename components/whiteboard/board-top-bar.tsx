"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Copy, Lock } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { cloneBoard } from "@/app/actions/boards"

export function BoardTopBar({
  boardId,
  canEdit,
}: {
  boardId: string
  canEdit: boolean
}) {
  const current = useWhiteboard((s) => s.current())
  const renameProject = useWhiteboard((s) => s.renameProject)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current.name)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const commit = () => {
    setEditing(false)
    if (draft.trim()) renameProject(current.id, draft.trim())
    else setDraft(current.name)
  }

  const clone = () => {
    startTransition(async () => {
      const id = await cloneBoard(boardId)
      if (id) router.push(`/board/${id}`)
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
      ) : (
        <button
          onClick={() => canEdit && (setDraft(current.name), setEditing(true))}
          className="flex items-center gap-1.5 truncate font-medium"
          title={canEdit ? "Rename board" : current.name}
        >
          <span className="max-w-[200px] truncate">{current.name}</span>
        </button>
      )}

      {!canEdit && (
        <>
          <span className="flex items-center gap-1 rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            <Lock className="size-3" />
            Read-only
          </span>
          <button
            onClick={clone}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Copy className="size-3.5" />
            {pending ? "Cloning…" : "Clone to edit"}
          </button>
        </>
      )}
    </div>
  )
}
