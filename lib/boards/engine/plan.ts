import { z } from "zod"

// The semantic board plan — the only thing an AI model authors.
//
// The old authoring surface (lib/boards/blocks.ts) let the model send x, y,
// width, fill and stroke on a flat array of blocks, which made it the layout
// engine: every coordinate it guessed was a chance to overlap something, and
// every style value it guessed was a chance to look unlike the last board it
// built. This schema removes that entire category of decision. There is no
// geometry here and no color here. The model describes *what the board says*
// and *how its parts relate*; the structure engine decides where everything
// goes and what it looks like.
//
// Two consequences worth stating plainly, because they are the point:
//
//  1. A plan cannot express an overlap. Position is not representable.
//  2. A plan cannot express a connector between arbitrary items. Arrows come
//     from a section's declared layout (`sequence`, `hub`) or from `edges`
//     naming keys inside that same section — so an arrow always has a real
//     source and target, and the engine can route it or refuse to draw it.

/** Layout primitives a section can be arranged with. The engine owns the geometry of each. */
export const SECTION_LAYOUTS = [
  "sequence",
  "grid",
  "columns",
  "stack",
  "split",
  "hub",
  "feature",
] as const

export type SectionLayout = (typeof SECTION_LAYOUTS)[number]

/** Vercel showcase blocks a `showcase` item can render as. */
export const SHOWCASE_BLOCKS = [
  "aigateway",
  "connect",
  "ec2",
  "fluidcompute",
  "serverlesscompute",
  "computecomparison",
  "requestdemo",
] as const

const itemKey = z
  .string()
  .min(1)
  .max(40)
  .optional()
  .describe(
    "Stable id for this item. Only needed when an `edges` entry in this section refers to it.",
  )

// Item kinds are semantic, not visual: `node` means 'a labeled thing in a
// diagram', not 'a card with a 1px border'. The engine maps each kind to an
// element type and a full set of style values from the active style pack, so
// the same plan renders correctly in any of the three styles.

const nodeItem = z.object({
  kind: z.literal("node"),
  key: itemKey,
  label: z
    .string()
    .min(1)
    .max(80)
    .describe("Short label, one to five words. A node carries no body copy — use `detail` for that."),
})

const detailItem = z.object({
  kind: z.literal("detail"),
  key: itemKey,
  label: z.string().min(1).max(80).describe("The heading for this item."),
  body: z
    .string()
    .min(1)
    .max(400)
    .describe("One to three concise sentences. Never a bullet list — use the `bullets` kind."),
})

const statItem = z.object({
  kind: z.literal("stat"),
  key: itemKey,
  value: z
    .string()
    .min(1)
    .max(12)
    .describe('The figure itself and nothing else, e.g. "40%", "1.2s", "12k", "3x".'),
  label: z.string().min(1).max(60).describe("What the figure measures."),
})

const bulletsItem = z.object({
  kind: z.literal("bullets"),
  key: itemKey,
  label: z.string().max(80).optional().describe("Optional heading above the points."),
  points: z
    .array(z.string().min(1).max(160))
    .min(2)
    .max(6)
    .describe("Two to six short points. One line each where possible."),
})

const proseItem = z.object({
  kind: z.literal("prose"),
  key: itemKey,
  text: z
    .string()
    .min(1)
    .max(600)
    .describe("A paragraph of body copy, set as plain text with no box around it."),
})

const quoteItem = z.object({
  kind: z.literal("quote"),
  key: itemKey,
  text: z.string().min(1).max(300).describe("The quoted line, without surrounding quote marks."),
  attribution: z.string().max(80).optional(),
})

const codeItem = z.object({
  kind: z.literal("code"),
  key: itemKey,
  filename: z.string().min(1).max(60).describe('Shown in the window chrome, e.g. "app/page.tsx".'),
  source: z.string().min(1).max(4000).describe("The real source code, newline separated."),
  theme: z.enum(["dark", "light", "monokai"]).optional(),
})

const terminalItem = z.object({
  kind: z.literal("terminal"),
  key: itemKey,
  shell: z.string().max(40).optional().describe('Window label, defaults to "bash".'),
  transcript: z
    .string()
    .min(1)
    .max(2000)
    .describe('Shell session. Lines starting with "$" render as commands, the rest as output.'),
})

