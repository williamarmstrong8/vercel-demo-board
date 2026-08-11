export type Tool =
  | "select"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "text"
  | "card"
  | "code"
  | "terminal"
  | "server"
  | "database"
  | "image"
  | "filetree"
  | "channelui"
  | "aigateway"
  | "connect"
  | "ec2"
  | "fluidcompute"
  | "serverlesscompute"
  | "computecomparison"
  | "requestdemo"

export type ElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "line"
  | "text"
  | "card"
  | "code"
  | "terminal"
  | "server"
  | "database"
  | "image"
  | "filetree"
  | "channelui"
  | "sandbox"
  | "aigateway"
  | "connect"
  | "ec2"
  | "fluidcompute"
  | "serverlesscompute"
  | "computecomparison"
  | "requestdemo"

// A single file inside an eve agent file-tree block. Clicking its row opens the
// code in a companion code block beside the tree.
export interface AgentFile {
  name: string
  code: string
  codeTheme?: CodeThemeId
}

export type CodeThemeId = "dark" | "light" | "monokai"

// How hand-drawn a shape looks: 0 keeps the crisp geometric render, 1 and 2
// sketch it with roughjs (mild / heavy).
export type Sloppiness = 0 | 1 | 2

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

export type DbEngine = "postgres" | "mysql" | "redis" | "mongodb"

// How a stroke/border is drawn: a plain line, or dashed/dotted. Applies to
// shapes, lines/arrows, and card borders — anything with a stroke width.
export type StrokeStyle = "solid" | "dashed" | "dotted"

// How a shape's fill is painted: flat colour, or drawn in as pen hatching.
// Undefined means "solid" everywhere it's read, so boards saved before this
// existed keep the flat fill they were drawn with.
export type FillStyle = "solid" | "hachure" | "cross-hatch"

// Stroke widths offered in the properties panel. Stored as a plain number (so
// AI- and template-authored boards can still specify anything), but the UI
// picks from these three and matches an arbitrary value to the nearest one.
export const STROKE_WIDTHS = [
  { label: "Small", value: 2 },
  { label: "Medium", value: 3 },
  { label: "Large", value: 6 },
] as const

// Typeface for element text (text blocks and card title/body). Undefined means
// "sans" everywhere it's read, so boards saved before this existed keep the
// look they were drawn with.
export type FontFamily = "sans" | "hand" | "mono"

// Ephemeral run phase for a node during a workflow run (not persisted).
export type RunPhase = "running" | "done"

export interface CanvasElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  // style
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  rounded: boolean
  sloppiness?: Sloppiness
  strokeStyle?: StrokeStyle
  fillStyle?: FillStyle
  // text / card
  text?: string
  fontSize?: number
  // Card body size. `fontSize` governs a card's title; this governs the copy
  // under it, so a style pack can set both independently. Undefined means the
  // design-system default (CARD.bodySize), which is what every card drawn
  // before this existed renders at.
  bodyFontSize?: number
  fontFamily?: FontFamily
  title?: string
  // text formatting
  textAlign?: "left" | "center" | "right"
  bold?: boolean
  italic?: boolean
  underline?: boolean
  // code / terminal block
  codeTheme?: CodeThemeId
  showRun?: boolean
  // server node
  method?: HttpMethod
  endpoint?: string
  // database node
  dbEngine?: DbEngine
  // image
  src?: string
  // eve agent file-tree block
  agentName?: string
  agentTemplate?: string // id of the structure template applied (e.g. "custom")
  files?: AgentFile[]
  activeFile?: string // name of the file currently opened in the companion block
  companionId?: string // (on a file-tree) id of the code block it opens files into
  companionOf?: string // (on a code block) id of the file-tree it belongs to
  // channel "send message" UI block (spawned by clicking a channel logo)
  channel?: string // channel id (e.g. "slack") the UI represents
  channelParent?: string // id of the file-tree that owns this channel UI
  // AI Gateway block: the currently-selected model string in `creator/model`
  // form. Swapping it is the "one line of code" the block showcases.
  gatewayModel?: string
  // Vercel Connect block: the currently-selected connection type id from
  // connect-providers.ts (oauth-app, mcp, custom-oauth, api-key). Swapping it
  // swaps the whole init sample — the fundamental `getToken(...)` call for
  // that connection type.
  connectType?: string
  // illustrative compute comparison blocks. Runtime counters derive from these
  // stable values; animation ticks are intentionally never persisted.
  spendStart?: number
  spendRatePerSecond?: number
  activeDutyCycle?: number
  showRequestButton?: boolean
  showPricing?: boolean
  showServerTowers?: boolean
  showContainerBorder?: boolean
  requestScope?: string
  // sandbox terminal block (auto-spawned when the agent runs shell commands)
  sandboxParent?: string // id of the channel UI whose session this mirrors
  runs?: SandboxRun[] // captured shell activity (bash / run_command), oldest first
  sandboxFiles?: SandboxFile[] // files the agent wrote or read in /workspace
  booting?: boolean // agent is working but hasn't produced sandbox activity yet
  z: number
}

// A single shell command the agent ran in its sandbox, mirrored from the live
// eve session into the store so a dedicated sandbox block can render it.
export interface SandboxRun {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode?: number
  running: boolean
}

// A file the agent touched in its sandbox (via write_file / read_file), so the
// sandbox block can show a file tree + contents alongside the terminal.
export interface SandboxFile {
  path: string // sandbox path, e.g. "/workspace/index.html"
  content: string
  action: "write" | "read"
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

// The canvas paper pattern behind a board's elements. Undefined (on boards
// saved before this existed) is treated the same as "plain" everywhere it's
// read, so old boards render exactly as they always have.
export type BackgroundStyle = "plain" | "dots" | "grid"

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  elements: CanvasElement[]
  camera: Camera
  backgroundStyle?: BackgroundStyle
}

export const GRID_SIZE = 20
export const SNAP_THRESHOLD = 6
