import { z } from "zod"
import type { AgentFile, CanvasElement, ElementType } from "@/lib/whiteboard/types"
import { AGENT_STRUCTURES } from "@/lib/whiteboard/eve-templates"
import { DEFAULT_GATEWAY_MODEL } from "@/lib/whiteboard/ai-gateway-models"
import { CARD, ARROW_PAD } from "@/lib/whiteboard/board-design"
import { uid } from "./service"

// The authoring surface handed to MCP clients.
//
// A CanvasElement has eleven required fields and ~40 optional ones, most of them
// styling. Exposing it verbatim would make an LLM spend its whole output budget
// restating defaults it has no opinion about — so clients send a small block
// spec and this module hydrates it into real elements.
//
// Defaults deliberately mirror lib/whiteboard/factory.ts, which cannot be
// imported here: it pulls `uid` from the "use client" Zustand store, which drags
// the IndexedDB image store into the server bundle.

// Excludes image (bytes live in browser IndexedDB), channelui and sandbox
// (spawned by live agent activity, not authored).
export const AUTHORABLE_BLOCK_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "text",
  "card",
  "code",
  "terminal",
  "server",
  "filetree",
  "aigateway",
  "ec2",
  "fluidcompute",
  "serverlesscompute",
  "computecomparison",
  "requestdemo",
] as const

export const blockSchema = z.object({
  type: z.enum(AUTHORABLE_BLOCK_TYPES),
  x: z.number().optional().describe("World x. Omit to auto-place in a left-to-right flow."),
  y: z.number().optional().describe("World y. Omit to auto-place in a left-to-right flow."),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  title: z
    .string()
    .optional()
    .describe("Header text: card heading, code filename, terminal shell name, compute block label."),
  text: z
    .string()
    .optional()
    .describe("Body content: text content, card description, code source, terminal transcript."),
  fontSize: z.number().int().positive().optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("server blocks only."),
  endpoint: z.string().optional().describe("server blocks only, e.g. /api/hello."),
  gatewayModel: z
    .string()
    .optional()
    .describe("aigateway blocks only. AI Gateway id in `creator/model` form."),
  agentName: z.string().optional().describe("filetree blocks only."),
  files: z
    .array(z.object({ name: z.string(), code: z.string() }))
    .optional()
    .describe("filetree blocks only. The eve agent's files."),
  codeTheme: z.enum(["dark", "light", "monokai"]).optional(),
  fill: z.string().optional().describe("CSS color. Omit to use the block type's default."),
  stroke: z.string().optional().describe("CSS color. Omit to use the block type's default."),
})

export type BlockSpec = z.infer<typeof blockSchema>

// Auto-layout: content starts inset from the world origin so it isn't flush
// against the viewport edge at the default camera, and wraps into rows.
const LAYOUT = { originX: 80, originY: 80, gap: 48, maxRowWidth: 2600 }

const DARK_PANEL = { fill: "#0a0a0a", stroke: "#2e2e2e", strokeWidth: 1 }
const SHAPE = { fill: "#e4e4e7", stroke: "transparent", strokeWidth: 0 }
const DEFAULT_STROKE = "#171717"

// Approximate the height a card will render at, so auto-layout row spacing and
// arrow centering are close to the real (client-fitted) height instead of a
// flat guess. CardView still corrects the exact height on mount, so this only
// needs to be in the right ballpark; it leans slightly tall to avoid overlap.
function wrappedLines(str: string, innerWidth: number, charWidth: number): number {
  const perLine = Math.max(1, Math.floor(innerWidth / charWidth))
  return str
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0)
}

// Text blocks hug their content and auto-fit on the client (TextView), but the
// server layout needs a close width/height up front so a large heading doesn't
// wrap into the row below it. Width follows the natural single-line width
// (capped so long copy wraps); height counts the wrapped lines.
function estimateTextSize(text: string | undefined, fontSize: number): { width: number; height: number } {
  const lines = (text || " ").split("\n")
  const longest = Math.max(1, ...lines.map((l) => l.length))
  // Lean wide so bold headings sit on one line; extra width past the text is
  // just harmless empty space for left-aligned text.
  const charW = fontSize * 0.62
  const natural = Math.ceil(longest * charW) + 12
  const width = Math.min(760, Math.max(120, natural))
  const perLine = Math.max(1, Math.floor((width - 12) / charW))
  const wrapped = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / perLine)), 0)
  const lineH = Math.round(fontSize * 1.3)
  return { width, height: Math.max(lineH, wrapped * lineH) }
}

