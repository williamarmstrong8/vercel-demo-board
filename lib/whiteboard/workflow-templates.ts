import type { CanvasElement, Connection, ElementType, Tool } from "./types"
import { createElement } from "./factory"
import { uid } from "./store"

/**
 * A reusable, pre-wired workflow: a set of nodes laid out on the canvas plus the
 * connections between them. Selecting one from the library spins up a fresh
 * board so common flows (DB-backed shop, marketing site, auth, dashboard) never
 * have to be rebuilt by hand.
 */
export interface TemplateNode {
  ref: string // local id used to declare connections
  type: ElementType
  x: number
  y: number
  overrides?: Partial<CanvasElement>
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  // A tiny preview: ordered node "kinds" rendered as chips in the library card.
  preview: string[]
  nodes: TemplateNode[]
  connections: [from: string, to: string][]
}

const STYLE = { stroke: "#000000", fill: "transparent", strokeWidth: 2 }

// Horizontal lane positions for a full website(before) -> code -> server ->
// website(after) chain. Websites sit slightly higher so the row centers align.
const COL = { webBefore: 40, code: 480, server: 900, webAfter: 1240 }
const ROW_WEB = 120
const ROW_NODE = 160

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "fullstack-flow",
    name: "Full-stack flow",
    description:
      "Frontend → API route → server → populated UI. Edit the code block and the connected pages + server follow it automatically.",
    preview: ["Frontend", "API route", "Server", "Populated UI"],
    nodes: [
      {
        ref: "before",
        type: "website",
        x: COL.webBefore,
        y: ROW_WEB,
        // No static websiteTemplate: the page derives its shell from the code block.
        overrides: { url: "https://demo-project.vercel.app" },
      },
      {
        ref: "code",
        type: "code",
        x: COL.code,
        y: ROW_NODE,
        overrides: {
          title: "app/api/products/route.ts",
          text: `import { sql } from "@/lib/db"

export async function GET() {
  const products = await sql\`SELECT id, name, price FROM products LIMIT 6\`
  return Response.json({ products })
}`,
          showRun: true,
        },
      },
      {
        ref: "server",
        type: "server",
        x: COL.server,
        y: ROW_NODE,
        // Method + endpoint are derived from the connected code block.
      },
      {
        ref: "after",
        type: "website",
        x: COL.webAfter,
        y: ROW_WEB,
        overrides: { url: "https://demo-project.vercel.app" },
      },
    ],
    connections: [
      ["before", "code"],
      ["code", "server"],
      ["server", "after"],
    ],
  },
]

/**
 * Turns a template definition into concrete elements + connections with fresh,
 * unique ids (remapping the local refs used to declare the connections).
 */
export function instantiateTemplate(t: WorkflowTemplate): {
  elements: CanvasElement[]
  connections: Connection[]
} {
  const idMap = new Map<string, string>()
  const elements = t.nodes.map((n) => {
    // Workflow nodes are always drawable element types (never the auto-spawned
    // "sandbox"), so this narrowing to Tool is safe.
    const el = createElement(n.type as Tool, n.x, n.y, STYLE)
    idMap.set(n.ref, el.id)
    return { ...el, ...n.overrides }
  })
  const connections: Connection[] = t.connections.map(([from, to]) => ({
    id: uid(),
    from: idMap.get(from) as string,
    to: idMap.get(to) as string,
  }))
  return { elements, connections }
}
