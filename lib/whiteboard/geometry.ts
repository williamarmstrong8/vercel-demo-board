import type { CanvasElement, Camera } from "./types"

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export function getBounds(el: CanvasElement): Bounds {
  // normalize negative width/height (arrows/lines can have them)
  const x = el.width < 0 ? el.x + el.width : el.x
  const y = el.height < 0 ? el.y + el.height : el.y
  return {
    x,
    y,
    width: Math.abs(el.width),
    height: Math.abs(el.height),
  }
}

export function getSelectionBounds(elements: CanvasElement[]): Bounds | null {
  if (elements.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const el of elements) {
    const b = getBounds(el)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function screenToWorld(sx: number, sy: number, camera: Camera) {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  }
}

export function worldToScreen(wx: number, wy: number, camera: Camera) {
  return {
    x: wx * camera.zoom + camera.x,
    y: wy * camera.zoom + camera.y,
  }
}

export function rectsIntersect(a: Bounds, b: Bounds) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function pointInBounds(px: number, py: number, b: Bounds, pad = 0) {
  return (
    px >= b.x - pad &&
    px <= b.x + b.width + pad &&
    py >= b.y - pad &&
    py <= b.y + b.height + pad
  )
}

export interface SnapGuide {
  // vertical guide at world x, or horizontal guide at world y
  axis: "x" | "y"
  position: number
  start: number
  end: number
}

// Given a moving bounds and a list of static elements, returns the adjusted
// delta plus the alignment guides to render.
export function computeSnap(
  moving: Bounds,
  targets: CanvasElement[],
  threshold: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = []

  const movingEdgesX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const movingEdgesY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]

  let bestX: { delta: number; dist: number; guide: SnapGuide } | null = null
  let bestY: { delta: number; dist: number; guide: SnapGuide } | null = null

  for (const t of targets) {
    const b = getBounds(t)
    const tx = [b.x, b.x + b.width / 2, b.x + b.width]
    const ty = [b.y, b.y + b.height / 2, b.y + b.height]

    for (const me of movingEdgesX) {
      for (const te of tx) {
        const dist = Math.abs(me - te)
        if (dist <= threshold && (!bestX || dist < bestX.dist)) {
          bestX = {
            delta: te - me,
            dist,
            guide: {
              axis: "x",
              position: te,
              start: Math.min(b.y, moving.y),
              end: Math.max(b.y + b.height, moving.y + moving.height),
            },
          }
        }
      }
    }

    for (const me of movingEdgesY) {
      for (const te of ty) {
        const dist = Math.abs(me - te)
        if (dist <= threshold && (!bestY || dist < bestY.dist)) {
          bestY = {
            delta: te - me,
            dist,
            guide: {
              axis: "y",
              position: te,
              start: Math.min(b.x, moving.x),
              end: Math.max(b.x + b.width, moving.x + moving.width),
            },
          }
        }
      }
    }
  }

  if (bestX) guides.push(bestX.guide)
  if (bestY) guides.push(bestY.guide)

  return {
    dx: bestX ? bestX.delta : 0,
    dy: bestY ? bestY.delta : 0,
    guides,
  }
}

// Snap a single edge coordinate (the one being dragged during a resize) to the
// nearest matching edge/center of other elements on the same axis. Returns the
// adjusted value plus an alignment guide to render, or null when nothing is in
// range. `perpStart`/`perpEnd` describe the moving element's span on the other
// axis so the guide can be drawn to cover both elements.
export function snapEdgeToTargets(
  value: number,
  axis: "x" | "y",
  targets: CanvasElement[],
  threshold: number,
  perpStart: number,
  perpEnd: number,
): { value: number; guide: SnapGuide | null } {
  let best: { pos: number; dist: number; b: Bounds } | null = null
  for (const t of targets) {
    const b = getBounds(t)
    const candidates =
      axis === "x" ? [b.x, b.x + b.width / 2, b.x + b.width] : [b.y, b.y + b.height / 2, b.y + b.height]
    for (const c of candidates) {
      const dist = Math.abs(value - c)
      if (dist <= threshold && (!best || dist < best.dist)) {
        best = { pos: c, dist, b }
      }
    }
  }
  if (!best) return { value, guide: null }
  const b = best.b
  const guide: SnapGuide =
    axis === "x"
      ? {
          axis: "x",
          position: best.pos,
          start: Math.min(b.y, perpStart),
          end: Math.max(b.y + b.height, perpEnd),
        }
      : {
          axis: "y",
          position: best.pos,
          start: Math.min(b.x, perpStart),
          end: Math.max(b.x + b.width, perpEnd),
        }
  return { value: best.pos, guide }
}

export function snapToGrid(value: number, grid: number) {
  return Math.round(value / grid) * grid
}
