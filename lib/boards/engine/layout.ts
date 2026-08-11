import type { PlanItem, PlanSection, SectionLayout } from "./plan"
import type { StylePack } from "./tokens"
import { type Measured, isRigid, measureItem, measureLabel, slotWidth } from "./measure"

// The layout primitives.
//
// Each one takes the items of a section and returns a BAND: a set of items with
// coordinates relative to the band's own top-left, plus whatever connectors the
// arrangement implies. Bands are the unit the composer stacks vertically, and
// they are why this engine can promise no overlap — see the note on that below.
//
// WHY BANDS ARE SAFE
// Every primitive lays its items out in horizontal rows, and every row has a
// height equal to its tallest item. A band's height is the sum of its row
// heights plus the gaps between them. Because the composer stacks bands top to
// bottom with a gap, and because element WIDTHS are fixed by the engine and
// never re-measured on the client (only heights are — see metrics.ts), the only
// way two elements can collide is if a height estimate ran short. Measurement is
// biased to run long precisely so that cannot happen, and verify.ts checks the
// result anyway.

export interface Placed {
  measured: Measured
  x: number
  y: number
}

/** A connector the arrangement calls for, by index into the band's `placed`. */
export interface Link {
  from: number
  to: number
  label?: string
}

export interface Band {
  placed: Placed[]
  links: Link[]
  width: number
  height: number
}

const empty = (): Band => ({ placed: [], links: [], width: 0, height: 0 })

function bandWidth(placed: Placed[]): number {
  return placed.reduce((max, p) => Math.max(max, p.x + p.measured.width), 0)
}

function bandHeight(placed: Placed[]): number {
  return placed.reduce((max, p) => Math.max(max, p.y + p.measured.height), 0)
}

/**
 * A uniform column width for a row of items, and how many fit.
 *
 * Uniform on purpose: a flow whose steps are all the same width reads as a
 * designed diagram, and it makes a serpentine's turns line up exactly. The width
 * is the widest item's natural width — never stretched to fill the measure,
 * which is what turns three cards into three billboards.
 */
function uniformColumns(
  items: PlanItem[],
  pack: StylePack,
  available: number,
  gap: number,
  maxCols: number,
): { colWidth: number; cols: number } {
  const natural = items.reduce((max, item) => Math.max(max, slotWidth(item, pack, available)), 0)
  const colWidth = Math.min(natural, available)
  const fit = Math.max(1, Math.floor((available + gap) / (colWidth + gap)))
  return { colWidth, cols: Math.max(1, Math.min(maxCols, items.length, fit)) }
}

/** Chunk a list into rows of at most `size`. */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// ── sequence ───────────────────────────────────────────────────────────────
//
// Ordered steps on a uniform column pitch, serpentining when they run past the
// measure: row 0 reads left to right, row 1 right to left, and so on. The turn
// therefore always happens at the same side, which means the connector between
// two rows is a short vertical hop between two items in the same column rather
// than a long diagonal sweeping back across the board. That is the difference
// between a flow and the "timeline trail" a naive wrap produces.
function sequence(items: PlanItem[], pack: StylePack, available: number): Band {
  const gap = pack.gap.item
  const { colWidth, cols } = uniformColumns(items, pack, available, gap, pack.guards.sequenceRowSteps)
  const measured = items.map((item) => measureItem(item, pack, colWidth))
  const rows = chunk(measured, cols)

  const placed: Placed[] = []
  const links: Link[] = []
  let y = 0

  rows.forEach((row, r) => {
    const rowHeight = Math.max(...row.map((m) => m.height))
    const reversed = r % 2 === 1
    row.forEach((m, c) => {
      // Reversed rows count columns from the right, so the last item of the
      // previous row and the first of this one share a column.
      const column = reversed ? cols - 1 - c : c
      placed.push({
        measured: m,
        x: column * (colWidth + gap) + Math.round((colWidth - m.width) / 2),
        // Center within the row so a short step lines up with a tall one.
        y: y + Math.round((rowHeight - m.height) / 2),
      })
    })
    y += rowHeight + pack.gap.row
  })

  // One connector per consecutive pair, including across a turn.
  for (let i = 0; i < placed.length - 1; i++) links.push({ from: i, to: i + 1 })

  return { placed, links, width: bandWidth(placed), height: bandHeight(placed) }
}