function estimateCardHeight(
  title: string | undefined,
  text: string | undefined,
  width: number,
  titleSize: number = CARD.titleSize,
): number {
  const inner = Math.max(40, width - 32) // 16px horizontal padding each side
  const titleCharW = titleSize * 0.56 // rough advance width for a semibold glyph
  const titleLineH = Math.round(titleSize * 1.34)
  const titleLines = wrappedLines(title || "Card", inner, titleCharW)
  if (!text) return 24 + titleLines * titleLineH // title-only: 12+12 padding + lines
  const bodyLineH = Math.round(CARD.bodySize * 1.5)
  const textLines = wrappedLines(text, inner, CARD.bodySize * 0.5)
  return 34 + titleLines * titleLineH + textLines * bodyLineH // paddings + title + body lines
}

type Defaults = Partial<CanvasElement> & { width: number; height: number }

function defaultsFor(type: ElementType): Defaults {
  switch (type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
      return { ...SHAPE, width: 200, height: 120 }
    case "arrow":
      return { width: 160, height: 0, fill: "transparent", stroke: DEFAULT_STROKE, strokeWidth: 3 }
    case "line":
      return { width: 160, height: 0, fill: "transparent", stroke: DEFAULT_STROKE, strokeWidth: 3 }
    case "text":
      return {
        width: 240,
        height: 40,
        text: "",
        fontSize: 24,
        fill: "transparent",
        stroke: DEFAULT_STROKE,
      }
    case "card":
      // Height is a starting point only — cards auto-fit to their text on the
      // client (see CardView), so this just seeds the initial layout.
      return { width: CARD.width, height: 120, title: "", text: "", fill: "#ffffff", stroke: "#eaeaea", strokeWidth: 1 }
    case "code":
      return {
        ...DARK_PANEL,
        width: 340,
        height: 180,
        title: "index.tsx",
        text: `export default function App() {\n  return <h1>Hello, v0</h1>\n}`,
        codeTheme: "dark",
        showRun: false,
      }
    case "terminal":
      return {
        ...DARK_PANEL,
        width: 340,
        height: 170,
        title: "bash",
        text: `$ vercel deploy\n\n▲ Deploying demo-project\n✓ Production: https://demo-project.vercel.app\n\n✓ Ready in 1.2s`,
        codeTheme: "dark",
        showRun: false,
      }
    case "server":
      return { ...DARK_PANEL, width: 300, height: 180, method: "GET", endpoint: "/api/hello", showRun: false }
    case "filetree": {
      const struct = AGENT_STRUCTURES[0]
      return {
        ...DARK_PANEL,
        width: 240,
        height: 132,
        agentName: struct.agentName,
        files: struct.files.map((f) => ({ ...f })),
      }
    }
    case "aigateway":
      return { ...DARK_PANEL, width: 440, height: 360, gatewayModel: DEFAULT_GATEWAY_MODEL }
    case "ec2":
      return {
        ...DARK_PANEL,
        width: 410,
        height: 390,
        title: "Amazon EC2",
        spendStart: 12.4,
        spendRatePerSecond: 0.45,
        showRequestButton: true,
      }
    case "fluidcompute":
      return {
        ...DARK_PANEL,
        width: 410,
        height: 390,
        title: "Vercel Functions",
        spendStart: 3.1,
        spendRatePerSecond: 0.14,
        activeDutyCycle: 0.42,
        showRequestButton: true,
      }
    case "serverlesscompute":
      return {
        ...DARK_PANEL,
        width: 410,
        height: 390,
        title: "Serverless Functions",
        spendStart: 0,
        spendRatePerSecond: 0.14,
        showRequestButton: true,
      }
    case "computecomparison":
      return {
        ...DARK_PANEL,
        width: 560,
        height: 980,
        title: "Compute comparison",
        spendRatePerSecond: 0.14,
      }
    case "requestdemo":
      return { ...DARK_PANEL, width: 360, height: 112, title: "Request traffic" }
    default:
      return { ...SHAPE, width: 200, height: 120 }
  }
}

export class BlockSpecError extends Error {}

interface HydrateOptions {
  // Existing elements, so `add_blocks` flows below what's already on the board
  // and layers on top of it instead of colliding with z-index 0.
  existing?: CanvasElement[]
}

/**
 * Turn block specs into canvas elements, filling per-type defaults and laying
 * out any block that omitted coordinates.
 */
