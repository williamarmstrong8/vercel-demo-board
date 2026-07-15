"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getSelectionBounds } from "@/lib/whiteboard/geometry"
import { CanvasElementView } from "@/components/whiteboard/canvas-element"
import { ConnectionCurves } from "@/components/whiteboard/workflow-connections"
import type { BoardSummary } from "@/app/actions/boards"
import type { Project } from "@/lib/whiteboard/types"

const PADDING = 40 // world-space breathing room around the content when fitting
const MAX_ZOOM = 1 // never zoom past 1:1 — tiny boards shouldn't look blown up

/**
 * A pixel-perfect, read-only render of a board. It reuses the EXACT same
 * element + connection renderers as the live canvas (CanvasElementView,
 * ConnectionCurves) rather than re-implementing them, so the preview can never
 * drift from the real thing. Rendered inside its own iframe on the boards grid,
 * so each instance gets an isolated whiteboard store.
 */
export function BoardPreviewCanvas({ board }: { board: BoardSummary }) {
  const loadBoard = useWhiteboard((s) => s.loadBoard)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  // Elements/connections come straight from the board prop so the render never
  // races the store subscription. We still push them into this iframe's
  // isolated store (below) so the shared renderers' internal store lookups
  // (run state, connections, smart-connect API context) resolve correctly.
  const elements = useMemo(() => board.data.elements ?? [], [board])

  // Load the board into this iframe's isolated store exactly once, so child
  // renderers that read from the store see the same data we render from props.
  useEffect(() => {
    const now = Date.now()
    const project: Project = {
      id: board.id,
      name: board.name,
      elements,
      connections: board.data.connections ?? [],
      camera: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now,
    }
    loadBoard(project)
    setReady(true)
  }, [board, elements, loadBoard])

  const [camera, setCameraState] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 })

  const isEmpty = elements.length === 0

  // Fit all content into the viewport. Re-runs when elements change (rich blocks
  // like code/server/channel auto-size after mount) or the frame resizes, so the
  // framing converges once every block has settled its height.
  useEffect(() => {
    if (!ready || isEmpty) return
    const node = containerRef.current
    if (!node) return

    const fit = () => {
      const bounds = getSelectionBounds(elements)
      if (!bounds || bounds.width === 0 || bounds.height === 0) return
      const cw = node.clientWidth
      const ch = node.clientHeight
      if (cw === 0 || ch === 0) return
      const zoom = Math.min(
        (cw - PADDING * 2) / bounds.width,
        (ch - PADDING * 2) / bounds.height,
        MAX_ZOOM,
      )
      const x = cw / 2 - (bounds.x + bounds.width / 2) * zoom
      const y = ch / 2 - (bounds.y + bounds.height / 2) * zoom
      setCameraState({ x, y, zoom })
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(node)
    return () => ro.disconnect()
  }, [ready, isEmpty, elements])

  const worldStyle = useMemo(
    () => ({
      position: "absolute" as const,
      left: 0,
      top: 0,
      transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
      transformOrigin: "0 0" as const,
    }),
    [camera.x, camera.y, camera.zoom],
  )

  if (isEmpty) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white text-sm text-muted-foreground">
        Empty board
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      // Fully non-interactive: this is a static snapshot of the live canvas.
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ pointerEvents: "none" }}
    >
      <div style={worldStyle}>
        <ConnectionCurves />
        {elements.map((el) => (
          <CanvasElementView key={el.id} el={el} />
        ))}
      </div>
    </div>
  )
}
