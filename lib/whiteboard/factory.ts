import type { CanvasElement, Tool } from "./types"
import { uid } from "./store"
import { AGENT_STRUCTURES } from "./eve-templates"
import { DEFAULT_GATEWAY_MODEL } from "./ai-gateway-models"
import { DEFAULT_DB_ENGINE } from "./db-engines"

export const DEFAULT_STROKE = "#171717"
const DEFAULT_STROKE_DARK = "#e5e5e5"

// Tracks the board editor's current light/dark preference (see
// components/site-theme.tsx) so freshly drawn shapes, lines and text default
// to a stroke that's actually visible against the canvas — a near-black
// default line is invisible on a dark canvas otherwise. This only changes
// what NEW elements get; anything already drawn (or template/AI-authored
// content, which always supplies its own explicit colors) keeps its stored
// color regardless of theme.
let elementTheme: "light" | "dark" = "light"

export function setElementTheme(theme: "light" | "dark") {
  elementTheme = theme
}

function defaultStroke() {
  return elementTheme === "dark" ? DEFAULT_STROKE_DARK : DEFAULT_STROKE
}

// The set of drawable primitives whose look-and-feel is worth "remembering":
// change a rectangle's stroke color and the next rectangle (or ellipse, or
// diamond) you draw should start out looking the same, the way Figma/
// Excalidraw carry a tool's last style forward across similar tools.
// Specialized workflow blocks (server, database, code, …) intentionally keep
// their own fixed dark-panel aesthetic instead.
//
// Shapes (rectangle/ellipse/diamond) share one memory bucket, connectors
// (arrow/line) share another, and cards get their own — matching how a user
// thinks about "shape style" vs "line style" vs "card style".
type StyleMemoryGroup = "shape" | "connector" | "card"
export type StyleOverride = Partial<
  Pick<CanvasElement, "stroke" | "fill" | "strokeWidth" | "strokeStyle" | "sloppiness" | "rounded">
>

const STYLE_MEMORY_GROUPS: Partial<Record<CanvasElement["type"], StyleMemoryGroup>> = {
  rectangle: "shape",
  ellipse: "shape",
  diamond: "shape",
  arrow: "connector",
  line: "connector",
  card: "card",
}
const styleMemory: Partial<Record<StyleMemoryGroup, StyleOverride>> = {}

// Called by the properties panel whenever the user changes stroke/fill/width/
// line style/sloppiness/edges on a selected element, so the change sticks as
// the default for the next element of that same group. In-memory only — it
// resets on reload, same as factory.ts's other "current tool" state above.
export function rememberElementStyle(type: CanvasElement["type"], patch: StyleOverride) {
  const group = STYLE_MEMORY_GROUPS[type]
  if (!group) return
  styleMemory[group] = { ...styleMemory[group], ...patch }
}

