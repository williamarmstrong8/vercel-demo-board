import rough from "roughjs"
import type { Options } from "roughjs/bin/core"
import type { Sloppiness } from "./types"

// How far roughjs may wander from the ideal geometry per level. Level 0 never
// reaches here: clean shapes keep rendering as plain SVG geometry.
const ROUGHNESS: Record<Sloppiness, number> = { 0: 0, 1: 1, 2: 2.4 }

const generator = rough.generator()

export interface SketchPath {
  d: string
  stroke: string
  strokeWidth: number
  fill: string
}

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
    return `M${n(w / 2)} 0 L${n(w)} ${n(h / 2)} L${n(w / 2)} ${n(h)} L0 ${n(h / 2)} Z`
  }
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  if (r === 0) return `M0 0 L${n(w)} 0 L${n(w)} ${n(h)} L0 ${n(h)} Z`
  return [
    `M${n(r)} 0`,
    `L${n(w - r)} 0`,
    `Q${n(w)} 0 ${n(w)} ${n(r)}`,
    `L${n(w)} ${n(h - r)}`,
    `Q${n(w)} ${n(h)} ${n(w - r)} ${n(h)}`,
    `L${n(r)} ${n(h)}`,
    `Q0 ${n(h)} 0 ${n(h - r)}`,
    `L0 ${n(r)}`,
    `Q0 0 ${n(r)} 0`,
    "Z",
  ].join(" ")
}

export type SketchShapeType = "rectangle" | "ellipse" | "diamond"

/**
 * Hand-drawn version of a shape, as SVG paths in the element's own coordinate
 * space. The fill and the outline are generated separately (from the same seed,
 * so they stay aligned) because roughjs skips the outline entirely when the
 * stroke is "none".
 */
export function sketchShape(params: {
  id: string
  type: SketchShapeType
  width: number
  height: number
  radius: number
  sloppiness: Sloppiness
  fill: string
  stroke: string
  strokeWidth: number
}): SketchPath[] {
  const { id, type, width, height, radius, sloppiness, fill, stroke, strokeWidth } = params
  const d = shapePath(type, Math.max(1, width), Math.max(1, height), radius)
  const base: Options = {
    seed: seedFrom(id),
    roughness: ROUGHNESS[sloppiness] ?? 1,
    // keeps the sketch anchored to the element's bounds so it can't drift away
    // from the selection box and resize handles
    preserveVertices: true,
  }
  const paths: SketchPath[] = []

  if (fill !== "transparent") {
    const drawable = generator.path(d, { ...base, fill, fillStyle: "solid", stroke: "none" })
    for (const p of generator.toPaths(drawable)) {
      paths.push({ d: p.d, stroke: "none", strokeWidth: 0, fill: p.fill || fill })
    }
  }

  if (stroke !== "transparent" && strokeWidth > 0) {
    const drawable = generator.path(d, { ...base, stroke, strokeWidth })
    for (const p of generator.toPaths(drawable)) {
      paths.push({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth, fill: "none" })
    }
  }

  return paths
}
