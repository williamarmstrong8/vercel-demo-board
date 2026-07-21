"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CanvasSurface } from "@/components/whiteboard/canvas-surface"
import { Toolbar } from "@/components/whiteboard/toolbar"
import { PropertiesPanel } from "@/components/whiteboard/properties-panel"
import { ZoomControls } from "@/components/whiteboard/zoom-controls"
import { ModeToggle } from "@/components/whiteboard/mode-toggle"
import { BoardTopBar } from "@/components/whiteboard/board-top-bar"
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

const AUTOSAVE_DELAY = 1000

type PendingSave = {
  project: Project
  revision: number
}

export function BoardEditor({ board }: { board: BoardSummary }) {
  const loadBoard = useWhiteboard((s) => s.loadBoard)
  const [ready, setReady] = useState(false)
  const canEdit = board.canEdit ?? false
  const revisionRef = useRef(0)
  const pendingRef = useRef<PendingSave | null>(null)
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => void>(() => undefined)

  const flushAutosave = useCallback(() => {
    if (!canEdit || savingRef.current || !pendingRef.current) return

    const pending = pendingRef.current
    pendingRef.current = null
    savingRef.current = true

    void saveBoard(board.id, {
      name: pending.project.name,
      data: {
        elements: pending.project.elements,
        connections: pending.project.connections ?? [],
        camera: pending.project.camera,
      },
    })
      .then(() => {
        if (revisionRef.current === pending.revision && !pendingRef.current) {
          clearBoardDraft(board.id)
        }
      })
      .catch(() => {
        // Keep the local draft as the recovery copy. A later edit or Cmd/Ctrl+S
        // will retry with the newest board snapshot.
        if (!pendingRef.current) pendingRef.current = pending
      })
      .finally(() => {
        savingRef.current = false
        if (pendingRef.current && pendingRef.current.revision > pending.revision) {
          flushRef.current()
        }
      })
  }, [board.id, canEdit])
  flushRef.current = flushAutosave

  const queueAutosave = useCallback(
    (project: Project, immediate = false) => {
      if (!canEdit) return
      const revision = revisionRef.current + 1
      revisionRef.current = revision
      pendingRef.current = { project, revision }

      if (timerRef.current) clearTimeout(timerRef.current)
      if (immediate) {
        flushRef.current()
      } else {
        timerRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DELAY)
      }
    },
    [canEdit],
  )

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

    // Prefer a local recovery draft and immediately queue it for cloud sync.
    const draft = canEdit ? readBoardDraft(board.id) : null
    const initial = draft ?? cloud
    loadBoard(initial)
    if (canEdit) {
      enableCloudDraft(board.id, queueAutosave)
      if (draft) queueAutosave(draft)
    }

    setReady(true)
    return () => {
      disableCloudDraft()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [board, canEdit, loadBoard, queueAutosave])

  // Cmd/Ctrl+S remains an invisible shortcut that flushes the same autosave queue.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        const current = useWhiteboard.getState().current()
        queueAutosave(current, true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [queueAutosave])

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

      {/* Top-left: back / board name */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <BoardTopBar boardId={board.id} canEdit={canEdit} />
        </div>
        <div className="pointer-events-auto">
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
