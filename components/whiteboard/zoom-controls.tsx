"use client"

import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getSelectionBounds } from "@/lib/whiteboard/geometry"

function clampZoom(z: number) {
  return Math.min(4, Math.max(0.1, z))
}

export function ZoomControls() {
  const camera = useWhiteboard((s) => s.current().camera)
  const elements = useWhiteboard((s) => s.current().elements)
  const setCamera = useWhiteboard((s) => s.setCamera)
  // Hides the hover label for the rest of this hover, so it doesn't sit there
  // describing an action that has already run.
  const [justReset, setJustReset] = useState(false)

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

  // Back to 1:1, framed on whatever is actually drawn. Resetting to the world
  // origin instead would be technically "reset" but useless in practice — the
  // origin is just wherever the first element happened to land, so on a board
  // built off to one side it lands on empty canvas.
  function resetZoom() {
    const bounds = getSelectionBounds(elements)
    if (!bounds) {
      setCamera({ x: 0, y: 0, zoom: 1 })
      return
    }
    // At zoom 1 screen = world + camera, so putting the content's midpoint at
    // the viewport's midpoint is a straight subtraction.
    setCamera({
      zoom: 1,
      x: window.innerWidth / 2 - (bounds.x + bounds.width / 2),
      y: window.innerHeight / 2 - (bounds.y + bounds.height / 2),
    })
  }

  return (
    // Permanently dark tool chrome, like the toolbar/top bar — pinned with its
    // own "dark" class rather than following the board's light/dark setting.
    // Deliberately an opaque background rather than a translucent one over
    // backdrop-blur: an element with its own backdrop-filter becomes its own
    // backdrop root, which excludes it from anything blurring it from above —
    // so the component library's overlay would leave this bar sharp while the
    // rest of the chrome behind it went soft.
    <div className="dark flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      <button
        type="button"
        onClick={() => zoomBy(1 / 1.2)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </button>

      {/* The percentage doubles as the reset control, so the bar doesn't need a
          separate button for it. The label on hover is what makes that
          discoverable — a bare number doesn't read as clickable. */}
      <div className="relative" onPointerLeave={() => setJustReset(false)}>
        <button
          type="button"
          onClick={() => {
            resetZoom()
            setJustReset(true)
          }}
          // `peer` so the label keys off this button's own state. Reacting to
          // the wrapper's :focus-within instead would leave the label stuck on
          // after a click, since clicking a button focuses it and the focus
          // outlives the pointer.
          className="peer min-w-14 rounded-lg px-2 py-1 text-center font-mono text-xs text-foreground transition-colors hover:bg-muted"
          aria-label="Reset zoom to 100% and center on content"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        {/* Once the reset has happened the label has nothing left to explain, so
            it goes until the pointer leaves and comes back. */}
        {!justReset && (
          <span
            role="tooltip"
            // pointer-events-none so the card can never sit between the cursor
            // and the button it describes.
            className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100"
          >
            Reset zoom
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => zoomBy(1.2)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
