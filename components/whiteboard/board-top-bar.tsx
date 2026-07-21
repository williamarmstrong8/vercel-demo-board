"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Copy, Loader2, Lock, Save } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { cloneBoard } from "@/app/actions/boards"
import { cn } from "@/lib/utils"

export function BoardTopBar({
  boardId,
  canEdit,
  dirty,
  saving,
  onSave,
}: {
  boardId: string
  canEdit: boolean
  dirty: boolean
  saving: boolean
  onSave: () => void
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

  const goBack = () => {
    if (
      dirty &&
      !window.confirm(
        "You have unsaved changes. Leave anyway?\n\nYour draft is kept on this device, but the board won't update on your home page until you save.",
      )
    ) {
      return
    }
    router.push("/")
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
        onClick={goBack}
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
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
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
          {canEdit && dirty && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-amber-400"
              aria-label="Unsaved changes"
              title="Unsaved changes"
            />
          )}
        </button>
      )}

      {canEdit ? (
        <>
          <div className="h-4 w-px bg-white/10" />
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              dirty && !saving
                ? "bg-white text-black hover:opacity-90"
                : "cursor-default text-neutral-400",
            )}
            title={dirty ? "Save to your account (⌘S)" : "All changes saved"}
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving
              </>
            ) : dirty ? (
              <>
                <Save className="size-3.5" />
                Save
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                Saved
              </>
            )}
          </button>
        </>
      ) : (
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
