import type { CanvasElement } from "@/lib/whiteboard/types"
import { getBounds } from "@/lib/whiteboard/geometry"
import type { BoardPlan, PlanSection } from "./plan"
import { type StyleId, type StylePack, resolveLayout, stylePack } from "./tokens"
import { type ElementDraft, measureLabel } from "./measure"
import { layoutItems } from "./layout"
import { type Rect, routeConnector } from "./connect"
import {
  type Tracked,
  LayoutError,
  PlanRejectedError,
  checkPlan,
  describeCollision,
  findCollisions,
} from "./verify"

// The structure engine.
//
//   plan (semantic)  →  guards  →  place  →  settle  →  route  →  stack  →  elements
//
// The order of those middle stages is deliberate and is worth stating, because
// getting it wrong is how the old path ended up with dangling arrows:
//
//   PLACE   lays every item out band by band. No connectors yet.
//   SETTLE  resolves any residual overlap by moving whole sections, or failing
//           that single items, downward until the sweep comes back clean.
//   ROUTE   only now draws connectors, against final coordinates and with every
//           other block on the board as an obstacle. An arrow therefore cannot
//           be left pointing at where a card used to be, and cannot cross one.
//   STACK   assigns z last, by layer: panels beneath, connectors above them,
//           content on top.

export { PlanRejectedError, LayoutError }
export { boardPlanSchema, type BoardPlan } from "./plan"
export { STYLE_IDS, STYLE_PACKS, type StyleId, isStyleId, stylePack } from "./tokens"

export interface BuildResult {
  elements: CanvasElement[]
  /** Adjustments the engine made on the model's behalf, worth surfacing. */
  warnings: string[]
  /**
   * Which group and section each element belongs to. The overlap check needs
   * this to tell a deliberate arrangement (the parts of one item, a label inside
   * its own frame) from a real collision, so exposing it lets the invariant be
   * re-checked from outside the engine — in a test, or against a saved board.
   */
  audit: { id: string; group: string; section: number; exempt: boolean }[]
}

interface BuildOptions {
  /** Existing board elements, so a plan appends below what's already there. */
  existing?: CanvasElement[]
  /**
   * Whether to set the plan's title as the board's h1. False when appending to a
   * board that already has one.
   */
  includeTitle?: boolean
}

/** Layer order for the final z assignment. */
const LAYER = { panel: 0, connector: 1, content: 2 } as const

/**
 * Element ids. Deliberately a local copy of the generator in lib/boards/service
 * rather than an import of it: service.ts reaches for the database, and the
 * engine is pure arithmetic that should stay testable without one.
 */
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

interface Entry extends Tracked {
  layer: number
}

/** One laid-out item, kept addressable so settle can move it and route can find it. */
interface ItemBox {
  group: string
  section: number
  elements: CanvasElement[]
  anchor: CanvasElement
}

function unionRect(elements: CanvasElement[]): Rect {
  const bounds = elements.map(getBounds)
  const x = Math.min(...bounds.map((b) => b.x))
  const y = Math.min(...bounds.map((b) => b.y))
  return {
    x,
    y,
    width: Math.max(...bounds.map((b) => b.x + b.width)) - x,
    height: Math.max(...bounds.map((b) => b.y + b.height)) - y,
  }
}

