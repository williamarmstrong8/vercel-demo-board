import type { CanvasElement, ElementType } from "@/lib/whiteboard/types"
import type { ItemKind, PlanItem } from "./plan"
import type { StylePack } from "./tokens"
import {
  CARD_BODY_FACE,
  CARD_BOX,
  CARD_TITLE_FACE,
  CODE,
  FIXED_BLOCK_HEIGHT,
  FIXED_BLOCK_WIDTH,
  TERMINAL,
  TEXT_BOX,
  countLines,
  fileTreeHeight,
  naturalWidth,
  textFace,
  textHeight,
} from "./metrics"

// Item measurement: one plan item in, one measured box out.
//
// A measured item is a stack of PARTS at a shared width. That indirection is
// what lets the same semantic item render three different ways: a `detail` is
// one card in the visual style, but a heading text plus a paragraph text in the
// narrative style, and an `image` is a frame plus a caption in both. The layout
// primitives never need to know which — they place a box of a known width and
// height, and the parts come along with it.
//
// Every height here is computed from the real renderer's geometry (see the
// constants in metrics.ts), biased to run slightly tall. Nothing is a guess.

/** A canvas element with its identity and stacking left to the emitter. */
export type ElementDraft = Omit<CanvasElement, "id" | "x" | "y" | "z">

export interface Part {
  /** Offset from the measured item's left edge. */
  dx: number
  /** Offset from the measured item's top edge. */
  dy: number
  width: number
  height: number
  draft: ElementDraft
}

export interface Measured {
  key?: string
  kind: ItemKind
  width: number
  height: number
  parts: Part[]
  /**
   * Which part a connector should attach to. For a captioned image that's the
   * frame, not the caption — an arrow should meet the picture.
   */
  anchor: number
}

const BASE: ElementDraft = {
  type: "rectangle",
  width: 0,
  height: 0,
  rotation: 0,
  stroke: "#171717",
  fill: "transparent",
  strokeWidth: 2,
  opacity: 1,
  rounded: true,
}

function textDraft(opts: {
  text: string
  fontSize: number
  color: string
  bold?: boolean
  italic?: boolean
  align?: "left" | "center" | "right"
}): ElementDraft {
  return {
    ...BASE,
    type: "text",
    text: opts.text,
    fontSize: opts.fontSize,
    stroke: opts.color,
    fill: "transparent",
    bold: opts.bold,
    italic: opts.italic,
    textAlign: opts.align,
  }
}

function cardDraft(
  pack: StylePack,
  opts: { title: string; body?: string; titleSize: number; bodySize: number; accent?: boolean },
): ElementDraft {
  return {
    ...BASE,
    type: "card",
    title: opts.title,
    text: opts.body ?? "",
    fontSize: opts.titleSize,
    bodyFontSize: opts.bodySize,
    fill: opts.accent ? pack.accentFill : pack.card.fill,
    stroke: pack.card.stroke,
    strokeWidth: pack.card.strokeWidth,
    rounded: true,
  }
}

/** The dark-panel look every code-style block shares. */
const PANEL = { fill: "#0a0a0a", stroke: "#2e2e2e", strokeWidth: 1 }

// ── height helpers ─────────────────────────────────────────────────────────

/** Rendered height of a card at `width`. Mirrors CardView's two nested divs. */
export function cardHeight(
  title: string,
  body: string | undefined,
  width: number,
  titleSize: number,
  bodySize: number,
): number {
  const inner = Math.max(24, width - CARD_BOX.insetX)
  const titleLines = countLines(title || " ", CARD_TITLE_FACE, titleSize, inner)
  let h = CARD_BOX.titleTop + Math.ceil(titleLines * titleSize * CARD_BOX.titleLineHeight)
  if (body) {
    const bodyLines = countLines(body, CARD_BODY_FACE, bodySize, inner)
    h +=
      CARD_BOX.titleGapToBody +
      Math.ceil(bodyLines * bodySize * CARD_BOX.bodyLineHeight) +
      CARD_BOX.bodyBottom
  } else {
    h += CARD_BOX.titleBottomOnly
  }
  return h
}

/** Rendered height of a text block at `width`. */
export function plainTextHeight(text: string, width: number, fontSize: number, bold: boolean): number {
  return Math.max(
    Math.round(fontSize * TEXT_BOX.lineHeight),
    textHeight(text, textFace(bold), fontSize, Math.max(24, width), TEXT_BOX.lineHeight),
  )
}

