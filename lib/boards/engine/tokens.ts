import type { ItemKind, SectionLayout } from "./plan"
import { STYLE_IDS, STYLE_META, type StyleId, isStyleId } from "@/lib/boards/styles"

// Style packs — the design system, as data.
//
// Everything the engine needs to turn a semantic plan into a laid-out board
// lives in one of these three objects: the type scale, the spacing rhythm, the
// card sizing, the ink colors, which layout primitives are permitted, whether
// connectors exist at all, and the density thresholds that stop a board
// degenerating into a wall of identical cards.
//
// The user picks a pack in the builder UI; the model authors a plan for it
// (guided by the matching skill in agent/skills/board-*). Because the pack is
// data rather than prose in a prompt, two boards built in the same style are
// laid out by identical arithmetic — which is the whole reason this exists.
//
// COLOR: every value here is a LIGHT-MODE color, deliberately. The dark canvas
// applies `invert(93%) hue-rotate(180deg)` as a presentational CSS filter to
// exactly the element types the engine styles — text, card, shapes, arrows (see
// lib/whiteboard/theme-filter.ts) — so authoring light and letting the filter
// handle dark is both correct and lossless. Never author a dark color here.

// Ids and display metadata live in lib/boards/styles.ts so the builder UI can
// read them without pulling the packs (and the plan schema) into the browser.
export { STYLE_IDS, STYLE_META, isStyleId, type StyleId }

export interface StylePack {
  id: StyleId
  /** Shown in the builder UI's style picker. */
  label: string
  blurb: string

  /** Top-left of the first section, in world units. */
  origin: { x: number; y: number }
  /**
   * The measure a section is laid out within. Items wrap to a new row rather
   * than exceed it, so this — not the model — decides how wide a board gets.
   */
  contentWidth: number
  /**
   * Widest a run of body copy is allowed to get. `contentWidth` is a wrap limit
   * for the board as a whole; this is the measure prose is actually readable at,
   * and it is what a `full`-sized text item is sized to. A layout primitive may
   * override it for a deliberate hero (see `feature`).
   */
  readingWidth: number

  gap: {
    /** Between items sitting side by side in a row. */
    item: number
    /** Between items stacked vertically inside one column. */
    stack: number
    /** Between wrapped rows inside one section. */
    row: number
    /** Between one section band and the next. */
    section: number
    /** Below a section heading, before its content. */
    afterHeading: number
    /** Below a subhead. */
    afterSubhead: number
    /** Between a part and the next part of the same item (caption, attribution). */
    part: number
    /** How far a background panel is inset outside the group it holds. */
    panelPad: number
    /** How far a connector stops short of each block it joins. */
    connector: number
  }

  type: {
    h1: number
    h2: number
    h3: number
    body: number
    caption: number
    quote: number
    /** The figure in a `stat` item. */
    stat: number
  }

  card: {
    /** Standard card width. */
    width: number
    /** Width for a detail-heavy card. */
    wideWidth: number
    titleSize: number
    bodySize: number
    fill: string
    stroke: string
    strokeWidth: number
  }

  /** Text colors. Authored light; see the COLOR note above. */
  ink: { heading: string; body: string; muted: string }

  /** `emphasis: "panel"` background. */
  panel: { fill: string; stroke: string }

  /** Fill for an emphasized card (a hero, or a `split` anchor). */
  accentFill: string

  /** Frame around an image, and the box drawn when an image has no src. */
  frame: { fill: string; stroke: string; strokeWidth: number; aspect: number }

  /**
   * Layout primitives this pack renders directly. Anything else is remapped
   * through `remap` — so a style that has no notion of a flow (narrative) can
   * never be talked into drawing one, whatever the plan says.
   */
  layouts: readonly SectionLayout[]
  remap: Partial<Record<SectionLayout, SectionLayout>>

  /**
   * Whether connectors are drawn at all. When false, `sequence`/`hub` edges are
   * discarded rather than routed — a hard off switch, not a preference.
   */
  connectors: boolean

  /** How each item kind is rendered in this style. See measure.ts. */
  render: Record<ItemKind, ItemRender>

  guards: {
    /** Hard cap on items in one section. Over this, the plan is rejected. */
    maxItemsPerSection: number
    /** Cap on how many items in a row before it wraps. */
    maxRowItems: number
    /** Preferred column count for `grid`. */
    gridColumns: number
    /** Steps in a `sequence` row before it turns and serpentines back. */
    sequenceRowSteps: number
    /**
     * Ceiling on the share of board items that may be `detail` cards. Above it
     * the board is a card wall, and the plan is rejected with a note telling
     * the model which kinds to reach for instead.
     */
    maxDetailRatio: number
    /** Minimum items a section needs before `emphasis: "panel"` is honored. */
    minItemsForPanel: number
  }
}

