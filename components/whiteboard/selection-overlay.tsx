"use client"

import type { CanvasElement, Camera } from "@/lib/whiteboard/types"
import { getBounds, getSelectionBounds, worldToScreen, type SnapGuide } from "@/lib/whiteboard/geometry"

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end"

interface Props {
  camera: Camera
  selected: CanvasElement[]
  guides: SnapGuide[]
  marquee: { x: number; y: number; width: number; height: number } | null
  onHandleDown: (handle: HandleId, e: React.PointerEvent) => void
}

const ACCENT = "#0070f3"

export function SelectionOverlay({ camera, selected, guides, marquee, onHandleDown }: Props) {
  const bounds = getSelectionBounds(selected)
  const isLine = selected.length === 1 && (selected[0].type === "arrow" || selected[0].type === "line")
  // The eve agent file-tree and its pinned companion code / channel UI blocks
  // are locked & auto-sized, so they show no selection UI at all (no outline,
  // no handles).
  const hideSelection =
    selected.length === 1 &&
    (!!selected[0].companionOf || !!selected[0].channelParent || selected[0].type === "filetree")

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* alignment guides */}
      {guides.map((g, i) => {
        if (g.axis === "x") {
          const p = worldToScreen(g.position, g.start, camera)
          const end = worldToScreen(g.position, g.end, camera)
          return (
            <div
              key={`gx-${i}`}
              style={{
                position: "absolute",
                left: p.x,
                top: Math.min(p.y, end.y) - 40,
                width: 1,
                height: Math.abs(end.y - p.y) + 80,
                background: ACCENT,
              }}
            />
          )
        }
        const p = worldToScreen(g.start, g.position, camera)
        const end = worldToScreen(g.end, g.position, camera)
        return (
          <div
            key={`gy-${i}`}
            style={{
              position: "absolute",
              top: p.y,
              left: Math.min(p.x, end.x) - 40,
              height: 1,
              width: Math.abs(end.x - p.x) + 80,
              background: ACCENT,
            }}
          />
        )
      })}

      {/* marquee */}
      {marquee && (
        <div
          style={{
            position: "absolute",
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
            height: marquee.height,
            background: "rgba(0,112,243,0.08)",
            border: `1px solid ${ACCENT}`,
            borderRadius: 2,
          }}
        />
      )}

      {/* selection box + handles */}
      {bounds && selected.length > 0 && !hideSelection && (
        <SelectionBox
          camera={camera}
          bounds={bounds}
          isLine={isLine}
          lineEl={isLine ? selected[0] : null}
          onHandleDown={onHandleDown}
        />
      )}
    </div>
  )
}

function SelectionBox({
  camera,
  bounds,
  isLine,
  lineEl,
  onHandleDown,
}: {
  camera: Camera
  bounds: { x: number; y: number; width: number; height: number }
  isLine: boolean
  lineEl: CanvasElement | null
  onHandleDown: (handle: HandleId, e: React.PointerEvent) => void
}) {
  const tl = worldToScreen(bounds.x, bounds.y, camera)
  const w = bounds.width * camera.zoom
  const h = bounds.height * camera.zoom

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: "absolute",
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    background: "#fff",
    border: `1.5px solid ${ACCENT}`,
    borderRadius: 2,
    cursor,
    pointerEvents: "auto",
  })

  if (isLine && lineEl) {
    // endpoint handles
    const sx = lineEl.width < 0 ? lineEl.x + lineEl.width : lineEl.x
    const sy = lineEl.height < 0 ? lineEl.y + lineEl.height : lineEl.y
    // recompute true endpoints (not normalized)
    const startPt = worldToScreen(lineEl.x, lineEl.y, camera)
    const endPt = worldToScreen(lineEl.x + lineEl.width, lineEl.y + lineEl.height, camera)
    void sx
    void sy
    return (
      <>
        <div
          style={{ position: "absolute", left: startPt.x, top: startPt.y, ...handleStyle("move"), borderRadius: 999 }}
          onPointerDown={(e) => onHandleDown("start", e)}
        />
        <div
          style={{ position: "absolute", left: endPt.x, top: endPt.y, ...handleStyle("move"), borderRadius: 999 }}
          onPointerDown={(e) => onHandleDown("end", e)}
        />
      </>
    )
  }

  const handles: { id: HandleId; x: number; y: number; cursor: string }[] = [
    { id: "nw", x: tl.x, y: tl.y, cursor: "nwse-resize" },
    { id: "n", x: tl.x + w / 2, y: tl.y, cursor: "ns-resize" },
    { id: "ne", x: tl.x + w, y: tl.y, cursor: "nesw-resize" },
    { id: "e", x: tl.x + w, y: tl.y + h / 2, cursor: "ew-resize" },
    { id: "se", x: tl.x + w, y: tl.y + h, cursor: "nwse-resize" },
    { id: "s", x: tl.x + w / 2, y: tl.y + h, cursor: "ns-resize" },
    { id: "sw", x: tl.x, y: tl.y + h, cursor: "nesw-resize" },
    { id: "w", x: tl.x, y: tl.y + h / 2, cursor: "ew-resize" },
  ]

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: tl.x,
          top: tl.y,
          width: w,
          height: h,
          border: `1.5px solid ${ACCENT}`,
          borderRadius: 2,
          pointerEvents: "none",
        }}
      />
      {handles.map((hd) => (
        <div
          key={hd.id}
          style={{ left: hd.x, top: hd.y, ...handleStyle(hd.cursor) }}
          onPointerDown={(e) => onHandleDown(hd.id, e)}
        />
      ))}
    </>
  )
}