function codeBlockHeight(source: string, width: number): number {
  const inner = Math.max(40, width - CODE.inset)
  const lines = countLines(source, "mono400", CODE.fontSize, inner)
  return CODE.chrome + lines * CODE.lineHeight
}

function terminalBlockHeight(transcript: string, width: number): number {
  const inner = Math.max(40, width - TERMINAL.inset)
  const lines = countLines(transcript, "mono400", TERMINAL.fontSize, inner)
  return TERMINAL.chrome + lines * TERMINAL.lineHeight
}

// ── widths ─────────────────────────────────────────────────────────────────

/** The element type a `block`-mode item renders as. */
function blockType(item: PlanItem): ElementType {
  switch (item.kind) {
    case "api":
      return "server"
    case "db":
      return "database"
    case "filetree":
      return "filetree"
    case "showcase":
      return item.block as ElementType
    case "code":
      return "code"
    case "terminal":
      return "terminal"
    default:
      return "rectangle"
  }
}

/**
 * How wide this item wants to be inside `available`. Layout primitives call this
 * to size their slots, then hand the resolved width back to `measureItem` — so a
 * grid can make every cell in a row match while an intrinsic block keeps the
 * width its renderer is designed for.
 */
export function slotWidth(item: PlanItem, pack: StylePack, available: number): number {
  const render = pack.render[item.kind]
  if (render.size === "intrinsic") {
    return FIXED_BLOCK_WIDTH[blockType(item)] ?? Math.min(available, pack.card.width)
  }
  if (render.size === "card") return Math.min(available, pack.card.width)
  if (render.size === "wide") return Math.min(available, pack.card.wideWidth)
  return Math.min(available, pack.readingWidth)
}

/**
 * A bare line of text as a measured item — section headings, subheads and column
 * labels. `fit` sizes the box to the text rather than the full measure, so a
 * short heading isn't a measure-wide block.
 */
export function measureLabel(
  text: string,
  pack: StylePack,
  opts: { fontSize: number; width: number; bold?: boolean; color?: string; fit?: boolean },
): Measured {
  const bold = opts.bold ?? false
  const color = opts.color ?? pack.ink.heading
  const width = opts.fit
    ? naturalWidth(text, textFace(bold), opts.fontSize, opts.width)
    : opts.width
  const height = plainTextHeight(text, width, opts.fontSize, bold)
  return {
    kind: "prose",
    width,
    height,
    parts: [
      {
        dx: 0,
        dy: 0,
        width,
        height,
        draft: textDraft({ text, fontSize: opts.fontSize, color, bold }),
      },
    ],
    anchor: 0,
  }
}

/** Whether an item's width is fixed by its renderer and must not be stretched. */
export function isRigid(item: PlanItem, pack: StylePack): boolean {
  return pack.render[item.kind].size === "intrinsic"
}

// ── the measurer ───────────────────────────────────────────────────────────

interface Stackable {
  width: number
  height: number
  draft: ElementDraft
  dx?: number
}

function stack(pieces: Stackable[], gap: number): { parts: Part[]; height: number } {
  let y = 0
  const parts: Part[] = []
  pieces.forEach((piece, i) => {
    if (i > 0) y += gap
    parts.push({ dx: piece.dx ?? 0, dy: y, width: piece.width, height: piece.height, draft: piece.draft })
    y += piece.height
  })
  return { parts, height: y }
}

/**
 * Measure one item at an exact width.
 *
 * `width` is authoritative for everything except rigid blocks, whose renderers
 * are built around a fixed footprint.
 */
