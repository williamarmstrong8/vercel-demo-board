"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getSelectionBounds } from "@/lib/whiteboard/geometry"
import { CanvasElementView } from "@/components/whiteboard/canvas-element"
import { useSiteTheme } from "@/components/site-theme"
import type { BoardSummary } from "@/app/actions/boards"
import type { Project } from "@/lib/whiteboard/types"
import { GRID_SIZE } from "@/lib/whiteboard/types"

// Mirrors canvas-surface.tsx's own light/dark paper colors exactly, so the
// thumbnail is a true preview rather than an approximation.
const CANVAS_BG = { light: "#ffffff", dark: "#171717" }

const PADDING = 40 // world-space breathing room around the content when fitting
const MAX_ZOOM = 1 // never zoom past 1:1 — tiny boards shouldn't look blown up

/**
 * A pixel-perfect, read-only render of a board. It reuses the EXACT same
 * element renderer as the live canvas (CanvasElementView) rather than
 * re-implementing it, so the preview can never drift from the real thing.
 * Rendered inside its own iframe on the boards grid, so each instance gets an
 * isolated whiteboard store.
 */
export function BoardPreviewCanvas({ board }: { board: BoardSummary }) {
  const loadBoard = useWhiteboard((s) => s.loadBoard)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const { theme } = useSiteTheme()
  const canvasBg = CANVAS_BG[theme]
  const backgroundStyle = board.data.backgroundStyle ?? "plain"
  const lineColor = theme === "dark" ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)"
  const dotColor = theme === "dark" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)"
  const backgroundPatternStyle =
    backgroundStyle === "dots"
      ? {
          backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        }
      : backgroundStyle === "grid"
        ? {
            backgroundImage: `linear-gradient(${lineColor} 1px, transparent 1px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`,
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          }
        : undefined

  // Elements come straight from the board prop so the render never races the
  // store subscription. We still push them into this iframe's isolated store
  // (below) so the shared renderer's internal store lookups resolve correctly.
  const elements = useMemo(() => board.data.elements ?? [], [board])

  // Load the board into this iframe's isolated store exactly once, so child
  // renderers that read from the store see the same data we render from props.
  useEffect(() => {
    const now = Date.now()
    const project: Project = {
      id: board.id,
      name: board.name,
      elements,
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
      <div
        className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
        style={{ background: canvasBg, ...backgroundPatternStyle }}
      >
        Empty board
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      // Fully non-interactive: this is a static snapshot of the live canvas.
      className="relative h-full w-full overflow-hidden"
      style={{ pointerEvents: "none", background: canvasBg, ...backgroundPatternStyle }}
    >
      <div style={worldStyle}>
        {elements.map((el) => (
          <CanvasElementView key={el.id} el={el} />
        ))}
      </div>
    </div>
  )
}
