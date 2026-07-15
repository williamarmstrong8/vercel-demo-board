import type { CanvasElement, ElementType } from "@/lib/whiteboard/types"
import type { BoardData } from "@/lib/db/schema"

// Curated, read-only "Vercel ecosystem" boards for the public library. These are
// seeded into Neon on first load so the library is backed by real rows that can
// be opened and cloned like any other board.

let counter = 0
function el(
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<CanvasElement> = {},
): CanvasElement {
  counter += 1
  return {
    id: `seed-${counter}`,
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    stroke: "#e4e4e7",
    fill: "#ffffff",
    strokeWidth: 2,
    opacity: 1,
    rounded: true,
    z: counter,
    ...opts,
  }
}

// Palette kept tight: near-black, neutrals, one blue accent, one green accent.
const INK = "#111111"
const BLUE = "#2563eb"
const GREEN = "#16a34a"
const AMBER = "#d97706"
const MUTED = "#f4f4f5"

function board(
  id: string,
  name: string,
  authorName: string,
  description: string,
  elements: CanvasElement[],
): { id: string; name: string; authorName: string; description: string; data: BoardData } {
  return {
    id,
    name,
    authorName,
    description,
    data: { elements, connections: [], camera: { x: 0, y: 0, zoom: 1 } },
  }
}

export const PUBLIC_LIBRARY_SEED = [
  board(
    "lib-nextjs-arch",
    "Next.js App Router Architecture",
    "Vercel",
    "Reference layout of an App Router project: server components, route handlers, and data flow.",
    [
      el("text", 40, 24, 360, 40, { text: "App Router Architecture", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("card", 40, 90, 200, 120, { title: "app/layout.tsx", text: "Root layout + providers", fill: MUTED, stroke: INK }),
      el("card", 300, 90, 200, 120, { title: "app/page.tsx", text: "Server Component", fill: "#ffffff", stroke: BLUE }),
      el("card", 560, 90, 200, 120, { title: "route.ts", text: "Route Handler", fill: "#ffffff", stroke: GREEN }),
      el("server", 300, 260, 200, 90, { title: "GET /api/data", method: "GET", fill: "#ffffff", stroke: INK }),
      el("code", 560, 260, 220, 120, { title: "actions.ts", text: "use server", fill: "#0a0a0a", stroke: "#0a0a0a" }),
      el("rectangle", 40, 260, 200, 90, { fill: MUTED, stroke: INK }),
      el("text", 60, 285, 160, 40, { text: "Streaming + Suspense", fontSize: 14, fill: "transparent", stroke: "transparent" }),
    ],
  ),
  board(
    "lib-ai-chatbot",
    "AI SDK Chatbot Pipeline",
    "Vercel AI",
    "End-to-end chat flow using the AI SDK: client useChat, streaming route, tools, and model provider.",
    [
      el("text", 40, 24, 360, 40, { text: "AI SDK Chatbot", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("website", 40, 90, 220, 130, { title: "Chat UI", websiteTemplate: "dashboard", fill: "#ffffff", stroke: BLUE }),
      el("server", 320, 100, 200, 90, { title: "POST /api/chat", method: "POST", fill: "#ffffff", stroke: GREEN }),
      el("code", 320, 230, 220, 120, { title: "streamText()", text: "model: 'openai/gpt'", fill: "#0a0a0a", stroke: "#0a0a0a" }),
      el("card", 600, 100, 200, 110, { title: "Tools", text: "getWeather · search", fill: MUTED, stroke: INK }),
      el("card", 600, 240, 200, 110, { title: "AI Gateway", text: "Model routing", fill: "#ffffff", stroke: AMBER }),
    ],
  ),
  board(
    "lib-storefront",
    "E-commerce Storefront Flow",
    "Vercel Commerce",
    "Shopping journey from catalog to checkout with cart state and payment handoff.",
    [
      el("text", 40, 24, 360, 40, { text: "Storefront Flow", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("website", 40, 90, 200, 120, { title: "Catalog", websiteTemplate: "products", fill: "#ffffff", stroke: INK }),
      el("website", 280, 90, 200, 120, { title: "Product", websiteTemplate: "marketing", fill: "#ffffff", stroke: BLUE }),
      el("card", 520, 90, 190, 120, { title: "Cart", text: "Client state", fill: MUTED, stroke: INK }),
      el("server", 280, 260, 200, 90, { title: "POST /checkout", method: "POST", fill: "#ffffff", stroke: GREEN }),
      el("card", 520, 250, 190, 110, { title: "Stripe", text: "Payment intent", fill: "#ffffff", stroke: AMBER }),
    ],
  ),
  board(
    "lib-design-system",
    "Design System Tokens",
    "Geist",
    "Token architecture: primitives feeding semantic tokens feeding components.",
    [
      el("text", 40, 24, 360, 40, { text: "Design Tokens", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("rectangle", 40, 90, 150, 90, { fill: INK, stroke: INK }),
      el("rectangle", 210, 90, 150, 90, { fill: BLUE, stroke: BLUE }),
      el("rectangle", 380, 90, 150, 90, { fill: GREEN, stroke: GREEN }),
      el("rectangle", 550, 90, 150, 90, { fill: AMBER, stroke: AMBER }),
      el("card", 40, 210, 200, 110, { title: "Primitives", text: "color, space, radius", fill: MUTED, stroke: INK }),
      el("card", 280, 210, 200, 110, { title: "Semantic", text: "bg, fg, border", fill: "#ffffff", stroke: BLUE }),
      el("card", 520, 210, 200, 110, { title: "Components", text: "Button, Card, Input", fill: "#ffffff", stroke: INK }),
    ],
  ),
  board(
    "lib-multi-agent",
    "Multi-Agent Workflow",
    "eve",
    "Planner delegating to specialized worker agents with a shared tool layer.",
    [
      el("text", 40, 24, 360, 40, { text: "Multi-Agent Workflow", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("card", 300, 80, 200, 100, { title: "Planner", text: "Routes tasks", fill: INK, stroke: INK }),
      el("card", 40, 240, 190, 100, { title: "Researcher", text: "web_search", fill: "#ffffff", stroke: BLUE }),
      el("card", 300, 240, 190, 100, { title: "Coder", text: "write_file", fill: "#ffffff", stroke: GREEN }),
      el("card", 560, 240, 190, 100, { title: "Reviewer", text: "critique", fill: "#ffffff", stroke: AMBER }),
      el("terminal", 300, 380, 200, 90, { title: "sandbox", fill: "#0a0a0a", stroke: "#0a0a0a" }),
    ],
  ),
  board(
    "lib-deploy-pipeline",
    "Deployment Pipeline",
    "Vercel",
    "From git push to production: build, preview, checks, and promotion.",
    [
      el("text", 40, 24, 360, 40, { text: "Deployment Pipeline", fontSize: 26, bold: true, fill: "transparent", stroke: "transparent" }),
      el("card", 40, 100, 160, 90, { title: "git push", text: "GitHub", fill: MUTED, stroke: INK }),
      el("card", 240, 100, 160, 90, { title: "Build", text: "Turbopack", fill: "#ffffff", stroke: BLUE }),
      el("card", 440, 100, 160, 90, { title: "Preview", text: "Unique URL", fill: "#ffffff", stroke: GREEN }),
      el("card", 640, 100, 160, 90, { title: "Production", text: "Promote", fill: INK, stroke: INK }),
      el("server", 240, 240, 200, 90, { title: "Checks", method: "GET", fill: "#ffffff", stroke: AMBER }),
    ],
  ),
]
