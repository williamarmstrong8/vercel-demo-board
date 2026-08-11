import rough from "roughjs"
import type { Options } from "roughjs/bin/core"
import type { FillStyle, Sloppiness, StrokeStyle } from "./types"

// roughjs tuning per level. Level 0 keeps the crisp geometry (see SKETCH_CLEAN)
// so a clean shape still renders as exact SVG geometry — it only comes through
// here at all to pick up a hatched fill.
//
// The hand-drawn read comes from roughjs's double stroke plus a gentle `bowing`
// — each segment bending away from the straight line between its endpoints, the
// way a pen drifts — not from large offsets. Push bowing much past this and the
// outline bends so far off the fill that the shape's colour spills past its own
// edge, which reads as broken rather than as sketched. `preserveVertices` stays
// on at every level: without it roughjs lets segment ends miss their corner and
// the outline stops looking like one continuous line drawn around the shape.
const SKETCH_CLEAN: Options = { roughness: 0, bowing: 0, preserveVertices: true }

// `maxRandomnessOffset` is the dial to reach for when the shape wants to look
// more worked-over: it widens the gap between roughjs's two passes, so the
// edges read as a line gone over twice rather than as one wobbly line. `bowing`
// is the one to hold back — it bends the whole edge in a single direction, and
// since the fill follows the ideal path rather than the sketched one, too much
// of it lifts the outline clear of the fill and the colour spills past its edge.
const SKETCH: Record<Sloppiness, Options> = {
  0: SKETCH_CLEAN,
// Note the two dials move in opposite directions between the levels: roughness
// and offset climb to deform the line further, while bowing comes *down* to pay
// for it, since roughness multiplies the bow too and the pair together is what
// lifts the outline off the fill.
  1: { roughness: 1, bowing: 1.3, maxRandomnessOffset: 2.2, preserveVertices: true },
  2: { roughness: 1.8, bowing: 0.8, maxRandomnessOffset: 3, preserveVertices: true },
}

const generator = rough.generator()

export interface SketchPath {
  d: string
  stroke: string
  strokeWidth: number
  fill: string
}

// Fill paths and outline paths are kept apart because only the outline should
// pick up the element's dash pattern — running it through a hatched fill would
// dash every hatch line too.
export interface SketchPaths {
  fill: SketchPath[]
  stroke: SketchPath[]
}

const EMPTY: SketchPaths = { fill: [], stroke: [] }

// roughjs randomises around a seed, so it has to be derived from the element id:
// a fresh seed per render would make the shape wobble on every drag frame
// instead of staying the same hand-drawn shape.
function seedFrom(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0
  return Math.abs(hash) || 1
}

// cubic-bezier approximation of a quarter ellipse
const KAPPA = 0.5522847498

const n = (v: number) => Math.round(v * 100) / 100

type Pt = [number, number]

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

// Point `d` along the way from `from` toward `to`.
function toward(from: Pt, to: Pt, d: number): Pt {
  const len = dist(from, to) || 1
  const t = d / len
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

// Closed polygon with every corner cut back by `radius` and bridged by a
// quadratic through the original vertex. One routine for rectangles and
// diamonds alike, so neither shape can end up with a corner sharp enough to
// betray that a machine drew it.
function roundedPolygon(pts: Pt[], radius: number): string {
  const parts: string[] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const cur = pts[i]
    const next = pts[(i + 1) % pts.length]
    // never eat more than half of either adjoining edge, or the corners of a
    // very flat shape would overlap and fold the outline inside out
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2)
    const enter = toward(cur, prev, r)
    const exit = toward(cur, next, r)
    parts.push(`${i === 0 ? "M" : "L"}${n(enter[0])} ${n(enter[1])}`)
    parts.push(r > 0 ? `Q${n(cur[0])} ${n(cur[1])} ${n(exit[0])} ${n(exit[1])}` : `L${n(exit[0])} ${n(exit[1])}`)
  }
  parts.push("Z")
  return parts.join(" ")
}

// How much to take off each corner before sketching. A pen can't turn a true
// right angle, so even a shape set to sharp edges keeps a trace of a radius.
// The rounded case follows Excalidraw's adaptive radius — a quarter of the
// short side, capped — which is what stops a large rectangle's corners from
// shrinking to a token bevel.
function sketchedCornerRadius(type: SketchShapeType, rounded: boolean, w: number, h: number): number {
  const short = Math.max(1, Math.min(w, h))
  if (type === "ellipse") return 0
  // A diamond's points are its silhouette: take off just enough to lose the
  // needle tip, never enough to read as a rounded shape.
  if (type === "diamond") return Math.min(10, short * 0.08)
  return rounded ? Math.min(32, short * 0.25) : Math.min(3, short * 0.06)
}