export function buildBoard(
  plan: BoardPlan,
  styleId: StyleId,
  { existing = [], includeTitle = true }: BuildOptions = {},
): BuildResult {
  const pack = stylePack(styleId)

  const { errors, warnings } = checkPlan(plan, pack)
  if (errors.length > 0) throw new PlanRejectedError(errors.join(" "))

  const entries: Entry[] = []
  const items: ItemBox[] = []
  const links: { section: number; from: string; to: string; label?: string }[] = []

  const emit = (
    draft: ElementDraft,
    box: { x: number; y: number; width: number; height: number },
    meta: { group: string; section: number; layer: number; exempt?: boolean },
  ): CanvasElement => {
    const element: CanvasElement = {
      ...draft,
      id: uid(),
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      z: 0, // assigned in the stack pass
    }
    entries.push({
      element,
      group: meta.group,
      section: meta.section,
      exempt: meta.exempt ?? false,
      layer: meta.layer,
    })
    return element
  }

  const originX = pack.origin.x
  let cursorY = pack.origin.y

  // Append below whatever is already on the board rather than on top of it.
  if (existing.length > 0) {
    cursorY = Math.max(...existing.map((el) => getBounds(el).y + getBounds(el).height)) + pack.gap.section
  }

  // ── the board title ──────────────────────────────────────────────────────
  if (includeTitle && plan.title) {
    const title = measureLabel(plan.title, pack, {
      fontSize: pack.type.h1,
      width: pack.contentWidth,
      bold: true,
      fit: true,
    })
    emit(title.parts[0].draft, { x: originX, y: cursorY, width: title.width, height: title.height }, {
      group: "title",
      section: -1,
      layer: LAYER.content,
    })
    cursorY += title.height

    if (plan.subtitle) {
      cursorY += pack.gap.afterSubhead
      const sub = measureLabel(plan.subtitle, pack, {
        fontSize: pack.type.h3,
        width: Math.min(pack.contentWidth, pack.readingWidth),
        color: pack.ink.muted,
      })
      emit(sub.parts[0].draft, { x: originX, y: cursorY, width: sub.width, height: sub.height }, {
        group: "subtitle",
        section: -1,
        layer: LAYER.content,
      })
      cursorY += sub.height
    }
    cursorY += pack.gap.section
  }

  // ── sections ─────────────────────────────────────────────────────────────
  const panelSections: number[] = []

  plan.sections.forEach((section, s) => {
    const layout = resolveLayout(pack, section.layout)
    const panelled =
      section.emphasis === "panel" && section.items.length >= pack.guards.minItemsForPanel

    const inset = panelled ? pack.gap.panelPad : 0
    const contentX = originX + inset
    let y = cursorY + inset

    if (panelled) panelSections.push(s)

    if (section.heading) {
      const h = measureLabel(section.heading, pack, {
        fontSize: pack.type.h2,
        width: pack.contentWidth - inset * 2,
        bold: true,
        fit: true,
      })
      emit(h.parts[0].draft, { x: contentX, y, width: h.width, height: h.height }, {
        group: `s${s}-heading`,
        section: s,
        layer: LAYER.content,
      })
      y += h.height + (section.subhead ? pack.gap.afterSubhead : pack.gap.afterHeading)
    }

    if (section.subhead) {
      const sub = measureLabel(section.subhead, pack, {
        fontSize: pack.type.body,
        width: Math.min(pack.contentWidth - inset * 2, pack.readingWidth),
        color: pack.ink.muted,
      })
      emit(sub.parts[0].draft, { x: contentX, y, width: sub.width, height: sub.height }, {
        group: `s${s}-subhead`,
        section: s,
        layer: LAYER.content,
      })
      y += sub.height + pack.gap.afterHeading
    }

    const available = pack.contentWidth - inset * 2
    const band = layoutItems(section.items, layout, pack, available, section)

    band.placed.forEach((placed, i) => {
      const group = `s${s}-i${i}`
      const created: CanvasElement[] = []
      let anchor: CanvasElement | null = null

      placed.measured.parts.forEach((part, p) => {
        const element = emit(
          part.draft,
          {
            x: contentX + placed.x + part.dx,
            y: y + placed.y + part.dy,
            width: part.width,
            height: part.height,
          },
          { group, section: s, layer: LAYER.content },
        )
        created.push(element)
        if (p === placed.measured.anchor) anchor = element
      })

      items.push({ group, section: s, elements: created, anchor: anchor ?? created[0] })
    })

    // Record what wants connecting. Explicit edges win for a hub; otherwise the
    // primitive's own adjacency does. Either way nothing is drawn until routing.
    if (pack.connectors) {
      const groupOf = (index: number) => `s${s}-i${index}`
      if (layout === "hub" && section.edges?.length) {
        const byKey = new Map<string, number>()
        section.items.forEach((item, i) => {
          if (item.key) byKey.set(item.key, i)
        })
        for (const edge of section.edges) {
          const from = byKey.get(edge.from)
          const to = byKey.get(edge.to)
          if (from === undefined || to === undefined || from === to) continue
          links.push({ section: s, from: groupOf(from), to: groupOf(to), label: edge.label })
        }
      } else {
        for (const link of band.links) {
          links.push({
            section: s,
            from: groupOf(link.from),
            to: groupOf(link.to),
            label: link.label,
          })
        }
      }
    }

    cursorY = y + band.height + inset + pack.gap.section
  })

  // ── settle ───────────────────────────────────────────────────────────────
  settle(entries, items, pack)

  // ── route ────────────────────────────────────────────────────────────────
  const byGroup = new Map(items.map((item) => [item.group, item]))
  let dropped = 0

  for (const link of links) {
    const from = byGroup.get(link.from)
    const to = byGroup.get(link.to)
    if (!from || !to) continue

    // Everything else on the board is an obstacle — not just this section's
    // items — so a connector can never be drawn across another block.
    const obstacles = items
      .filter((item) => item !== from && item !== to)
      .map((item) => unionRect(item.elements))

    const connector = routeConnector(
      getBounds(from.anchor),
      getBounds(to.anchor),
      pack,
      obstacles,
      link.label,
    )
    if (!connector) {
      dropped += 1
      continue
    }

    emit(
      connector.draft,
      { x: connector.x, y: connector.y, width: connector.width, height: connector.height },
      { group: `link-${link.from}-${link.to}`, section: link.section, layer: LAYER.connector, exempt: true },
    )
    if (connector.label) {
      emit(
        connector.label.draft,
        connector.label,
        {
          group: `link-${link.from}-${link.to}`,
          section: link.section,
          layer: LAYER.connector,
          exempt: true,
        },
      )
    }
  }

  if (dropped > 0) {
    warnings.push(
      `Left out ${dropped} connector${dropped === 1 ? "" : "s"} that couldn't be drawn without crossing a block.`,
    )
  }

  // ── panels ───────────────────────────────────────────────────────────────
  // Built from where the content actually ended up, so a panel always contains
  // its group exactly — including after settle moved something.
  for (const index of panelSections) {
    const own = entries.filter((e) => e.section === index && e.layer === LAYER.content)
    if (own.length === 0) continue
    const rect = unionRect(own.map((e) => e.element))
    const pad = pack.gap.panelPad
    emit(
      {
        type: "rectangle",
        width: 0,
        height: 0,
        rotation: 0,
        fill: pack.panel.fill,
        stroke: pack.panel.stroke,
        strokeWidth: pack.panel.stroke === "transparent" ? 0 : 1,
        opacity: 1,
        rounded: true,
      },
      {
        x: rect.x - pad,
        y: rect.y - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      },
      { group: `s${index}-panel`, section: index, layer: LAYER.panel, exempt: true },
    )
  }

  // ── stack ────────────────────────────────────────────────────────────────
  const baseZ = existing.length > 0 ? Math.max(...existing.map((el) => el.z)) + 1 : 0
  const ordered = [...entries].sort((a, b) => a.layer - b.layer)
  ordered.forEach((entry, i) => {
    entry.element.z = baseZ + i
  })

  return {
    elements: ordered.map((e) => e.element),
    warnings,
    audit: ordered.map((e) => ({
      id: e.element.id,
      group: e.group,
      section: e.section,
      exempt: e.exempt,
    })),
  }
}

