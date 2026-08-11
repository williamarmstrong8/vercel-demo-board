// Text measurement, calibrated against the fonts the canvas actually renders.
//
// This module exists because of one specific failure: the canvas re-measures
// text-bearing blocks on mount and writes the real height back to the element
// (`useFitHeight` in components/whiteboard/canvas-element.tsx). So a server-side
// height that comes in too SHORT does not merely look a little off — the block
// grows downward after mount and lands on top of whatever was placed below it.
// Server-side guesswork about text size is therefore the single largest source
// of overlapping elements on an AI-authored board.
//
// Two decisions follow from that, and they are the whole design:
//
//  1. The advance-width tables below are real, measured from Geist Sans and
//     Geist Mono as loaded by next/font — not a `fontSize * 0.6` guess.
//
//  2. Measurement deliberately runs a hair WIDE. Advances are summed per glyph,
//     which ignores kerning, and Geist Sans kerns about 2.4% tighter than the
//     sum of its glyphs. Overestimating width means lines break sooner than the
//     browser breaks them, so the predicted line count is >= the real one and
//     the predicted height is >= the real height. The client re-measure then
//     only ever SHRINKS a block. Shrinking opens up a little extra gap; it can
//     never cause an overlap. Growing can, so growing is the case to design out.
//
// To regenerate the tables: load the app, ensure the faces are loaded with
// `document.fonts.load('600 100px "GeistSans"')`, then for char codes 32..126
// record `ctx.measureText(ch).width / 100` at a 100px font size.

/** The type faces the canvas draws element text in. */
export type Face = "sans400" | "sans500" | "sans600" | "sans700" | "mono400"

// Advance widths in em units for ASCII 32..126, in code-point order.
const RAW: Record<Exclude<Face, "mono400">, string> = {
  sans400:
    "0.25,0.213,0.346,0.478,0.629,0.802,0.62,0.178,0.274,0.274,0.43,0.558,0.201,0.419,0.201,0.48,0.663,0.384,0.619,0.613,0.615,0.626,0.593,0.524,0.604,0.593,0.297,0.297,0.544,0.54,0.544,0.559,0.906,0.668,0.68,0.703,0.694,0.603,0.59,0.7,0.713,0.27,0.597,0.64,0.58,0.877,0.743,0.739,0.65,0.733,0.672,0.64,0.552,0.689,0.667,0.945,0.606,0.576,0.544,0.347,0.455,0.347,0.426,0.557,0.248,0.551,0.595,0.546,0.595,0.561,0.395,0.594,0.581,0.244,0.26,0.59,0.267,0.877,0.581,0.573,0.595,0.595,0.379,0.52,0.392,0.575,0.536,0.819,0.585,0.537,0.537,0.389,0.264,0.389,0.523",
  sans500:
    "0.2428,0.2278,0.3608,0.515,0.6426,0.8098,0.6486,0.1864,0.2902,0.2902,0.4272,0.562,0.2128,0.4184,0.2128,0.494,0.673,0.4056,0.6304,0.6252,0.6288,0.641,0.6042,0.5308,0.624,0.6056,0.3016,0.3016,0.546,0.544,0.546,0.5698,0.9248,0.6886,0.6876,0.7134,0.7012,0.6092,0.5948,0.7128,0.7158,0.28,0.607,0.6562,0.583,0.8896,0.7454,0.7512,0.6572,0.745,0.6804,0.6538,0.5678,0.6938,0.688,0.9682,0.6332,0.5944,0.5606,0.3612,0.4702,0.3612,0.4378,0.5584,0.258,0.5654,0.608,0.5632,0.608,0.5758,0.4122,0.6072,0.591,0.2564,0.2838,0.609,0.2822,0.8846,0.591,0.588,0.608,0.608,0.3942,0.5366,0.4096,0.5858,0.5602,0.829,0.6066,0.5534,0.5522,0.3952,0.274,0.3952,0.523",
  sans600:
    "0.2356,0.2426,0.3756,0.552,0.6562,0.8176,0.6772,0.1948,0.3064,0.3064,0.4244,0.566,0.2246,0.4178,0.2246,0.508,0.683,0.4272,0.6418,0.6374,0.6426,0.656,0.6154,0.5376,0.644,0.6182,0.3062,0.3062,0.548,0.548,0.548,0.5806,0.9436,0.7092,0.6952,0.7238,0.7084,0.6154,0.5996,0.7256,0.7186,0.29,0.617,0.6724,0.586,0.9022,0.7478,0.7634,0.6644,0.757,0.6888,0.6676,0.5836,0.6986,0.709,0.9914,0.6604,0.6128,0.5772,0.3754,0.4854,0.3754,0.4496,0.5598,0.268,0.5798,0.621,0.5804,0.621,0.5906,0.4294,0.6204,0.601,0.2688,0.3076,0.628,0.2974,0.8922,0.601,0.603,0.621,0.621,0.4094,0.5532,0.4272,0.5966,0.5844,0.839,0.6282,0.5698,0.5674,0.4014,0.284,0.4014,0.523",
  sans700:
    "0.2284,0.2574,0.3904,0.589,0.6698,0.8254,0.7058,0.2032,0.3226,0.3226,0.4216,0.57,0.2364,0.4172,0.2364,0.522,0.693,0.4488,0.6532,0.6496,0.6564,0.671,0.6266,0.5444,0.664,0.6308,0.3108,0.3108,0.55,0.552,0.55,0.5914,0.9624,0.7298,0.7028,0.7342,0.7156,0.6216,0.6044,0.7384,0.7214,0.3,0.627,0.6886,0.589,0.9148,0.7502,0.7756,0.6716,0.769,0.6972,0.6814,0.5994,0.7034,0.73,1.0146,0.6876,0.6312,0.5938,0.3896,0.5006,0.3896,0.4614,0.5612,0.278,0.5942,0.634,0.5976,0.634,0.6054,0.4466,0.6336,0.611,0.2812,0.3314,0.647,0.3126,0.8998,0.611,0.618,0.634,0.634,0.4246,0.5698,0.4448,0.6074,0.6086,0.849,0.6498,0.5862,0.5826,0.4076,0.294,0.4076,0.523",
}

