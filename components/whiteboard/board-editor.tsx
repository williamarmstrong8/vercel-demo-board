"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CanvasSurface } from "@/components/whiteboard/canvas-surface"
import { Toolbar } from "@/components/whiteboard/toolbar"
import { PropertiesPanel } from "@/components/whiteboard/properties-panel"
import { ZoomControls } from "@/components/whiteboard/zoom-controls"
import { BoardTopBar } from "@/components/whiteboard/board-top-bar"
import { BoardBackgroundMenu } from "@/components/whiteboard/board-background-menu"
import { SiteThemeProvider } from "@/components/site-theme"
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

// The one and only debounce between "the user changed something" and "it's
// written to Postgres". store.ts notifies us on every substantive change with
// no debounce of its own, so this is the single place autosave timing lives.
const AUTOSAVE_DELAY = 500

type PendingSave = {
  project: Project
  revision: number
}

// Server Actions can't be targeted by navigator.sendBeacon (it needs a real
// URL), and a normal fetch isn't guaranteed to finish once the page starts
// tearing down — so the lifecycle flush below hits a plain API route instead.
function beaconFlush(boardId: string, project: Project) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return
  const payload = JSON.stringify({
    id: boardId,
    name: project.name,
    data: {
      elements: project.elements,
      camera: project.camera,
      backgroundStyle: project.backgroundStyle,
    },
  })
  navigator.sendBeacon("/api/boards/flush", new Blob([payload], { type: "application/json" }))
}

