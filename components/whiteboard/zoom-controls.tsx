"use client"

import { Minus, Plus, Maximize } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"

function clampZoom(z: number) {
  return Math.min(4, Math.max(0.1, z))
}

export function ZoomControls() {
  const camera = useWhiteboard((s) => s.current().camera)
  const setCamera = useWhiteboard((s) => s.setCamera)

  function zoomBy(factor: number) {
    // zoom toward viewport center
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    const next = clampZoom(camera.zoom * factor)
    const worldX = (cx - camera.x) / camera.zoom
    const worldY = (cy - camera.y) / camera.zoom
    setCamera({
      zoom: next,
      x: cx - worldX * next,
      y: cy - worldY * next,
    })
  }

  function reset() {
    setCamera({ x: 0, y: 0, zoom: 1 })
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card/90 p-1 shadow-sm backdrop-blur-md">
      <button
        type="button"
        onClick={() => zoomBy(1 / 1.2)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={reset}
        className="min-w-14 rounded-lg px-2 py-1 text-center font-mono text-xs text-foreground transition-colors hover:bg-muted"
        aria-label="Reset zoom to 100%"
      >
        {Math.round(camera.zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => zoomBy(1.2)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        onClick={reset}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Reset view"
      >
        <Maximize className="h-4 w-4" />
      </button>
    </div>
  )
}