/**
 * Push things apart until the sweep comes back clean.
 *
 * Overlap should already be impossible — bands are stacked with gaps and
 * measurement runs long on purpose — so this is a backstop, not the mechanism.
 * It prefers moving a whole section, which preserves the composition, and falls
 * back to nudging a single item. If it still can't produce a clean board it
 * throws, because shipping a board with elements on top of each other is worse
 * than reporting that something went wrong.
 */
function settle(entries: Entry[], items: ItemBox[], pack: StylePack): void {
  const MAX_PASSES = 6

  const shiftSectionsFrom = (from: number, dy: number) => {
    for (const entry of entries) {
      if (entry.section >= from) entry.element.y += dy
    }
  }
  const shiftGroup = (group: string, dy: number) => {
    for (const entry of entries) {
      if (entry.group === group) entry.element.y += dy
    }
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const collisions = findCollisions(entries)
    if (collisions.length === 0) return

    const crossSection = collisions.filter((c) => c.sectionA !== c.sectionB)

    if (crossSection.length > 0) {
      // Move the later section (and everything after it) clear, once per pass so
      // the shifts don't compound past each other.
      const worst = crossSection.reduce((a, b) => (b.overlapY > a.overlapY ? b : a))
      const later = Math.max(worst.sectionA, worst.sectionB)
      shiftSectionsFrom(later, Math.ceil(worst.overlapY) + pack.gap.row)
      continue
    }

    // Same section: nudge the lower item down by the overlap. Whole groups move,
    // so a multi-part item stays assembled.
    const worst = collisions.reduce((a, b) => (b.overlapY > a.overlapY ? b : a))
    const lower = entries.find((e) => e.element === worst.b)
    if (!lower) break
    shiftGroup(lower.group, Math.ceil(worst.overlapY) + pack.gap.stack)
  }

  const remaining = findCollisions(entries)
  if (remaining.length > 0) {
    throw new LayoutError(
      `Could not lay the board out without overlap after ${MAX_PASSES} passes: ${remaining
        .slice(0, 3)
        .map(describeCollision)
        .join("; ")}`,
    )
  }
}

/** Compact, token-cheap description of a built board, for tool results. */
export function describeBoard(elements: CanvasElement[]): string {
  const counts = new Map<string, number>()
  for (const el of elements) counts.set(el.type, (counts.get(el.type) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${n} ${type}`)
    .join(", ")
}