// ── grid ───────────────────────────────────────────────────────────────────
//
// Peer items in even rows, top-aligned, no connectors ever. This is the layout a
// model reaches for when it has a list of things, and the guard that matters
// here is that it never gets arrows: peers in a grid are not a flow.
function grid(items: PlanItem[], pack: StylePack, available: number): Band {
  const gap = pack.gap.item
  const { colWidth, cols } = uniformColumns(
    items,
    pack,
    available,
    gap,
    Math.min(pack.guards.gridColumns, pack.guards.maxRowItems),
  )
  const measured = items.map((item) => measureItem(item, pack, colWidth))
  const rows = chunk(measured, cols)

  const placed: Placed[] = []
  let y = 0
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((m) => m.height))
    row.forEach((m, c) => {
      placed.push({
        measured: m,
        // A rigid block narrower than the column centers in its cell.
        x: c * (colWidth + gap) + Math.round((colWidth - m.width) / 2),
        y,
      })
    })
    y += rowHeight + pack.gap.row
  }

  return { placed, links: [], width: bandWidth(placed), height: bandHeight(placed) }
}

// ── columns ────────────────────────────────────────────────────────────────
//
// Parallel vertical stacks for a comparison. Items deal into the columns in
// order, so the model can just list them.
function columns(
  items: PlanItem[],
  pack: StylePack,
  available: number,
  labels: string[] | undefined,
): Band {
  const gap = pack.gap.item
  const count = Math.max(
    2,
    Math.min(labels?.length ?? pack.guards.gridColumns, pack.guards.maxRowItems, items.length),
  )
  const colWidth = Math.floor((available - gap * (count - 1)) / count)

  // Deal round-robin so `columnLabels` line up with the order the items arrive.
  const buckets: PlanItem[][] = Array.from({ length: count }, () => [])
  items.forEach((item, i) => buckets[i % count].push(item))

  const placed: Placed[] = []
  let headerHeight = 0

  if (labels && labels.length > 0) {
    labels.slice(0, count).forEach((label, c) => {
      const m = measureLabel(label, pack, { fontSize: pack.type.h3, width: colWidth, bold: true })
      placed.push({ measured: m, x: c * (colWidth + gap), y: 0 })
      headerHeight = Math.max(headerHeight, m.height)
    })
    headerHeight += pack.gap.afterSubhead
  }

  buckets.forEach((bucket, c) => {
    let y = headerHeight
    for (const item of bucket) {
      const target = isRigid(item, pack) ? slotWidth(item, pack, colWidth) : colWidth
      const m = measureItem(item, pack, target)
      placed.push({
        measured: m,
        x: c * (colWidth + gap) + Math.round((colWidth - m.width) / 2),
        y,
      })
      y += m.height + pack.gap.stack
    }
  })

  return { placed, links: [], width: bandWidth(placed), height: bandHeight(placed) }
}

// ── stack ──────────────────────────────────────────────────────────────────
//
// One column in reading order. The narrative style's workhorse.
function stackLayout(items: PlanItem[], pack: StylePack, available: number): Band {
  const placed: Placed[] = []
  let y = 0
  for (const item of items) {
    const m = measureItem(item, pack, slotWidth(item, pack, available))
    placed.push({ measured: m, x: 0, y })
    y += m.height + pack.gap.stack
  }
  return { placed, links: [], width: bandWidth(placed), height: bandHeight(placed) }
}

// ── split ──────────────────────────────────────────────────────────────────
//
// A large anchor with its supporting points stacked beside it. Good for "here is
// the thing, and here is what to notice about it".
function split(items: PlanItem[], pack: StylePack, available: number): Band {
  if (items.length === 1) return stackLayout(items, pack, available)

  const gap = pack.gap.item
  const [first, ...rest] = items

  // The anchor takes the larger share, unless its renderer fixes its width.
  const anchorTarget = isRigid(first, pack)
    ? slotWidth(first, pack, available)
    : Math.round((available - gap) * 0.58)
  const anchor = measureItem(first, pack, anchorTarget)
  const sideWidth = Math.max(200, available - anchor.width - gap)

  const placed: Placed[] = [{ measured: anchor, x: 0, y: 0 }]
  let y = 0
  for (const item of rest) {
    const target = isRigid(item, pack) ? slotWidth(item, pack, sideWidth) : sideWidth
    const m = measureItem(item, pack, target)
    placed.push({ measured: m, x: anchor.width + gap, y })
    y += m.height + pack.gap.stack
  }

  return { placed, links: [], width: bandWidth(placed), height: bandHeight(placed) }
}