// One closed sub-path per shape. roughjs only merges a solid fill into a single
// wobbly outline when the input path has exactly one sub-path, which is what
// makes a fill-only shape (the default: filled, no stroke) still read as
// hand-drawn.
function shapePath(type: SketchShapeType, w: number, h: number, radius: number): string {
  if (type === "ellipse") {
    const rx = w / 2
    const ry = h / 2
    const ox = rx * KAPPA
    const oy = ry * KAPPA
    return [
      `M0 ${n(ry)}`,
      `C0 ${n(ry - oy)} ${n(rx - ox)} 0 ${n(rx)} 0`,
      `C${n(rx + ox)} 0 ${n(w)} ${n(ry - oy)} ${n(w)} ${n(ry)}`,
      `C${n(w)} ${n(ry + oy)} ${n(rx + ox)} ${n(h)} ${n(rx)} ${n(h)}`,
      `C${n(rx - ox)} ${n(h)} 0 ${n(ry + oy)} 0 ${n(ry)}`,
      "Z",
    ].join(" ")
  }
  if (type === "diamond") {
    return roundedPolygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], radius)
  }
  return roundedPolygon([[0, 0], [w, 0], [w, h], [0, h]], radius)
}

export type SketchShapeType = "rectangle" | "ellipse" | "diamond"

// roughjs hands back a path per drawn piece; pass its own stroke/fill through
// rather than assuming, since a solid fill arrives as a filled path while a
// hatched one arrives as stroked hatch lines.
function toPaths(drawable: ReturnType<typeof generator.path>): SketchPath[] {
  return generator.toPaths(drawable).map((p) => ({
    d: p.d,
    stroke: p.stroke || "none",
    strokeWidth: p.strokeWidth || 0,
    fill: p.fill || "none",
  }))
}

/**
 * Hand-drawn version of a shape, as SVG paths in the element's own coordinate
 * space. The fill and the outline are generated separately (from the same seed,
 * so they stay aligned) because roughjs skips the outline entirely when the
 * stroke is "none".
 *
 * A clean shape (sloppiness 0) with a solid fill returns nothing at all — the
 * caller draws exact SVG geometry for that case. It still returns hatch lines
 * for a clean shape with a hatched fill, since there's no way to draw those
 * without roughjs; at roughness 0 they come out perfectly straight.
 */
export function sketchShape(params: {
  id: string
  type: SketchShapeType
  width: number
  height: number
  rounded: boolean
  /**
   * The caller's own corner radius, used as-is when the outline stays crisp so
   * hatching reaches exactly as far as the geometry drawn over it. Ignored once
   * we're sketching, which softens the corners itself.
   */
  crispRadius: number
  sloppiness: Sloppiness
  fill: string
  fillStyle?: FillStyle
  stroke: string
  strokeWidth: number
  strokeStyle?: StrokeStyle
}): SketchPaths {
  const { id, type, width, height, rounded, crispRadius, sloppiness, fill, stroke, strokeWidth, strokeStyle } = params
  const fillStyle = params.fillStyle ?? "solid"
  const hatched = fillStyle !== "solid"
  const sketched = sloppiness !== 0
  if (!sketched && !hatched) return EMPTY

  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const radius = sketched ? sketchedCornerRadius(type, rounded, w, h) : crispRadius
  const d = shapePath(type, w, h, radius)
  const base: Options = {
    seed: seedFrom(id),
    ...(SKETCH[sloppiness] ?? SKETCH[1]),
    // roughjs draws every line twice for its sketched look, but two overlapping
    // dashed outlines read as noise rather than as one dashed line.
    disableMultiStroke: strokeStyle !== undefined && strokeStyle !== "solid",
  }
  const paths: SketchPaths = { fill: [], stroke: [] }

  if (fill !== "transparent") {
    // Hatch spacing and weight follow the stroke so the fill reads as the same
    // pen that drew the outline, rather than as a fixed screen-space texture
    // that looks coarse on a thin shape and cramped on a bold one.
    const pen = Math.max(1, strokeWidth || 2)
    paths.fill = toPaths(
      generator.path(d, {
        ...base,
        fill,
        fillStyle,
        fillWeight: pen / 2,
        hachureGap: pen * 4,
        stroke: "none",
      }),
    )
  }

  if (sketched && stroke !== "transparent" && strokeWidth > 0) {
    paths.stroke = toPaths(generator.path(d, { ...base, stroke, strokeWidth }))
  }

  return paths
}