/**
 * How one item kind is realised: which canvas element carries its main content,
 * and whether its label/caption is a separate stacked text part.
 *
 * `boxed` renders the main content inside a card; `plain` renders it as bare
 * text on the canvas. That single switch is most of the difference between the
 * visual and narrative styles.
 */
export interface ItemRender {
  mode: "boxed" | "plain" | "block" | "frame"
  /** Width for this kind. `card` uses the pack's card width, `wide` the wide one, `full` the whole measure. */
  size: "card" | "wide" | "full" | "intrinsic"
  /** Emphasize with the accent fill (boxed only). */
  accent?: boolean
}

const NEUTRAL_INK = { heading: "#171717", body: "#404040", muted: "#737373" }

// ── visual ─────────────────────────────────────────────────────────────────
// Diagram-first. Boxes, flows and showcase blocks carry the meaning; copy is
// trimmed to what a box needs. Wide measure, generous gaps, real connectors.
const visual: StylePack = {
  id: "visual",
  ...STYLE_META.visual,
  origin: { x: 120, y: 120 },
  contentWidth: 2280,
  readingWidth: 880,
  gap: {
    item: 56,
    stack: 36,
    row: 80,
    section: 148,
    afterHeading: 32,
    afterSubhead: 20,
    part: 12,
    panelPad: 40,
    connector: 18,
  },
  type: { h1: 44, h2: 30, h3: 20, body: 16, caption: 13, quote: 22, stat: 52 },
  card: {
    width: 260,
    wideWidth: 380,
    titleSize: 20,
    bodySize: 16,
    fill: "#ffffff",
    stroke: "#e5e5e5",
    strokeWidth: 1,
  },
  ink: NEUTRAL_INK,
  panel: { fill: "#fafafa", stroke: "transparent" },
  accentFill: "#f0f6ff",
  frame: { fill: "#f4f4f5", stroke: "#e5e5e5", strokeWidth: 1, aspect: 16 / 10 },
  layouts: ["sequence", "grid", "columns", "stack", "split", "hub", "feature"],
  remap: {},
  connectors: true,
  render: {
    node: { mode: "boxed", size: "card" },
    detail: { mode: "boxed", size: "card" },
    stat: { mode: "boxed", size: "card" },
    bullets: { mode: "boxed", size: "wide" },
    prose: { mode: "plain", size: "full" },
    quote: { mode: "boxed", size: "wide", accent: true },
    code: { mode: "block", size: "wide" },
    terminal: { mode: "block", size: "wide" },
    api: { mode: "block", size: "intrinsic" },
    db: { mode: "block", size: "intrinsic" },
    image: { mode: "frame", size: "card" },
    showcase: { mode: "block", size: "intrinsic" },
    filetree: { mode: "block", size: "intrinsic" },
  },
  guards: {
    maxItemsPerSection: 10,
    maxRowItems: 5,
    gridColumns: 3,
    sequenceRowSteps: 4,
    maxDetailRatio: 0.5,
    minItemsForPanel: 2,
  },
}

