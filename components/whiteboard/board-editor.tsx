"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CanvasSurface } from "@/components/whiteboard/canvas-surface"
import { Toolbar } from "@/components/whiteboard/toolbar"
import { PropertiesPanel } from "@/components/whiteboard/properties-panel"
import { ZoomControls } from "@/components/whiteboard/zoom-controls"
import { ModeToggle } from "@/components/whiteboard/mode-toggle"
import { BoardTopBar } from "@/components/whiteboard/board-top-bar"
import { PublishToggle } from "@/components/whiteboard/publish-toggle"
import {
  useWhiteboard,
  enableCloudDraft,
  disableCloudDraft,
  readBoardDraft,
  clearBoardDraft,
} from "@/lib/whiteboard/store"
import { saveBoard } from "@/app/actions/boards"
import type { BoardSummary } from "@/app/actions/boards"
import type { Project } from "@/lib/whiteboard/types"

export function BoardEditor({ board }: { board: BoardSummary }) {
  const loadBoard = useWhiteboard((s) => s.loadBoard)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const canEdit = board.canEdit ?? false

  // Mirror `dirty` into a ref so the beforeunload handler always reads the
  // latest value without re-subscribing.
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  useEffect(() => {
    const now = Date.now()
    const cloud: Project = {
      id: board.id,
      name: board.name,
      elements: board.data.elements ?? [],
      connections: board.data.connections ?? [],
      camera: board.data.camera ?? { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    }

    // Prefer a local draft (unsaved work from a previous session) over the
    // cloud copy so a reload / accidental close never loses edits.
    const draft = canEdit ? readBoardDraft(board.id) : null
    loadBoard(draft ?? cloud)
    setDirty(!!draft)

    if (canEdit) enableCloudDraft(board.id, setDirty)

    setReady(true)
    return () => disableCloudDraft()
  }, [board, canEdit, loadBoard])

  const handleSave = useCallback(() => {
    if (!canEdit || saving) return
    const b = useWhiteboard.getState().current()
    setSaving(true)
    saveBoard(board.id, {
      name: b.name,
      data: {
        elements: b.elements,
        connections: b.connections ?? [],
        camera: b.camera,
      },
    })
      .then(() => {
        clearBoardDraft(board.id) // also flips dirty -> false via the listener
        setDirty(false)
      })
      .finally(() => setSaving(false))
  }, [board.id, canEdit, saving])

  // Warn before closing/reloading the tab with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleSave])

  if (!ready) {
    return (
      <main className="flex h-dvh w-dvw items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
          Loading board…
        </div>
      </main>
    )
  }

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-background">
      <CanvasSurface />

      {/* Top-left: back / board name / save status */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <BoardTopBar
            boardId={board.id}
            canEdit={canEdit}
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {canEdit ? (
            <PublishToggle
              boardId={board.id}
              initialIsPublic={board.isPublic}
              initialDescription={board.description}
            />
          ) : null}
          <ModeToggle />
        </div>
      </div>

      {/* Top-center: toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
        <div className="pointer-events-auto">
          <Toolbar />
        </div>
      </div>

      {/* Right: properties */}
      <div className="pointer-events-none absolute right-3 top-20 bottom-3 z-30 flex flex-col items-end">
        <PropertiesPanel />
      </div>

      {/* Bottom-left: zoom */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-30">
        <div className="pointer-events-auto">
          <ZoomControls />
        </div>
      </div>
    </main>
  )
}