export function BoardEditor({
  board,
  boardId,
  canEdit,
}: {
  board: BoardSummary | null
  boardId: string
  // False when viewing someone else's public board. Turns the whole surface
  // into a reader: no autosave, no local draft, no editing chrome. The server
  // would reject the writes anyway — this stops us from offering them.
  canEdit: boolean
}) {
  const loadBoard = useWhiteboard((s) => s.loadBoard)
  const setReadOnly = useWhiteboard((s) => s.setReadOnly)
  const libraryOpen = useWhiteboard((s) => s.libraryOpen)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const revisionRef = useRef(0)
  const pendingRef = useRef<PendingSave | null>(null)
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => void>(() => undefined)

  const flushAutosave = useCallback(() => {
    if (savingRef.current || !pendingRef.current) return

    const pending = pendingRef.current
    pendingRef.current = null
    savingRef.current = true

    void saveBoard(boardId, {
      name: pending.project.name,
      data: {
        elements: pending.project.elements,
        camera: pending.project.camera,
        backgroundStyle: pending.project.backgroundStyle,
      },
    })
      .then(() => {
        if (revisionRef.current === pending.revision && !pendingRef.current) {
          clearBoardDraft(boardId)
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
  }, [boardId])
  flushRef.current = flushAutosave

  const queueAutosave = useCallback(
    (project: Project, immediate = false) => {
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
    [],
  )

  useEffect(() => {
    let cancelled = false

    // Set before loading so the store is already locked by the time the first
    // element renders — never a frame in which someone else's board looks
    // editable.
    setReadOnly(!canEdit)

    void (async () => {
      const cloud: Project | null = board
        ? {
            id: board.id,
            name: board.name,
            elements: board.data.elements ?? [],
            camera: board.data.camera ?? { x: 0, y: 0, zoom: 1 },
            backgroundStyle: board.data.backgroundStyle ?? "plain",
            createdAt: new Date(board.updatedAt).getTime(),
            updatedAt: new Date(board.updatedAt).getTime(),
          }
        : null

      // A reader can't have produced local edits, and wiring up the draft would
      // only risk showing them a stale copy of a board they don't control.
      if (!canEdit) {
        if (cancelled) return
        if (!cloud) {
          setLoadError(true)
        } else {
          loadBoard(cloud)
        }
        setReady(true)
        return
      }

      const draft = await readBoardDraft(boardId)
      if (cancelled) return

      // Postgres is the source of truth. A local draft only wins if it's
      // genuinely ahead of the last confirmed save (recovering an edit that
      // never made it out) or the cloud fetch failed outright.
      const draftIsNewer = draft && (!cloud || draft.updatedAt > cloud.updatedAt)
      const initial = draftIsNewer ? draft : cloud

      if (!initial) {
        setLoadError(true)
        setReady(true)
        return
      }

      loadBoard(initial)
      enableCloudDraft(boardId, queueAutosave)
      if (draftIsNewer) queueAutosave(draft as Project)
      setReady(true)
    })()

    return () => {
      cancelled = true
      disableCloudDraft()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [board, boardId, canEdit, loadBoard, queueAutosave, setReadOnly])

  // The debounce above optimizes for the common case, but an edit sitting in
  // that window shouldn't vanish if the tab is hidden or closed before it
  // fires — so both events force an immediate, synchronous-as-possible flush.
  // visibilitychange is the reliable one (fires on mobile backgrounding too);
  // beforeunload is a best-effort second chance on top of it.
  useEffect(() => {
    if (!canEdit) return

    const flushNow = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      beaconFlush(boardId, pending.project)
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("beforeunload", flushNow)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("beforeunload", flushNow)
    }
  }, [boardId, canEdit])

  // Cmd/Ctrl+S remains an invisible shortcut that flushes the same autosave queue.
  useEffect(() => {
    if (!canEdit) return

    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        const current = useWhiteboard.getState().current()
        queueAutosave(current, true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canEdit, queueAutosave])

  if (loadError) {
    return (
      <SiteThemeProvider>
        <main className="flex h-dvh w-dvw items-center justify-center bg-background text-foreground">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load this board.</p>
        </main>
      </SiteThemeProvider>
    )
  }

  if (!ready) {
    return (
      <SiteThemeProvider>
        <main className="flex h-dvh w-dvw items-center justify-center bg-background text-foreground">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
            Loading board…
          </div>
        </main>
      </SiteThemeProvider>
    )
  }

  return (
    <SiteThemeProvider>
      <main className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground">
        <CanvasSurface />

        {/* Top-left: back / board name */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <BoardTopBar
              canEdit={canEdit}
              authorName={board?.authorName ?? null}
              initialStarCount={board?.starCount ?? 0}
              initiallyStarred={board?.isStarred ?? false}
            />
          </div>

          {/* Top-right: board settings. Theme is a viewer preference so it's
              always available; background style is a board-editing decision,
              so BoardBackgroundMenu hides that section for a read-only
              viewer but keeps the menu itself (and Theme) around. */}
          <div className="pointer-events-auto">
            <BoardBackgroundMenu canEdit={canEdit} />
          </div>
        </div>

        {/* Top-center: toolbar. Drawing tools and the properties panel are the
            whole editing surface, so a reader simply doesn't get them. */}
        {canEdit && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-3">
              <div className="pointer-events-auto">
                <Toolbar />
              </div>
            </div>

            {/* Right: properties */}
            <div className="pointer-events-none absolute right-3 top-20 bottom-3 z-30 flex flex-col items-end">
              <PropertiesPanel />
            </div>
          </>
        )}

        {/* Bottom-left: zoom controls. The component library modal is rendered
            inside the toolbar's z-30 stacking context (fixed z-50 only wins
            within that context). This bar used to share z-30 and sit later in
            the DOM, so it painted ABOVE the modal's backdrop and stayed
            sharp while the earlier top-left chrome correctly went soft. Drop
            under the toolbar while the library is open so the backdrop covers
            and blurs us the same way; `inert` still keeps Tab focus out. */}
        <div
          className={`pointer-events-none absolute bottom-3 left-3 ${libraryOpen ? "z-20" : "z-30"}`}
          inert={libraryOpen}
        >
          <div className="pointer-events-auto flex items-center gap-2">
            <ZoomControls />
          </div>
        </div>
      </main>
    </SiteThemeProvider>
  )
}
