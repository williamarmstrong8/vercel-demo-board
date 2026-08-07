import type { CanvasElement, ElementType, Tool } from "./types"
import { createElement } from "./factory"
import { uid } from "./store"

/**
 * A reusable set of nodes laid out on the canvas. Selecting one from the
 * library spins up a fresh board so common layouts never have to be rebuilt by
 * hand.
 */
export interface TemplateNode {
  ref: string // local id for the node
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
  },
  {
    id: "eve-agent-overview",
    name: "Eve agent overview",
    description:
      "An annotated look at chatting with an eve agent: the channel it's reached through, its file-and-folder structure, and the AI Gateway model behind it.",
    preview: ["Chat", "File tree", "Code", "AI Gateway"],
    nodes: [
      {
        ref: "title-rect",
        type: "rectangle",
        x: 788,
        y: 0,
        overrides: { width: 494, height: 150, fill: "#ffffff", stroke: "#171717", strokeWidth: 3, sloppiness: 2 },
      },
      {
        ref: "title-text",
        type: "text",
        x: 916,
        y: 47,
        overrides: {
          width: 240,
          height: 55,
          text: "Eve Demo",
          fontSize: 42,
          bold: true,
          textAlign: "center",
          stroke: "#171717",
          fill: "transparent",
          strokeWidth: 2,
          sloppiness: 2,
        },
      },
      {
        ref: "try-it-card",
        type: "card",
        x: 260,
        y: 810,
        overrides: {
          width: 260,
          height: 174,
          title: "TRY IT!!!",
          text: 'This is a real eve agent! Try typing in "What\'s the weather in NYC?" and see the magic happen.',
          fill: "#ffffff",
          stroke: "#171717",
          strokeWidth: 3,
          sloppiness: 2,
        },
      },
      {
        ref: "channels-card",
        type: "card",
        x: 222,
        y: 0,
        overrides: {
          width: 479,
          height: 174,
          title: "Channels",
          text: "Chat with your agent here. Use different channels, which are different softwares and apps that you use on a daily basis. These may have different interfaces, but they all chat with the same agent in the same way.",
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 3,
          sloppiness: 2,
        },
      },
      {
        ref: "structure-card",
        type: "card",
        x: 862,
        y: 846,
        overrides: {
          width: 479,
          height: 147,
          title: "Structure",
          text: "All your agents capabilities are just a folder and a file. Throw in new files, and your agent automatically knows it has access to it.",
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 3,
          sloppiness: 2,
        },
      },
      {
        ref: "ai-gateway-card",
        type: "card",
        x: 1622,
        y: 719,
        overrides: {
          width: 260,
          height: 201,
          title: "AI Gateway",
          text: "Behind the scenes, AI gateway powers the eve agent. Switch out the model in agent.ts to see how easy it is.",
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 3,
        },
      },
      {
        ref: "the-code-card",
        type: "card",
        x: 1622,
        y: 247,
        overrides: {
          width: 260,
          height: 201,
          title: "The Code",
          text: "Code is extremely simple, only what you need, not the mess. Hook up anything to your agent easily and securly",
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 3,
        },
      },
      {
        ref: "arrow-channels",
        type: "arrow",
        x: 706,
        y: 175,
        overrides: { width: 102.4, height: 64.9, fill: "transparent", stroke: "#171717", strokeWidth: 3, sloppiness: 2 },
      },
      {
        ref: "arrow-structure",
        type: "arrow",
        x: 984,
        y: 819,
        overrides: { width: 0.8, height: -311, fill: "transparent", stroke: "#171717", strokeWidth: 4, sloppiness: 2 },
      },
      {
        ref: "chat-window",
        type: "channelui",
        x: 0,
        y: 248,
        overrides: {
          width: 800,
          height: 531,
          channel: "terminal",
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          channelParent: "agent-tree",
        },
      },
      {
        ref: "agent-tree",
        type: "filetree",
        x: 872,
        y: 248,
        overrides: {
          width: 240,
          height: 192,
          agentName: "weather-assistant",
          agentTemplate: "weather",
          activeFile: "channels/eve.ts",
          companionId: "agent-code",
          fill: "#0a0a0a",
          stroke: "#2e2e2e",
          strokeWidth: 1,
          files: [
            {
              name: "agent.ts",
              codeTheme: "dark",
              code: 'import { defineAgent } from "eve";\n\nexport default defineAgent({\n  name: "weather-assistant",\n  model: "openai/gpt-5.4-mini",\n  tools: ["./tools"],\n});',
            },
            {
              name: "instructions.md",
              codeTheme: "dark",
              code: "# weather-assistant\n\nYou are a friendly weather assistant.\n\n## Guidelines\n- Use the `get_weather` tool to look up live conditions.\n- Always state the city and units in your answer.\n- If the user doesn't give a city, ask which one they mean.\n- Keep replies to two short sentences.",
            },
            {
              name: "tools/get_weather.ts",
              codeTheme: "dark",
              code: '// This is a "tool" the assistant can use to look up the weather for any place you name.\n// Live data from wttr.in — free, no API key and no signup. The URL path is the\n// place: wttr.in/tokyo, wttr.in/94103, wttr.in/SFO. "format=j1" asks for JSON.\nimport { defineTool } from "eve/tools";\nimport { z } from "zod";\nexport default defineTool({\n  description: "Get the current weather for a city.",\n  inputSchema: z.object({ city: z.string() }),\n  async execute({ city }) {\n    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;\n    const res = await fetch(url);\n    const data = await res.json();\n    const now = data.current_condition[0];\n    return {\n      city,\n      region: data.nearest_area[0].region[0].value,\n      condition: now.weatherDesc[0].value.trim(),\n      temperatureC: Number(now.temp_C),\n      temperatureF: Number(now.temp_F),\n      humidity: Number(now.humidity),\n      windKph: Number(now.windspeedKmph),\n      source: "wttr.in",\n    };\n  },\n});',
            },
            {
              name: "channels/eve.ts",
              codeTheme: "dark",
              code: 'import { eveChannel } from "eve/channels/eve";\nimport { localDev, vercelOidc } from "eve/channels/auth";\n\nexport default eveChannel({\n  auth: [localDev(), vercelOidc()],\n});',
            },
          ],
        },
      },
      {
        ref: "agent-code",
        type: "code",
        x: 1176,
        y: 248,
        overrides: {
          width: 400,
          height: 216,
          title: "channels/eve.ts",
          text: 'import { eveChannel } from "eve/channels/eve";\nimport { localDev, vercelOidc } from "eve/channels/auth";\n\nexport default eveChannel({\n  auth: [localDev(), vercelOidc()],\n});',
          codeTheme: "dark",
          showRun: false,
          fill: "#0a0a0a",
          stroke: "#2e2e2e",
          strokeWidth: 1,
          companionOf: "agent-tree",
        },
      },
      {
        ref: "ai-gateway-node",
        type: "aigateway",
        x: 1922,
        y: 719,
        overrides: {
          width: 440,
          height: 379,
          gatewayModel: "moonshotai/kimi-k3",
          fill: "#0a0a0a",
          stroke: "#2e2e2e",
          strokeWidth: 1,
        },
      },
    ],
  },
]