// ── hub ────────────────────────────────────────────────────────────────────
//
// A center with satellites around it. The radii are computed from the measured
// items rather than picked: they start large enough to clear the center, then
// grow until adjacent satellites cannot touch either. So the ring is as tight as
// it can be while still being provably collision-free, at any item count.
function hub(items: PlanItem[], pack: StylePack, available: number): Band {
  if (items.length < 3) return sequence(items, pack, available)

  const gap = pack.gap.item
  const [centerItem, ...satelliteItems] = items

  const center = measureItem(centerItem, pack, slotWidth(centerItem, pack, available))
  const satellites = satelliteItems.map((item) =>
    measureItem(item, pack, slotWidth(item, pack, Math.round(available / 3))),
  )

  const maxW = Math.max(...satellites.map((m) => m.width))
  const maxH = Math.max(...satellites.map((m) => m.height))
  const n = satellites.length

  // Clear the center block.
  let rx = center.width / 2 + maxW / 2 + gap
  let ry = center.height / 2 + maxH / 2 + gap

  // Then clear each other: the chord between adjacent satellites has to exceed
  // the diagonal of the largest one, or two of them could touch.
  const step = (2 * Math.PI) / n
  const needed = Math.hypot(maxW, maxH) + gap
  const chord = 2 * Math.sin(step / 2)
  if (chord > 0) {
    const minRadius = needed / chord
    rx = Math.max(rx, minRadius)
    ry = Math.max(ry, minRadius)
  }

  // Keep the ring inside the measure; the composer's band width comes from this.
  rx = Math.min(rx, Math.max(center.width / 2 + maxW / 2 + gap, (available - maxW) / 2))

  const cx = rx + maxW / 2
  const cy = ry + maxH / 2

  const placed: Placed[] = [
    {
      measured: center,
      x: Math.round(cx - center.width / 2),
      y: Math.round(cy - center.height / 2),
    },
  ]

  satellites.forEach((m, i) => {
    // Start at 0 radians (due east) so a two-spoke hub reads left-and-right and
    // a four-spoke one lands on the compass points.
    const angle = i * step
    placed.push({
      measured: m,
      x: Math.round(cx + Math.cos(angle) * rx - m.width / 2),
      y: Math.round(cy + Math.sin(angle) * ry - m.height / 2),
    })
  })

  // Normalize: a satellite to the west or north can land at a negative offset.
  const minX = Math.min(...placed.map((p) => p.x))
  const minY = Math.min(...placed.map((p) => p.y))
  for (const p of placed) {
    p.x -= minX
    p.y -= minY
  }

  const links: Link[] = satellites.map((_, i) => ({ from: 0, to: i + 1 }))
  return { placed, links, width: bandWidth(placed), height: bandHeight(placed) }
}

// ── feature ────────────────────────────────────────────────────────────────
//
// One item at hero size. A second item, if present, becomes its caption line;
// anything beyond that stacks underneath at the normal measure.
function feature(items: PlanItem[], pack: StylePack, available: number): Band {
  const [first, ...rest] = items
  const heroWidth = isRigid(first, pack)
    ? slotWidth(first, pack, available)
    : Math.min(available, Math.max(pack.readingWidth, Math.round(available * 0.66)))

  const hero = measureItem(first, pack, heroWidth)
  const placed: Placed[] = [{ measured: hero, x: 0, y: 0 }]
  let y = hero.height + pack.gap.part

  rest.forEach((item, i) => {
    // The first follower sits tight under the hero as its caption; later ones
    // get the normal stack rhythm.
    if (i > 0) y += pack.gap.stack - pack.gap.part
    const target = isRigid(item, pack) ? slotWidth(item, pack, heroWidth) : heroWidth
    const m = measureItem(item, pack, target)
    placed.push({ measured: m, x: 0, y })
    y += m.height + pack.gap.part
  })

  return { placed, links: [], width: bandWidth(placed), height: bandHeight(placed) }
}

/**
 * Lay out one section's items with the given primitive.
 *
 * `available` is a wrap limit, not a target: a band is only as wide as its
 * content needs, so a three-card row stays three cards wide instead of being
 * stretched across the measure.
 */
export function layoutItems(
  items: PlanItem[],
  layout: SectionLayout,
  pack: StylePack,
  available: number,
  section: Pick<PlanSection, "columnLabels">,
): Band {
  if (items.length === 0) return empty()
  switch (layout) {
    case "sequence":
      return sequence(items, pack, available)
    case "grid":
      return grid(items, pack, available)
    case "columns":
      return columns(items, pack, available, section.columnLabels)
    case "stack":
      return stackLayout(items, pack, available)
    case "split":
      return split(items, pack, available)
    case "hub":
      return hub(items, pack, available)
    case "feature":
      return feature(items, pack, available)
  }
}