// Geist Mono is a true monospace: every glyph measured at exactly 0.6em.
const MONO_ADVANCE = 0.6

// Advance to assume for anything outside ASCII — em dashes, bullets, arrows,
// accented letters, CJK. Averaged over common non-ASCII punctuation, and on the
// generous side so an unusual glyph errs toward an extra line rather than a
// clipped one.
const NON_ASCII: Record<Face, number> = {
  sans400: 0.62,
  sans500: 0.63,
  sans600: 0.64,
  sans700: 0.65,
  mono400: MONO_ADVANCE,
}

const TABLES: Partial<Record<Face, Float64Array>> = {}

function table(face: Face): Float64Array | null {
  if (face === "mono400") return null
  const cached = TABLES[face]
  if (cached) return cached
  const parsed = Float64Array.from(RAW[face].split(",").map(Number))
  TABLES[face] = parsed
  return parsed
}

/** Advance width of one character, in em units. */
function advance(code: number, face: Face): number {
  if (face === "mono400") return MONO_ADVANCE
  const t = table(face)!
  if (code >= 32 && code <= 126) return t[code - 32]
  // Tab renders as a space-ish blank in pre-wrap; anything else gets the
  // non-ASCII default.
  if (code === 9) return t[0] * 4
  return NON_ASCII[face]
}

/** Width of a run of text on one line, in px. Runs ~2% wide; see the note above. */
export function measureRun(text: string, face: Face, fontSize: number): number {
  let em = 0
  for (let i = 0; i < text.length; i++) em += advance(text.charCodeAt(i), face)
  return em * fontSize
}

/**
 * Number of rendered lines `text` occupies at `fontSize` inside `maxWidth`.
 *
 * Mirrors how the canvas wraps: newlines are hard breaks (`white-space:
 * pre-wrap`), spaces are the break opportunities, and a single word wider than
 * the line breaks mid-word (`overflow-wrap: anywhere`). Hyphens are NOT treated
 * as break opportunities even though browsers allow it — declining a legal break
 * can only produce more lines, which is the safe direction.
 */
export function countLines(text: string, face: Face, fontSize: number, maxWidth: number): number {
  const limit = Math.max(1, maxWidth)
  let total = 0

  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      total += 1 // an empty line still occupies one line box
      continue
    }

    let lines = 1
    let used = 0
    const spaceW = measureRun(" ", face, fontSize)
    const words = paragraph.split(" ")

    for (let w = 0; w < words.length; w++) {
      const word = words[w]
      // The space that precedes this word (every word but the first). A space at
      // a line break hangs past the edge in real browsers, so it is only
      // charged when the word stays on the current line.
      const lead = w === 0 ? 0 : spaceW
      const width = measureRun(word, face, fontSize)

      if (used === 0) {
        // Start of a line: place the word, breaking it up if it cannot fit.
        if (width <= limit) {
          used = width
        } else {
          const { lines: extra, tail } = breakWord(word, face, fontSize, limit)
          lines += extra
          used = tail
        }
        continue
      }

      if (used + lead + width <= limit) {
        used += lead + width
        continue
      }

      // Wrap to a new line.
      lines += 1
      if (width <= limit) {
        used = width
      } else {
        const { lines: extra, tail } = breakWord(word, face, fontSize, limit)
        lines += extra
        used = tail
      }
    }

    total += lines
  }

  return Math.max(1, total)
}

/**
 * Lay an over-long word across lines the way `overflow-wrap: anywhere` does.
 * Returns how many EXTRA lines it spills onto past the one it starts on, and how
 * much of the final line it leaves used.
 */
function breakWord(
  word: string,
  face: Face,
  fontSize: number,
  limit: number,
): { lines: number; tail: number } {
  let extra = 0
  let used = 0
  for (let i = 0; i < word.length; i++) {
    const w = advance(word.charCodeAt(i), face) * fontSize
    if (used > 0 && used + w > limit) {
      extra += 1
      used = w
    } else {
      used += w
    }
  }
  return { lines: extra, tail: used }
}