export function measureItem(item: PlanItem, pack: StylePack, width: number): Measured {
  const render = pack.render[item.kind]
  const w = isRigid(item, pack) ? slotWidth(item, pack, width) : Math.max(80, Math.round(width))
  const boxed = render.mode === "boxed"
  const { ink, type, card, gap } = pack

  const one = (piece: Stackable, kind: ItemKind, key?: string): Measured => ({
    key,
    kind,
    width: piece.width,
    height: piece.height,
    parts: [{ dx: 0, dy: 0, width: piece.width, height: piece.height, draft: piece.draft }],
    anchor: 0,
  })

  const many = (pieces: Stackable[], kind: ItemKind, key?: string, anchor = 0): Measured => {
    const { parts, height } = stack(pieces, gap.part)
    return {
      key,
      kind,
      width: Math.max(...pieces.map((p) => p.width)),
      height,
      parts,
      anchor,
    }
  }

  switch (item.kind) {
    case "node": {
      if (boxed) {
        const h = cardHeight(item.label, undefined, w, card.titleSize, card.bodySize)
        return one(
          { width: w, height: h, draft: cardDraft(pack, { title: item.label, titleSize: card.titleSize, bodySize: card.bodySize }) },
          "node",
          item.key,
        )
      }
      // Boxless: a node is just a small heading.
      const fw = naturalWidth(item.label, textFace(true), type.h3, w)
      return one(
        {
          width: fw,
          height: plainTextHeight(item.label, fw, type.h3, true),
          draft: textDraft({ text: item.label, fontSize: type.h3, color: ink.heading, bold: true }),
        },
        "node",
        item.key,
      )
    }

    case "detail": {
      if (boxed) {
        const h = cardHeight(item.label, item.body, w, card.titleSize, card.bodySize)
        return one(
          {
            width: w,
            height: h,
            draft: cardDraft(pack, {
              title: item.label,
              body: item.body,
              titleSize: card.titleSize,
              bodySize: card.bodySize,
              accent: render.accent,
            }),
          },
          "detail",
          item.key,
        )
      }
      return many(
        [
          {
            width: w,
            height: plainTextHeight(item.label, w, type.h3, true),
            draft: textDraft({ text: item.label, fontSize: type.h3, color: ink.heading, bold: true }),
          },
          {
            width: w,
            height: plainTextHeight(item.body, w, type.body, false),
            draft: textDraft({ text: item.body, fontSize: type.body, color: ink.body }),
          },
        ],
        "detail",
        item.key,
      )
    }

    case "stat": {
      if (boxed) {
        const h = cardHeight(item.value, item.label, w, type.stat, card.bodySize)
        return one(
          {
            width: w,
            height: h,
            draft: cardDraft(pack, {
              title: item.value,
              body: item.label,
              titleSize: type.stat,
              bodySize: card.bodySize,
            }),
          },
          "stat",
          item.key,
        )
      }
      return many(
        [
          {
            width: w,
            height: plainTextHeight(item.value, w, type.stat, true),
            draft: textDraft({ text: item.value, fontSize: type.stat, color: ink.heading, bold: true }),
          },
          {
            width: w,
            height: plainTextHeight(item.label, w, type.body, false),
            draft: textDraft({ text: item.label, fontSize: type.body, color: ink.muted }),
          },
        ],
        "stat",
        item.key,
      )
    }

    case "bullets": {
      const body = item.points.map((p) => `•  ${p}`).join("\n")
      // A card with no title renders CardView's grey placeholder, so bullets
      // without a label are always boxless whatever the pack prefers.
      if (boxed && item.label) {
        const h = cardHeight(item.label, body, w, card.titleSize, card.bodySize)
        return one(
          {
            width: w,
            height: h,
            draft: cardDraft(pack, {
              title: item.label,
              body,
              titleSize: card.titleSize,
              bodySize: card.bodySize,
            }),
          },
          "bullets",
          item.key,
        )
      }
      const pieces: Stackable[] = []
      if (item.label) {
        pieces.push({
          width: w,
          height: plainTextHeight(item.label, w, type.h3, true),
          draft: textDraft({ text: item.label, fontSize: type.h3, color: ink.heading, bold: true }),
        })
      }
      pieces.push({
        width: w,
        height: plainTextHeight(body, w, type.body, false),
        draft: textDraft({ text: body, fontSize: type.body, color: ink.body }),
      })
      return many(pieces, "bullets", item.key, pieces.length - 1)
    }

    case "prose":
      return one(
        {
          width: w,
          height: plainTextHeight(item.text, w, type.body, false),
          draft: textDraft({ text: item.text, fontSize: type.body, color: ink.body }),
        },
        "prose",
        item.key,
      )

    case "quote": {
      if (boxed) {
        const h = cardHeight(item.text, item.attribution, w, type.quote, card.bodySize)
        return one(
          {
            width: w,
            height: h,
            draft: cardDraft(pack, {
              title: item.text,
              body: item.attribution,
              titleSize: type.quote,
              bodySize: card.bodySize,
              accent: render.accent,
            }),
          },
          "quote",
          item.key,
        )
      }
      const pieces: Stackable[] = [
        {
          width: w,
          height: plainTextHeight(item.text, w, type.quote, false),
          draft: textDraft({ text: item.text, fontSize: type.quote, color: ink.heading, italic: true }),
        },
      ]
      if (item.attribution) {
        pieces.push({
          width: w,
          height: plainTextHeight(item.attribution, w, type.caption, false),
          draft: textDraft({
            text: `— ${item.attribution}`,
            fontSize: type.caption,
            color: ink.muted,
          }),
        })
      }
      return many(pieces, "quote", item.key)
    }

    case "code":
      return one(
        {
          width: w,
          height: codeBlockHeight(item.source, w),
          draft: {
            ...BASE,
            ...PANEL,
            type: "code",
            title: item.filename,
            text: item.source,
            codeTheme: item.theme ?? "dark",
            showRun: false,
          },
        },
        "code",
        item.key,
      )

    case "terminal":
      return one(
        {
          width: w,
          height: terminalBlockHeight(item.transcript, w),
          draft: {
            ...BASE,
            ...PANEL,
            type: "terminal",
            title: item.shell ?? "bash",
            text: item.transcript,
            codeTheme: "dark",
            showRun: false,
          },
        },
        "terminal",
        item.key,
      )

    case "api":
      return one(
        {
          width: w,
          height: FIXED_BLOCK_HEIGHT.server,
          draft: {
            ...BASE,
            ...PANEL,
            type: "server",
            method: item.method,
            endpoint: item.path,
            showRun: false,
          },
        },
        "api",
        item.key,
      )

    case "db":
      return one(
        {
          width: w,
          height: FIXED_BLOCK_HEIGHT.database,
          draft: {
            ...BASE,
            ...PANEL,
            type: "database",
            title: item.label ?? "Database",
            dbEngine: item.engine ?? "postgres",
          },
        },
        "db",
        item.key,
      )

    case "filetree":
      return one(
        {
          width: w,
          height: fileTreeHeight(item.files),
          draft: {
            ...BASE,
            ...PANEL,
            type: "filetree",
            agentName: item.agentName,
            files: item.files.map((f) => ({ ...f })),
          },
        },
        "filetree",
        item.key,
      )

    case "showcase": {
      const type_ = blockType(item)
      return one(
        {
          width: w,
          height: FIXED_BLOCK_HEIGHT[type_] ?? 360,
          draft: {
            ...BASE,
            ...PANEL,
            type: type_,
            ...(item.label ? { title: item.label } : {}),
          },
        },
        "showcase",
        item.key,
      )
    }

    case "image": {
      const frameH = Math.round(w / pack.frame.aspect)
      const parts: Part[] = []

      if (item.src) {
        parts.push({
          dx: 0,
          dy: 0,
          width: w,
          height: frameH,
          draft: { ...BASE, type: "image", src: item.src, fill: "transparent", strokeWidth: 0, stroke: "transparent" },
        })
      } else {
        // No usable URL: a frame at the pack's aspect ratio, so the composition
        // is intact and real images can be dropped in later.
        parts.push({
          dx: 0,
          dy: 0,
          width: w,
          height: frameH,
          draft: {
            ...BASE,
            type: "rectangle",
            fill: pack.frame.fill,
            stroke: pack.frame.stroke,
            strokeWidth: pack.frame.strokeWidth,
            rounded: true,
          },
        })
        const hint = item.alt ?? item.caption
        if (hint) {
          const hintH = plainTextHeight(hint, w - 48, pack.type.caption, false)
          parts.push({
            dx: 24,
            dy: Math.max(0, Math.round((frameH - hintH) / 2)),
            width: w - 48,
            height: hintH,
            draft: textDraft({
              text: hint,
              fontSize: pack.type.caption,
              color: pack.ink.muted,
              align: "center",
            }),
          })
        }
      }

      let height = frameH
      if (item.caption) {
        const capH = plainTextHeight(item.caption, w, pack.type.caption, false)
        parts.push({
          dx: 0,
          dy: frameH + gap.part,
          width: w,
          height: capH,
          draft: textDraft({ text: item.caption, fontSize: pack.type.caption, color: ink.muted }),
        })
        height = frameH + gap.part + capH
      }

      return { key: item.key, kind: "image", width: w, height, parts, anchor: 0 }
    }
  }
}

/** Height a heading block occupies, including the gap below it. */
export function headingHeight(text: string, pack: StylePack, level: "h1" | "h2"): number {
  return plainTextHeight(text, pack.contentWidth, pack.type[level], true)
}
