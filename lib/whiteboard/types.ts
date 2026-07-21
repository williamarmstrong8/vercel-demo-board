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
  | "website"
  | "server"
  | "image"
  | "filetree"
  | "channelui"
  | "aigateway"
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
  | "website"
  | "server"
  | "image"
  | "filetree"
  | "channelui"
  | "sandbox"
  | "aigateway"
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

// Node types that participate in workflows (can be connected & run in sequence).
export const NODE_TYPES: ElementType[] = ["code", "terminal", "website", "server"]
export function isNodeType(t: ElementType): boolean {
  return NODE_TYPES.includes(t)
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

// A directed workflow connection between two node elements.
export interface Connection {
  id: string
  from: string
  to: string
}

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
  // text / card
  text?: string
  fontSize?: number
  title?: string
  // text formatting
  textAlign?: "left" | "center" | "right"
  bold?: boolean
  italic?: boolean
  underline?: boolean
  // code / terminal block
  codeTheme?: CodeThemeId
  showRun?: boolean
  // website / server node: when true (default) the node reflects the upstream
  // API context; when false it keeps its own custom, static configuration.
  smartConnect?: boolean
  // website node
  url?: string
  // website node page template — the shell renders when nothing feeds the node,
  // and it populates when upstream API data flows in.
  websiteTemplate?: "marketing" | "dashboard" | "login" | "products" | "api"
  // server node
  method?: HttpMethod
  endpoint?: string
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
  // illustrative compute comparison blocks. Runtime counters derive from these
  // stable values; animation ticks are intentionally never persisted.
  spendStart?: number
  spendRatePerSecond?: number
  activeDutyCycle?: number
  showRequestButton?: boolean
  showPricing?: boolean
  showServerTowers?: boolean
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

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  elements: CanvasElement[]
  connections: Connection[]
  camera: Camera
}

export const GRID_SIZE = 20
export const SNAP_THRESHOLD = 6