export function createElement(
  tool: Tool,
  x: number,
  y: number,
  style: { stroke: string; fill: string; strokeWidth: number },
): CanvasElement {
  const base: CanvasElement = {
    id: uid(),
    type: "rectangle",
    x,
    y,
    width: 0,
    height: 0,
    rotation: 0,
    stroke: style.stroke,
    fill: style.fill,
    strokeWidth: style.strokeWidth,
    opacity: 1,
    rounded: true,
    z: 0,
  }

  switch (tool) {
    // Shapes: unfilled outline by default, with a bold-ish 3px stroke — unless
    // the user's last edit to a shape set something else, in which case that
    // wins (styleMemory spread last).
    case "rectangle":
      return { ...base, type: "rectangle", fill: "transparent", stroke: defaultStroke(), strokeWidth: 3, ...styleMemory.shape }
    case "ellipse":
      return { ...base, type: "ellipse", fill: "transparent", stroke: defaultStroke(), strokeWidth: 3, ...styleMemory.shape }
    case "diamond":
      return { ...base, type: "diamond", fill: "transparent", stroke: defaultStroke(), strokeWidth: 3, ...styleMemory.shape }
    // Arrows: thicker default stroke
    case "arrow":
      return { ...base, type: "arrow", fill: "transparent", stroke: defaultStroke(), strokeWidth: 3, ...styleMemory.connector }
    case "line":
      return { ...base, type: "line", fill: "transparent", stroke: defaultStroke(), strokeWidth: 3, ...styleMemory.connector }
    case "text":
      return {
        ...base,
        type: "text",
        width: 240,
        height: 40,
        text: "",
        fontSize: 24,
        fill: "transparent",
        stroke: defaultStroke(),
      }
    case "card":
      return {
        ...base,
        type: "card",
        width: 260,
        height: 150,
        // left unset (not "Card title" / "Add a description...") so those
        // strings render as placeholders (see CardView/ElementEditor) instead
        // of real content that gets typed into rather than replaced
        title: "",
        text: "",
        stroke: "#000000",
        fill: "#ffffff",
        strokeWidth: 3,
        rounded: true,
        ...styleMemory.card,
      }
    case "code":
      return {
        ...base,
        type: "code",
        width: 340,
        height: 180,
        title: "index.tsx",
        text: `export default function App() {\n  return <h1>Hello, v0</h1>\n}`,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
        codeTheme: "dark",
        showRun: false,
      }
    case "terminal":
      return {
        ...base,
        type: "terminal",
        width: 340,
        height: 170,
        title: "bash",
        text: `$ vercel deploy\n\n▲ Deploying demo-project\n✓ Production: https://demo-project.vercel.app\n\n✓ Ready in 1.2s`,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
        codeTheme: "dark",
        showRun: false,
      }
    case "server":
      return {
        ...base,
        type: "server",
        width: 300,
        height: 180,
        method: "GET",
        endpoint: "/api/hello",
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
        showRun: false,
      }
    case "database":
      return {
        ...base,
        type: "database",
        width: 320,
        height: 230,
        title: "Database",
        dbEngine: DEFAULT_DB_ENGINE,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "aigateway":
      return {
        ...base,
        type: "aigateway",
        width: 440,
        height: 360,
        gatewayModel: DEFAULT_GATEWAY_MODEL,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "ec2":
      return {
        ...base,
        type: "ec2",
        width: 410,
        height: 390,
        title: "Amazon EC2",
        spendStart: 12.4,
        spendRatePerSecond: 0.45,
        showRequestButton: true,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "fluidcompute":
      return {
        ...base,
        type: "fluidcompute",
        width: 410,
        height: 390,
        title: "Vercel Functions",
        spendStart: 3.1,
        spendRatePerSecond: 0.14,
        activeDutyCycle: 0.42,
        showRequestButton: true,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "serverlesscompute":
      return {
        ...base,
        type: "serverlesscompute",
        width: 410,
        height: 390,
        title: "Serverless Functions",
        spendStart: 0,
        spendRatePerSecond: 0.14,
        showRequestButton: true,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "computecomparison":
      return {
        ...base,
        type: "computecomparison",
        width: 560,
        height: 980,
        title: "Compute comparison",
        spendRatePerSecond: 0.14,
        requestScope: base.id,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "requestdemo":
      return {
        ...base,
        type: "requestdemo",
        width: 360,
        height: 112,
        title: "Request traffic",
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
      }
    case "image":
      return { ...base, type: "image", width: 240, height: 160, fill: "transparent" }
      case "channelui":
      return {
        ...base,
        type: "channelui",
        // Width is set explicitly on create (320 * CHANNEL_UI_SCALE) and height
        // auto-fits to content; these are just sensible pre-measure defaults.
        width: 800,
        height: 600,
        fill: "transparent",
        stroke: "transparent",
        strokeWidth: 0,
        rounded: true,
      }
    case "filetree": {
      const struct = AGENT_STRUCTURES[0]
      return {
        ...base,
        type: "filetree",
        width: 240,
        height: 132,
        agentName: struct.agentName,
        activeFile: undefined,
        fill: "#0a0a0a",
        stroke: "#2e2e2e",
        strokeWidth: 1,
        rounded: true,
        files: struct.files.map((f) => ({ ...f })),
      }
    }
    default:
      return base
  }
}

// Default footprint of the auto-spawned sandbox terminal block. Height auto-fits
// to content once measured.
export const SANDBOX_WIDTH = 720
export const SANDBOX_GAP = 24

/**
 * Build a sandbox terminal element pinned to a channel UI block. Not a
 * user-drawable tool — it's spawned automatically when the agent runs shell
 * commands, so it's constructed directly rather than via `createElement`.
 */
export function makeSandboxElement(x: number, y: number, channelUiId: string): CanvasElement {
  return {
    id: uid(),
    type: "sandbox",
    x,
    y,
    width: SANDBOX_WIDTH,
    height: 260,
    rotation: 0,
    stroke: "transparent",
    fill: "transparent",
    strokeWidth: 0,
    opacity: 1,
    rounded: true,
    sandboxParent: channelUiId,
    runs: [],
    sandboxFiles: [],
    z: 0,
  }
}
