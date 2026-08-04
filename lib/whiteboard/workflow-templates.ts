import type { CanvasElement, Connection, ElementType, Tool } from "./types"
import { createElement } from "./factory"
import { uid } from "./store"

/**
 * A reusable, pre-wired workflow: a set of nodes laid out on the canvas plus the
 * connections between them. Selecting one from the library spins up a fresh
 * board so common flows never have to be rebuilt by hand.
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

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "ec2-to-fluid-compute",
    name: "EC2 to Vercel Functions + Fluid Compute",
    description:
      "Compare an always-on EC2 instance with pooled Vercel Functions that accrue spend only during active compute.",
    preview: ["EC2", "VS", "Vercel Functions", "Fluid compute"],
    nodes: [
      {
        ref: "heading",
        type: "text",
        x: 80,
        y: 40,
        overrides: {
          width: 960,
          height: 52,
          text: "EC2 → Vercel Functions with Fluid compute",
          fontSize: 30,
          bold: true,
          textAlign: "center",
        },
      },
      {
        ref: "requests",
        type: "requestdemo",
        x: 380,
        y: 108,
        overrides: { height: 128 },
      },
      {
        ref: "ec2",
        type: "ec2",
        x: 60,
        y: 260,
        overrides: { width: 410, height: 390, spendStart: 12.4, spendRatePerSecond: 0.45, showRequestButton: false },
      },
      {
        ref: "versus",
        type: "text",
        x: 525,
        y: 420,
        overrides: {
          width: 70,
          height: 44,
          text: "VS",
          fontSize: 24,
          bold: true,
          textAlign: "center",
        },
      },
      {
        ref: "fluid",
        type: "fluidcompute",
        x: 650,
        y: 260,
        overrides: { width: 410, height: 390, spendStart: 3.1, spendRatePerSecond: 0.14, activeDutyCycle: 0.42, showRequestButton: false },
      },
      {
        ref: "ec2-note",
        type: "card",
        x: 60,
        y: 690,
        overrides: {
          width: 410,
          height: 118,
          title: "Pay while idle",
          text: "One provisioned instance keeps accruing illustrative spend whether requests arrive or not.",
        },
      },
      {
        ref: "fluid-note",
        type: "card",
        x: 650,
        y: 690,
        overrides: {
          width: 410,
          height: 118,
          title: "Pay for active compute",
          text: "Multiple functions share warm resources. The illustrative counter advances only during active bursts.",
        },
      },
    ],
    connections: [],
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
  const requestScope = uid()
  const computeDemoTypes: ElementType[] = ["requestdemo", "ec2", "fluidcompute", "serverlesscompute"]
  const elements = t.nodes.map((n) => {
    // Workflow nodes are always drawable element types (never the auto-spawned
    // "sandbox"), so this narrowing to Tool is safe.
    const el = createElement(n.type as Tool, n.x, n.y, STYLE)
    idMap.set(n.ref, el.id)
    return { ...el, ...n.overrides, ...(computeDemoTypes.includes(n.type) ? { requestScope } : {}) }
  })
  const connections: Connection[] = t.connections.map(([from, to]) => ({
    id: uid(),
    from: idMap.get(from) as string,
    to: idMap.get(to) as string,
  }))
  return { elements, connections }
}
