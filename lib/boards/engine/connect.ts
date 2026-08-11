import type { StylePack } from "./tokens"
import type { ElementDraft } from "./measure"
import { TEXT_BOX, measureRun, textFace } from "./metrics"

// Connector routing.
//
// The old authoring path made an arrow a positional accident: the model emitted
// a flat list, and an arrow snapped to whichever blocks happened to sit either
// side of it in that array and on the same row — or was silently deleted if the
// row had wrapped. So arrows landed on the wrong pair, pointed into the middle
// of a card, or vanished, and there was no way to say "connect A to B".
//
// Here a connector is derived from geometry that already exists. Given the two
// rects it has to join, it picks the closest facing edges, stops short of both,
// and — critically — REFUSES to exist if the straight run between them would
// cross any other block. An arrow drawn through a card is worse than no arrow, so
// an unroutable connector is dropped rather than drawn.
//
// Only three things produce connectors: a `sequence`'s consecutive steps, a
// `hub`'s spokes, and explicit `edges`. A grid or a stack cannot get one, which
// is what stops peers in a list from being wired together as though they were a
// flow.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

export interface Connector {
  /** The arrow itself. `x`/`y` is the start; width/height are signed deltas. */
  draft: ElementDraft
  x: number
  y: number
  width: number
  height: number
  /** An optional label, already positioned clear of the line. */
  label?: { draft: ElementDraft; x: number; y: number; width: number; height: number }
}

const MIN_LENGTH = 14

function centerOf(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** Where two ranges overlap, or null. */
function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(a0, b0)
  const hi = Math.min(a1, b1)
  return hi > lo ? [lo, hi] : null
}

function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  // Cheap reject on bounding boxes first.
  if (maxX < r.x || minX > r.x + r.width || maxY < r.y || minY > r.y + r.height) return false

  // An axis-aligned segment (which is all this engine produces) is fully decided
  // by the bounding-box test above.
  if (a.x === b.x || a.y === b.y) return true

  // General case: does the segment straddle the rect on both axes?
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ]
  const side = (p: Point) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
  const first = side(corners[0])
  return corners.some((c) => side(c) !== first)
}

/**
 * Route a connector between two rects.
 *
 * Returns null when there is no honest way to draw it: the blocks are too close
 * together to fit an arrow between them, or something else is in the way.
 */
export function routeConnector(
  from: Rect,
  to: Rect,
  pack: StylePack,
  obstacles: Rect[],
  label?: string,
): Connector | null {
  if (!pack.connectors) return null

  const pad = pack.gap.connector
  const fc = centerOf(from)
  const tc = centerOf(to)

  let a: Point
  let b: Point

  const vertical = overlap(from.x, from.x + from.width, to.x, to.x + to.width)
  const horizontal = overlap(from.y, from.y + from.height, to.y, to.y + to.height)

  // Prefer the axis on which the two blocks actually face each other. When they
  // share a column, run the arrow vertically down the shared span; when they
  // share a row, run it horizontally. That is what keeps a serpentine's turn a
  // short vertical hop instead of a diagonal across the board.
  if (vertical && (!horizontal || Math.abs(tc.y - fc.y) > Math.abs(tc.x - fc.x))) {
    const x = Math.round((vertical[0] + vertical[1]) / 2)
    const down = tc.y > fc.y
    a = { x, y: down ? from.y + from.height + pad : from.y - pad }
    b = { x, y: down ? to.y - pad : to.y + to.height + pad }
  } else if (horizontal) {
    const y = Math.round((horizontal[0] + horizontal[1]) / 2)
    const right = tc.x > fc.x
    a = { x: right ? from.x + from.width + pad : from.x - pad, y }
    b = { x: right ? to.x - pad : to.x + to.width + pad, y }
  } else {
    // Diagonal: leave from the side that faces the target and arrive likewise.
    const right = tc.x > fc.x
    const down = tc.y > fc.y
    a = {
      x: right ? from.x + from.width + pad : from.x - pad,
      y: fc.y,
    }
    b = {
      x: right ? to.x - pad : to.x + to.width + pad,
      y: down ? to.y - pad / 2 : to.y + to.height + pad / 2,
    }
  }

  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.hypot(dx, dy) < MIN_LENGTH) return null

  for (const obstacle of obstacles) {
    if (segmentIntersectsRect(a, b, obstacle)) return null
  }

  const connector: Connector = {
    draft: {
      type: "arrow",
      width: 0,
      height: 0,
      rotation: 0,
      stroke: pack.ink.body,
      fill: "transparent",
      strokeWidth: 2,
      opacity: 1,
      rounded: true,
    },
    x: Math.round(a.x),
    y: Math.round(a.y),
    width: Math.round(dx),
    height: Math.round(dy),
  }

  if (label) {
    const size = pack.type.caption
    // Measure the label for real rather than estimating from its character count
    // — an estimate is how a label ends up wider than the gap it has to live in.
    const width = Math.ceil(measureRun(label, textFace(false), size))
    const height = Math.round(size * TEXT_BOX.lineHeight)
    const mid = { x: a.x + dx / 2, y: a.y + dy / 2 }
    const horizontalRun = Math.abs(dx) >= Math.abs(dy)

    // A connector's run is often shorter than the words describing it — a hub's
    // spokes especially. Try the sensible placements in order and take the first
    // that touches nothing; if none is clear, keep the arrow and drop the label.
    // A label lying across a card is worse than an unlabelled arrow.
    const candidates = horizontalRun
      ? [
          { x: mid.x - width / 2, y: mid.y - height - 6 },
          { x: mid.x - width / 2, y: mid.y + 6 },
        ]
      : [
          { x: mid.x + 8, y: mid.y - height / 2 },
          { x: mid.x - width - 8, y: mid.y - height / 2 },
        ]

    // The blocks this connector JOINS count as obstacles for its label, even
    // though they can't obstruct the line itself. A short run puts the midpoint
    // close to both ends, and a label centered there is exactly what lands on
    // top of the card the arrow points at.
    const labelObstacles = [...obstacles, from, to]

    for (const at of candidates) {
      const box: Rect = { x: at.x, y: at.y, width, height }
      if (labelObstacles.some((obstacle) => rectsOverlap(box, obstacle))) continue
      connector.label = {
        draft: {
          type: "text",
          width,
          height,
          rotation: 0,
          stroke: pack.ink.muted,
          fill: "transparent",
          strokeWidth: 2,
          opacity: 1,
          rounded: true,
          text: label,
          fontSize: size,
          textAlign: horizontalRun ? "center" : "left",
        },
        x: Math.round(at.x),
        y: Math.round(at.y),
        width,
        height,
      }
      break
    }
  }

  return connector
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
  )
}