// Override keys that hold another node's `ref` rather than a literal value —
// a file-tree's companion code block, a code block's owning file-tree, a chat
// window's parent agent. Resolved against real generated ids below so a
// template can wire these up by name instead of guessing at ids that don't
// exist yet.
const REF_OVERRIDE_KEYS = ["companionId", "companionOf", "channelParent"] as const

/**
 * Turns a template definition into concrete elements with fresh, unique ids.
 */
export function instantiateTemplate(t: WorkflowTemplate): {
  elements: CanvasElement[]
} {
  const requestScope = uid()
  const computeDemoTypes: ElementType[] = ["requestdemo", "ec2", "fluidcompute", "serverlesscompute"]

  // Elements are created up front so REF_OVERRIDE_KEYS can be resolved against
  // the real ids below, regardless of which order the nodes are declared in.
  const created = t.nodes.map((n) => ({
    node: n,
    // Workflow nodes are always drawable element types (never the auto-spawned
    // "sandbox"), so this narrowing to Tool is safe.
    el: createElement(n.type as Tool, n.x, n.y, STYLE),
  }))
  const idByRef = new Map(created.map(({ node, el }) => [node.ref, el.id]))

  const elements = created.map(({ node, el }) => {
    const overrides: Partial<CanvasElement> = { ...node.overrides }
    for (const key of REF_OVERRIDE_KEYS) {
      const ref = overrides[key]
      if (typeof ref === "string" && idByRef.has(ref)) overrides[key] = idByRef.get(ref)
    }
    return { ...el, ...overrides, ...(computeDemoTypes.includes(node.type) ? { requestScope } : {}) }
  })
  return { elements }
}