export function hydrateBlocks(
  specs: BlockSpec[],
  { existing = [] }: HydrateOptions = {},
): { elements: CanvasElement[] } {
  let cursorX = LAYOUT.originX
  let cursorY = LAYOUT.originY
  let rowHeight = 0

  // Flow beneath existing content rather than on top of it.
  if (existing.length > 0) {
    cursorY = Math.max(...existing.map((e) => e.y + e.height)) + LAYOUT.gap * 2
  }
  const baseZ = existing.length > 0 ? Math.max(...existing.map((e) => e.z)) + 1 : 0

  // Which blocks the auto-layout positioned (vs. explicit coords) — used below
  // to reposition connector arrows onto their neighbours' edges.
  const autoPlaced: boolean[] = []
  // A `text` block reads as a section heading: it starts a fresh row, and the
  // content after it drops onto the next row so the heading sits above its group.
  let breakBefore = false

  const elements = specs.map((spec, i) => {
    const type = spec.type as ElementType
    const defaults = defaultsFor(type)
    let width = spec.width ?? defaults.width
    let height = spec.height ?? defaults.height
    if (type === "card") {
      height = spec.height ?? estimateCardHeight(spec.title, spec.text, width, spec.fontSize)
    } else if (type === "text") {
      const est = estimateTextSize(spec.text, spec.fontSize ?? (defaults.fontSize as number) ?? 24)
      width = spec.width ?? est.width
      height = spec.height ?? est.height
    }

    autoPlaced[i] = spec.x === undefined || spec.y === undefined

    let { x, y } = spec
    if (x === undefined || y === undefined) {
      const isHeading = type === "text"
      const wrap = breakBefore || isHeading || cursorX + width > LAYOUT.maxRowWidth
      if (cursorX > LAYOUT.originX && wrap) {
        cursorX = LAYOUT.originX
        cursorY += rowHeight + LAYOUT.gap
        rowHeight = 0
      }
      x = x ?? cursorX
      y = y ?? cursorY
      cursorX += width + LAYOUT.gap
      rowHeight = Math.max(rowHeight, height)
      breakBefore = isHeading
    }

    const { files, ...rest } = spec
    const element: CanvasElement = {
      rotation: 0,
      opacity: 1,
      rounded: true,
      strokeWidth: 2,
      fill: "transparent",
      stroke: DEFAULT_STROKE,
      ...defaults,
      // Client-sent fields win over defaults, but only the ones actually
      // provided — spreading `rest` wholesale would overwrite defaults with
      // undefined for every omitted optional field.
      ...stripUndefined(rest),
      ...(files ? { files: files as AgentFile[] } : {}),
      id: uid(),
      type,
      x,
      y,
      width,
      height,
      z: baseZ + i,
    }

    return element
  })

  // Snap each auto-placed arrow so it bridges the gap between its row
  // neighbours — touching their edges and sitting in the gap rather than
  // floating short or drawing across (and behind) the blocks. Arrows that
  // can't bridge (e.g. their flow wrapped to a new row, so the previous step
  // is on the row above) are dropped rather than left dangling at a row start.
  const orphaned = new Set<number>()
  elements.forEach((el, i) => {
    if (el.type !== "arrow" || !autoPlaced[i]) return
    const left = elements[i - 1]
    const right = elements[i + 1]
    const sameRow = (n: CanvasElement | undefined) =>
      n && n.type !== "arrow" && Math.abs(n.y - el.y) <= 4
    // Inset the arrow from both neighbours so it doesn't touch their edges.
    const startX = left ? left.x + left.width + ARROW_PAD : 0
    const endX = right ? right.x - ARROW_PAD : 0
    if (sameRow(left) && sameRow(right) && endX - startX >= 8) {
      // Vertically center between the two neighbours before moving x/width.
      el.y = el.y + (left!.height + right!.height) / 4
      el.x = startX
      el.width = endX - startX
      el.height = 0
    } else {
      orphaned.add(i)
    }
  })

  return { elements: orphaned.size ? elements.filter((_, i) => !orphaned.has(i)) : elements }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Compact, token-cheap description of a board for tool results. */
export function describeElements(elements: CanvasElement[]): string {
  if (elements.length === 0) return "(empty)"
  return elements
    .map((el) => {
      const label = el.title || el.text?.split("\n")[0] || el.endpoint || el.agentName || ""
      const trimmed = label.length > 60 ? `${label.slice(0, 57)}…` : label
      return `- ${el.type} at (${Math.round(el.x)}, ${Math.round(el.y)})${trimmed ? `: ${trimmed}` : ""}`
    })
    .join("\n")
}