// ── narrative ──────────────────────────────────────────────────────────────
// Text-first. A reading column, a full typographic scale, hairline dividers and
// whitespace instead of boxes. No connectors at all — a document has no arrows.
const narrative: StylePack = {
  id: "narrative",
  ...STYLE_META.narrative,
  origin: { x: 160, y: 140 },
  // A reading measure, not a canvas-filling sprawl. Body copy at 18px lands
  // around 80 characters a line here, which is where prose is comfortable.
  contentWidth: 1180,
  readingWidth: 1180,
  gap: {
    item: 48,
    stack: 32,
    row: 56,
    section: 128,
    afterHeading: 26,
    afterSubhead: 18,
    part: 10,
    panelPad: 36,
    connector: 0,
  },
  type: { h1: 52, h2: 32, h3: 22, body: 18, caption: 14, quote: 28, stat: 56 },
  card: {
    width: 560,
    wideWidth: 1180,
    titleSize: 22,
    bodySize: 18,
    fill: "#ffffff",
    stroke: "#ebebeb",
    strokeWidth: 1,
  },
  ink: NEUTRAL_INK,
  panel: { fill: "#fafafa", stroke: "transparent" },
  accentFill: "#fafafa",
  frame: { fill: "#f4f4f5", stroke: "#e5e5e5", strokeWidth: 1, aspect: 16 / 9 },
  layouts: ["stack", "columns", "grid", "feature"],
  // A flow, a hub and a split all collapse to the reading order they were
  // trying to imply. Nothing here can produce an arrow.
  remap: { sequence: "stack", hub: "stack", split: "columns" },
  connectors: false,
  render: {
    // Boxless: a node is a small heading, a detail is a heading plus its
    // paragraph, both as real text elements so the type scale governs them.
    node: { mode: "plain", size: "full" },
    detail: { mode: "plain", size: "full" },
    stat: { mode: "plain", size: "card" },
    bullets: { mode: "plain", size: "full" },
    prose: { mode: "plain", size: "full" },
    quote: { mode: "plain", size: "full" },
    code: { mode: "block", size: "full" },
    terminal: { mode: "block", size: "full" },
    api: { mode: "block", size: "intrinsic" },
    db: { mode: "block", size: "intrinsic" },
    image: { mode: "frame", size: "full" },
    showcase: { mode: "block", size: "intrinsic" },
    filetree: { mode: "block", size: "intrinsic" },
  },
  guards: {
    maxItemsPerSection: 10,
    maxRowItems: 3,
    gridColumns: 2,
    sequenceRowSteps: 1,
    // Text is the point here, so there is no card-wall to guard against.
    maxDetailRatio: 1,
    minItemsForPanel: 2,
  },
}

// ── gallery ────────────────────────────────────────────────────────────────
// Image-first. A hero frame and captioned grids at one consistent aspect ratio;
// text demoted to captions and labels. Frames are uniform on purpose — a
// gallery reads as a gallery because the rhythm doesn't vary.
const gallery: StylePack = {
  id: "gallery",
  ...STYLE_META.gallery,
  origin: { x: 120, y: 120 },
  contentWidth: 1960,
  readingWidth: 900,
  gap: {
    item: 40,
    stack: 26,
    row: 64,
    section: 132,
    afterHeading: 28,
    afterSubhead: 18,
    part: 14,
    panelPad: 36,
    connector: 16,
  },
  type: { h1: 46, h2: 28, h3: 18, body: 16, caption: 14, quote: 24, stat: 48 },
  card: {
    width: 420,
    wideWidth: 620,
    titleSize: 19,
    bodySize: 15,
    fill: "#ffffff",
    stroke: "#ebebeb",
    strokeWidth: 1,
  },
  ink: NEUTRAL_INK,
  panel: { fill: "#fafafa", stroke: "transparent" },
  accentFill: "#f7f7f8",
  // 3:2 throughout — the gallery's rhythm depends on every frame matching.
  frame: { fill: "#f4f4f5", stroke: "#e5e5e5", strokeWidth: 1, aspect: 3 / 2 },
  layouts: ["grid", "feature", "columns", "stack"],
  remap: { sequence: "grid", hub: "grid", split: "feature" },
  connectors: false,
  render: {
    node: { mode: "plain", size: "card" },
    detail: { mode: "boxed", size: "card" },
    stat: { mode: "plain", size: "card" },
    bullets: { mode: "boxed", size: "card" },
    prose: { mode: "plain", size: "full" },
    quote: { mode: "plain", size: "full" },
    code: { mode: "block", size: "wide" },
    terminal: { mode: "block", size: "wide" },
    api: { mode: "block", size: "intrinsic" },
    db: { mode: "block", size: "intrinsic" },
    image: { mode: "frame", size: "card" },
    showcase: { mode: "block", size: "intrinsic" },
    filetree: { mode: "block", size: "intrinsic" },
  },
  guards: {
    maxItemsPerSection: 12,
    maxRowItems: 4,
    gridColumns: 3,
    sequenceRowSteps: 1,
    maxDetailRatio: 0.4,
    minItemsForPanel: 3,
  },
}

export const STYLE_PACKS: Record<StyleId, StylePack> = { visual, narrative, gallery }

export function stylePack(id: StyleId): StylePack {
  return STYLE_PACKS[id]
}

/**
 * The layout a pack will actually use for a requested one. Anything the pack
 * doesn't render falls through `remap`, then to `stack` — which every pack has.
 */
export function resolveLayout(pack: StylePack, layout: SectionLayout): SectionLayout {
  if (pack.layouts.includes(layout)) return layout
  const mapped = pack.remap[layout]
  if (mapped && pack.layouts.includes(mapped)) return mapped
  return pack.layouts.includes("stack") ? "stack" : pack.layouts[0]
}
