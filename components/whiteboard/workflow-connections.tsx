"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getBounds } from "@/lib/whiteboard/geometry"
import { isNodeType, type CanvasElement } from "@/lib/whiteboard/types"

const SIDES = ["top", "right", "bottom", "left"] as const
type Side = (typeof SIDES)[number]

const SIDE_DIR: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function sidePoint(el: CanvasElement, side: Side) {
  const b = getBounds(el)
  switch (side) {
    case "top":
      return { x: b.x + b.width / 2, y: b.y }
    case "bottom":
      return { x: b.x + b.width / 2, y: b.y + b.height }
    case "left":
      return { x: b.x, y: b.y + b.height / 2 }
    case "right":
      return { x: b.x + b.width, y: b.y + b.height / 2 }
  }
}

/** Picks the closest pair of sides between two nodes for a natural-looking link. */
function bestAnchors(a: CanvasElement, b: CanvasElement) {
  let best = { sa: "right" as Side, sb: "left" as Side }
  let bd = Number.POSITIVE_INFINITY
  for (const sa of SIDES) {
    for (const sb of SIDES) {
      const pa = sidePoint(a, sa)
      const pb = sidePoint(b, sb)
      const dd = Math.hypot(pb.x - pa.x, pb.y - pa.y)
      if (dd < bd) {
        bd = dd
        best = { sa, sb }
      }
    }
  }
  return best
}

/** Side of a node whose handle is closest to an arbitrary point (drag target). */
function nearestSide(el: CanvasElement, pt: { x: number; y: number }): Side {
  let best: Side = "right"
  let bd = Number.POSITIVE_INFINITY
  for (const s of SIDES) {
    const p = sidePoint(el, s)
    const dd = Math.hypot(pt.x - p.x, pt.y - p.y)
    if (dd < bd) {
      bd = dd
      best = s
    }
  }
  return best
}

/** Bezier whose control points leave/enter each endpoint perpendicular to its side. */
function curvePath(
  x1: number,
  y1: number,
  d1: { x: number; y: number },
  x2: number,
  y2: number,
  d2: { x: number; y: number },
) {
  const dist = Math.max(40, Math.hypot(x2 - x1, y2 - y1) / 2)
  const c1x = x1 + d1.x * dist
  const c1y = y1 + d1.y * dist
  const c2x = x2 + d2.x * dist
  const c2y = y2 + d2.y * dist
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
}

/**
 * SVG layer (rendered *behind* the nodes) that draws every workflow connection
 * as a bezier curve, plus the in-progress curve while dragging a new link.
 */
export function ConnectionCurves() {
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const connections = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).connections)
  const connectingFrom = useWhiteboard((s) => s.connectingFrom)
  const connectPos = useWhiteboard((s) => s.connectPos)
  const runStates = useWhiteboard((s) => s.runStates)
  const removeConnection = useWhiteboard((s) => s.removeConnection)
  const [hovered, setHovered] = useState<string | null>(null)

  const byId = new Map(elements.map((e) => [e.id, e]))

  const from = connectingFrom ? byId.get(connectingFrom) : undefined

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {connections.map((c) => {
        const a = byId.get(c.from)
        const b = byId.get(c.to)
        if (!a || !b) return null
        const { sa, sb } = bestAnchors(a, b)
        const s = sidePoint(a, sa)
        const e = sidePoint(b, sb)
        const active = runStates[c.to] === "running"
        const d = curvePath(s.x, s.y, SIDE_DIR[sa], e.x, e.y, SIDE_DIR[sb])
        const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }
        return (
          <g key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)}>
            {/* wide invisible hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "pointer" }} />
            <path
              d={d}
              fill="none"
              stroke={active ? "#0070f3" : hovered === c.id ? "#0070f3" : "#b0b0b0"}
              strokeWidth={active ? 2.5 : 2}
              markerEnd={`url(#wf-arrow-${active ? "active" : "idle"})`}
              style={{ transition: "stroke 0.15s ease" }}
            />
            {active && <circle r={4} fill="#0070f3"><animateMotion dur="0.9s" repeatCount="indefinite" path={d} /></circle>}
            {hovered === c.id && (
              <foreignObject x={mid.x - 11} y={mid.y - 11} width={22} height={22} style={{ overflow: "visible" }}>
                <button
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    removeConnection(c.id)
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 9999,
                    border: "1px solid #eaeaea",
                    background: "#fff",
                    color: "#e5484d",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    boxShadow: "none",
                  }}
                >
                  <X size={12} />
                </button>
              </foreignObject>
            )}
          </g>
        )
      })}

      {from && connectPos && (() => {
        const startSide = nearestSide(from, connectPos)
        const sp = sidePoint(from, startSide)
        return (
          <path
            d={curvePath(sp.x, sp.y, SIDE_DIR[startSide], connectPos.x, connectPos.y, { x: 0, y: 0 })}
            fill="none"
            stroke="#0070f3"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )
      })()}

      <defs>
        <marker id="wf-arrow-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b0b0b0" />
        </marker>
        <marker id="wf-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0070f3" />
        </marker>
      </defs>
    </svg>
  )
}

/**
 * HTML layer (rendered *above* the nodes) with four connection handles per node
 * (top / right / bottom / left). Dragging any handle starts a new connection.
 */
export function ConnectionHandles() {
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const connections = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).connections)
  const startConnect = useWhiteboard((s) => s.startConnect)
  const connectingFrom = useWhiteboard((s) => s.connectingFrom)
  const mode = useWhiteboard((s) => s.mode)

  // Companion code blocks (opened from a file-tree) are not part of the
  // workflow graph, so they don't get connection handles.
  const nodes = elements.filter((e) => isNodeType(e.type) && !e.companionOf)
  const build = mode === "build"

  // In prod mode only handles that are actually part of a connection remain
  // visible (as static indicators). Compute the used anchor sides per node.
  const byId = new Map(elements.map((e) => [e.id, e]))
  const usedSides = new Set<string>()
  if (!build) {
    for (const c of connections) {
      const a = byId.get(c.from)
      const b = byId.get(c.to)
      if (!a || !b) continue
      const { sa, sb } = bestAnchors(a, b)
      usedSides.add(`${a.id}:${sa}`)
      usedSides.add(`${b.id}:${sb}`)
    }
  }

  return (
    <>
      {nodes.map((el) => {
        const isSource = connectingFrom === el.id
        return (
          <div key={el.id}>
            {SIDES.map((side) => {
              // prod mode: hide unconnected handles
              if (!build && !usedSides.has(`${el.id}:${side}`)) return null
              const p = sidePoint(el, side)
              return (
                <div
                  key={side}
                  data-connect-handle={build ? el.id : undefined}
                  data-connect-side={side}
                  onPointerDown={
                    build
                      ? (e) => {
                          e.stopPropagation()
                          startConnect(el.id)
                        }
                      : undefined
                  }
                  title={build ? "Drag to connect" : undefined}
                  style={{
                    position: "absolute",
                    left: p.x - (build ? 6 : 4),
                    top: p.y - (build ? 6 : 4),
                    width: build ? 12 : 8,
                    height: build ? 12 : 8,
                    borderRadius: 9999,
                    background: isSource ? "#0070f3" : build ? "#fff" : "#0070f3",
                    border: build ? "2px solid #0070f3" : "none",
                    cursor: build ? "crosshair" : "default",
                    pointerEvents: build ? "auto" : "none",
                    boxShadow: "none",
                  }}
                />
              )
            })}
          </div>
        )
      })}
    </>
  )
}