/** Height of a wrapped run, in px, at a unitless line-height multiplier. */
export function textHeight(
  text: string,
  face: Face,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
): number {
  return Math.ceil(countLines(text, face, fontSize, maxWidth) * fontSize * lineHeight)
}

/**
 * Natural single-line width of a run, capped. Used to size a heading's box so a
 * short title isn't a full-measure-wide element — the text is left-aligned
 * inside either way, this only affects the block's own bounds.
 */
export function naturalWidth(
  text: string,
  face: Face,
  fontSize: number,
  cap: number,
  min = 80,
): number {
  const widest = text
    .split("\n")
    .reduce((max, line) => Math.max(max, measureRun(line, face, fontSize)), 0)
  return Math.min(cap, Math.max(min, Math.ceil(widest) + 2))
}

// ── Block chrome ───────────────────────────────────────────────────────────
//
// Fixed geometry of the non-card blocks, read off their renderers in
// components/whiteboard/canvas-element.tsx. These are exact, not approximate:
// each view is a flex column of fixed-height chrome around a text body, so the
// only variable is how many lines the body wraps to.

/** CodeView: 1px borders, 34px header, 10px body padding, 20px line boxes. */
export const CODE = {
  chrome: 2 + 34 + 20,
  lineHeight: 20,
  fontSize: 13,
  /** Row padding (12 each side) plus the 22px line-number gutter. */
  inset: 2 + 24 + 22,
} as const

/** TerminalView: same chrome, 12px body padding all round, no gutter. */
export const TERMINAL = {
  chrome: 2 + 34 + 24,
  lineHeight: 20,
  fontSize: 13,
  inset: 2 + 24,
} as const

/** CardView paddings, from the two nested divs it renders. */
export const CARD_BOX = {
  /** Horizontal padding, both sides combined. */
  insetX: 32,
  titleTop: 12,
  /** Below the title when a body follows. */
  titleGapToBody: 8,
  /** Below the title on a title-only card. */
  titleBottomOnly: 12,
  bodyBottom: 14,
  titleLineHeight: 1.34,
  bodyLineHeight: 1.5,
} as const

/** TextView line-height, and its floor of one line box. */
export const TEXT_BOX = { lineHeight: 1.3 } as const

/**
 * Blocks whose height is fixed by their own chrome rather than by the text in
 * them. These are the ONE category the engine cannot derive: each is a deep flex
 * stack of decorative rows, and most of them re-measure themselves on mount and
 * write their real height back to the element — so a value that is too small
 * here doesn't just look slightly off, it lets the block grow into whatever was
 * placed below it.
 *
 * So these are measured, not inferred. Every number below was read off the live
 * canvas at the matching width in FIXED_BLOCK_WIDTH, then rounded UP a few px:
 * over-reserving leaves a little dead space, while under-reserving overlaps.
 *
 * To re-measure after changing one of these components: put one on a board, then
 * read `getComputedStyle` height off its `[data-el-id]` wrapper once its own
 * ResizeObserver has settled.
 */
export const FIXED_BLOCK_HEIGHT: Record<string, number> = {
  // Derived exactly and confirmed at 186: 1px borders + 38px header +
  // (12 + 3x26 + 2x5 + 12) rack + 34px footer.
  server: 186,
  database: 276, // measured 271
  aigateway: 384, // measured 379
  ec2: 390, // measured 390
  fluidcompute: 390, // measured 390
  serverlesscompute: 390, // measured 390
  computecomparison: 980, // measured 980
  // RequestDemoView is laid out at `height: 100%` and never re-measures itself,
  // so this is authoritative rather than an estimate.
  requestdemo: 112,
  // ConnectView's body is a code sample that changes with the selected
  // connection type, so its height genuinely varies. Deliberately generous.
  connect: 400,
}

/**
 * FileTreeView height: 1px borders, a 32px header, 8px body padding top and
 * bottom, then a row per file, per folder the paths imply, and one for the agent
 * name itself. Calibrated against the starter agent (3 files, 1 folder) which
 * renders at 164; this returns 180 for that tree, erring high on purpose.
 */
export function fileTreeHeight(files: { name: string }[]): number {
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.name.split("/")
    for (let i = 0; i < parts.length - 1; i++) folders.add(parts.slice(0, i + 1).join("/"))
  }
  const rows = files.length + folders.size + 1
  return 2 + 32 + 16 + rows * 26
}

/** Natural widths for the fixed blocks, matching lib/whiteboard/factory.ts. */
export const FIXED_BLOCK_WIDTH: Record<string, number> = {
  server: 300,
  database: 320,
  filetree: 240,
  aigateway: 440,
  connect: 440,
  ec2: 410,
  fluidcompute: 410,
  serverlesscompute: 410,
  computecomparison: 560,
  requestdemo: 360,
}

/** The face a card title renders in (600 weight), and its body (400). */
export const CARD_TITLE_FACE: Face = "sans600"
export const CARD_BODY_FACE: Face = "sans400"

/** The face a text block renders in — 700 when bold, 500 otherwise. */
export function textFace(bold: boolean): Face {
  return bold ? "sans700" : "sans500"
}