const apiItem = z.object({
  kind: z.literal("api"),
  key: itemKey,
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  path: z.string().min(1).max(80).describe('The route, e.g. "/api/checkout".'),
})

const dbItem = z.object({
  kind: z.literal("db"),
  key: itemKey,
  label: z.string().max(60).optional(),
  engine: z.enum(["postgres", "mysql", "redis", "mongodb"]).optional(),
})

const imageItem = z.object({
  kind: z.literal("image"),
  key: itemKey,
  src: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Absolute https:// URL of the image. Omit only if you have no real URL — the engine then lays out a captioned placeholder frame in its place.",
    ),
  caption: z.string().max(160).optional().describe("Caption set below the frame."),
  alt: z.string().max(160).optional(),
})

const showcaseItem = z.object({
  kind: z.literal("showcase"),
  key: itemKey,
  block: z.enum(SHOWCASE_BLOCKS),
  label: z.string().max(60).optional().describe("Overrides the block's built-in title."),
})

const filetreeItem = z.object({
  kind: z.literal("filetree"),
  key: itemKey,
  agentName: z.string().min(1).max(60),
  files: z
    .array(z.object({ name: z.string().min(1).max(120), code: z.string().max(4000) }))
    .min(1)
    .max(12)
    .describe("Paths are slash separated and nest into folders."),
})

export const itemSchema = z.discriminatedUnion("kind", [
  nodeItem,
  detailItem,
  statItem,
  bulletsItem,
  proseItem,
  quoteItem,
  codeItem,
  terminalItem,
  apiItem,
  dbItem,
  imageItem,
  showcaseItem,
  filetreeItem,
])

export type PlanItem = z.infer<typeof itemSchema>
export type ItemKind = PlanItem["kind"]

const edgeSchema = z.object({
  from: z.string().min(1).max(40).describe("`key` of the source item, in this same section."),
  to: z.string().min(1).max(40).describe("`key` of the target item, in this same section."),
  label: z.string().max(30).optional().describe("Short label on the connector."),
})

export const sectionSchema = z.object({
  heading: z
    .string()
    .max(80)
    .optional()
    .describe("Section heading. Omit for a section that needs no title."),
  subhead: z.string().max(200).optional().describe("One supporting line below the heading."),
  layout: z.enum(SECTION_LAYOUTS).describe(
    [
      "How this section is arranged:",
      "sequence — ordered steps left to right, wrapping into a serpentine. The engine draws the connectors; do NOT add edges.",
      "grid — peer items in even rows. No connectors, ever.",
      "columns — two to four parallel stacks, for comparisons. Label them with `columnLabels`.",
      "stack — one full-width column in reading order. No connectors.",
      "split — the first item as a large anchor, the rest stacked beside it.",
      "hub — the first item at the center, the rest around it. Connectors come from `edges`, or radiate from the center if omitted.",
      "feature — a single item at full size, optionally captioned by a second.",
    ].join("\n"),
  ),
  emphasis: z
    .enum(["none", "panel"])
    .optional()
    .describe("`panel` draws a tinted background panel behind the whole group. Use sparingly."),
  columnLabels: z
    .array(z.string().min(1).max(40))
    .min(2)
    .max(4)
    .optional()
    .describe("`columns` layout only. One label per column; items deal into columns in order."),
  items: z.array(itemSchema).min(1).max(12),
  edges: z
    .array(edgeSchema)
    .max(24)
    .optional()
    .describe("`hub` layout only. Connectors between items in this section, by `key`."),
})

export type PlanSection = z.infer<typeof sectionSchema>

export const boardPlanSchema = z.object({
  title: z.string().min(1).max(80).describe("Board title, set as the one h1 on the board."),
  subtitle: z.string().max(160).optional().describe("One line under the title."),
  sections: z.array(sectionSchema).min(1).max(8),
})

export type BoardPlan = z.infer<typeof boardPlanSchema>

/**
 * Appending to a board that already exists. No title: the board has one, and a
 * second h1 halfway down it is exactly the kind of thing the engine should make
 * unrepresentable rather than merely discourage.
 */
export const boardExtensionSchema = z.object({
  sections: z.array(sectionSchema).min(1).max(8),
})

export type BoardExtension = z.infer<typeof boardExtensionSchema>
