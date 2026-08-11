import type { CanvasElement } from "@/lib/whiteboard/types"
import type { BoardPlan } from "./plan"
import type { StylePack } from "./tokens"
import { getBounds } from "@/lib/whiteboard/geometry"

// Two gates the engine will not ship a board past.
//
// PLAN GUARDS run before layout, on the semantic plan. They are the density
// rules — the ones that stop a board being forty identical cards — expressed as
// code with numbers in it, rather than as an instruction in a prompt that the
// model may or may not weigh. A plan that trips one is rejected with a message
// telling the model precisely what to change, and it gets to try again.
//
// THE OVERLAP CHECK runs after layout, on the elements themselves. It is a
// sweep over the real rects, and it is the thing that makes "elements never
// overlap" a checked property of the output rather than a hoped-for consequence
// of the layout code being correct.

export class PlanRejectedError extends Error {}
export class LayoutError extends Error {}

// ── plan guards ────────────────────────────────────────────────────────────

/** Board-wide ceiling on items. Past this a board stops being readable. */
const MAX_BOARD_ITEMS = 48

/** Below this many items a ratio guard is noise, not signal. */
const RATIO_FLOOR = 6

export interface GuardResult {
  /** Fatal — the plan must be rewritten. */
  errors: string[]
  /** Non-fatal adjustments the engine made on the model's behalf. */
  warnings: string[]
}

export function checkPlan(plan: BoardPlan, pack: StylePack): GuardResult {
  const errors: string[] = []
  const warnings: string[] = []
  const items = plan.sections.flatMap((s) => s.items)

  if (items.length > MAX_BOARD_ITEMS) {
    errors.push(
      `This board has ${items.length} items, which is past the ${MAX_BOARD_ITEMS}-item ceiling. Consolidate related points into fewer, denser items rather than splitting them across more.`,
    )
  }

  for (const section of plan.sections) {
    const name = section.heading ? `"${section.heading}"` : "an untitled section"
    if (section.items.length > pack.guards.maxItemsPerSection) {
      errors.push(
        `Section ${name} has ${section.items.length} items; the ${pack.id} style holds at most ${pack.guards.maxItemsPerSection} in one section. Split it into two sections with their own headings.`,
      )
    }

    if (section.layout === "columns" && section.columnLabels) {
      if (section.items.length < section.columnLabels.length) {
        errors.push(
          `Section ${name} declares ${section.columnLabels.length} columns but only has ${section.items.length} items, so a column would come out empty.`,
        )
      }
    }

    if (section.edges?.length) {
      if (section.layout !== "hub") {
        warnings.push(
          `Dropped the edges on section ${name}: connectors only come from a \`sequence\` or a \`hub\`.`,
        )
      } else {
        const keys = new Set(section.items.map((i) => i.key).filter(Boolean) as string[])
        for (const edge of section.edges) {
          if (!keys.has(edge.from) || !keys.has(edge.to)) {
            errors.push(
              `Section ${name} has an edge ${edge.from} → ${edge.to} but no item in that section carries both keys. Give every item an edge refers to a \`key\`.`,
            )
            break
          }
        }
      }
    }

    if (section.emphasis === "panel" && section.items.length < pack.guards.minItemsForPanel) {
      warnings.push(
        `Dropped the background panel on section ${name}: it needs at least ${pack.guards.minItemsForPanel} items to be worth grouping.`,
      )
    }

    if (!pack.layouts.includes(section.layout)) {
      const mapped = pack.remap[section.layout]
      warnings.push(
        `The ${pack.id} style has no \`${section.layout}\` layout; section ${name} was laid out as \`${mapped ?? "stack"}\` instead.`,
      )
    }
  }

  // The card-wall guard. A board where most items are titled paragraphs is the
  // failure mode this whole engine exists to prevent, so it is a hard error with
  // a list of what to reach for instead.
  if (items.length >= RATIO_FLOOR) {
    const details = items.filter((i) => i.kind === "detail").length
    const ratio = details / items.length
    if (ratio > pack.guards.maxDetailRatio) {
      const cap = Math.floor(items.length * pack.guards.maxDetailRatio)
      errors.push(
        `${details} of ${items.length} items are \`detail\` cards — the ${pack.id} style allows at most ${cap}. Convert the rest: a step or a labeled box is \`node\`, a figure is \`stat\`, a list is \`bullets\`, code is \`code\`, a shell session is \`terminal\`, an endpoint is \`api\`, a data store is \`db\`.`,
      )
    }
  }

  return { errors, warnings }
}

// ── overlap check ──────────────────────────────────────────────────────────

export interface Tracked {
  element: CanvasElement
  /**
   * Elements sharing a group are allowed to overlap — the parts of one item, a
   * label centered in its own frame, a connector label sitting in the gap it
   * belongs to.
   */
  group: string
  /** Which section this came from, so a colliding band can be pushed down. */
  section: number
  /** Background panels and connectors are expected to sit under/between things. */
  exempt: boolean
}

export interface Collision {
  a: CanvasElement
  b: CanvasElement
  sectionA: number
  sectionB: number
  /** How far `b` would have to move down to clear `a`. */
  overlapY: number
}

/**
 * Every pair of overlapping elements, by a sweep along x.
 *
 * Sorting by left edge and retiring rects once they end means only genuinely
 * x-overlapping candidates are ever compared, so this stays linear-ish in the
 * number of real near-misses instead of quadratic in the board size.
 */
export function findCollisions(tracked: Tracked[]): Collision[] {
  const boxes = tracked
    .filter((t) => !t.exempt)
    .map((t) => ({ ...t, bounds: getBounds(t.element) }))
    .sort((p, q) => p.bounds.x - q.bounds.x)

  const collisions: Collision[] = []
  const active: typeof boxes = []

  for (const box of boxes) {
    // Retire anything that ends before this one starts.
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].bounds.x + active[i].bounds.width <= box.bounds.x) active.splice(i, 1)
    }

    for (const other of active) {
      if (other.group === box.group) continue
      const a = other.bounds
      const b = box.bounds
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      // A shared edge is not an overlap; require real area.
      if (overlapX > 1 && overlapY > 1) {
        const first = a.y <= b.y ? other : box
        const second = first === other ? box : other
        collisions.push({
          a: first.element,
          b: second.element,
          sectionA: first.section,
          sectionB: second.section,
          overlapY,
        })
      }
    }

    active.push(box)
  }

  return collisions
}

/** A short, readable account of a collision, for a LayoutError message. */
export function describeCollision(c: Collision): string {
  const name = (el: CanvasElement) =>
    `${el.type}${el.title ? ` "${el.title}"` : el.text ? ` "${el.text.slice(0, 24)}"` : ""}`
  return `${name(c.a)} (section ${c.sectionA}) overlaps ${name(c.b)} (section ${c.sectionB}) by ${Math.round(
    c.overlapY,
  )}px`
}
