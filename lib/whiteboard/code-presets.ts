import type { CanvasElement } from "./types"

/**
 * Selectable starter templates for the code node. Each preset fills the block's
 * file name + source. API-style presets export a route handler with a
 * `Response.json(...)` call so that downstream website/server nodes can detect
 * the method, route, and response body and visualize the whole chain.
 */
export interface CodePreset {
  id: string
  label: string
  description: string
  fields: Partial<CanvasElement>
}

export const CODE_PRESETS: CodePreset[] = [
  {
    id: "api-users",
    label: "API route",
    description: "GET handler returning JSON",
    fields: {
      title: "app/api/users/route.ts",
      text: `export async function GET() {
  const users = [
    { id: 1, name: "Ada Lovelace" },
    { id: 2, name: "Alan Turing" },
  ]
  return Response.json({ users })
}`,
    },
  },
  {
    id: "marketing-content",
    label: "Marketing content",
    description: "CMS content for a landing page",
    fields: {
      title: "app/api/content/route.ts",
      text: `export async function GET() {
  return Response.json({
    headline: "Build faster with v0",
    subheadline:
      "The all-in-one platform to ship your product. Fast, reliable, and built for scale.",
    cta: "Get started",
    features: [
      { title: "Fast" },
      { title: "Secure" },
      { title: "Scalable" },
    ],
  })
}`,
    },
  },
  {
    id: "api-create",
    label: "POST route",
    description: "Create a record",
    fields: {
      title: "app/api/products/route.ts",
      text: `export async function POST(req: Request) {
  const body = await req.json()
  return Response.json({
    id: "prod_123",
    name: body.name,
    created: true,
  })
}`,
    },
  },
  {
    id: "auth",
    label: "Auth handler",
    description: "Login + session token",
    fields: {
      title: "app/api/auth/login/route.ts",
      text: `export async function POST(req: Request) {
  const { email } = await req.json()
  return Response.json({
    user: { email },
    token: "sess_abc123",
  })
}`,
    },
  },
  {
    id: "db-query",
    label: "DB query",
    description: "Query rows from a table",
    fields: {
      title: "app/api/orders/route.ts",
      text: `import { sql } from "@/lib/db"

export async function GET() {
  const orders = await sql\`SELECT * FROM orders LIMIT 10\`
  return Response.json({ orders })
}`,
    },
  },
  {
    id: "webhook",
    label: "Webhook",
    description: "Receive an event payload",
    fields: {
      title: "app/api/webhook/route.ts",
      text: `export async function POST(req: Request) {
  const event = await req.json()
  return Response.json({ received: true, type: event.type })
}`,
    },
  },
  {
    id: "blank",
    label: "Blank script",
    description: "Plain code, no route",
    fields: {
      title: "index.ts",
      text: `function main() {
  console.log("Hello, world")
}

main()`,
    },
  },
]
