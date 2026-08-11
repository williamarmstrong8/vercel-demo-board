// The fundamental connection types Vercel Connect offers, for the "swap the
// connection type" showcase block. Mirrors the connector types in the docs —
// OAuth App (the managed Slack/GitHub/Linear/Snowflake/Salesforce connectors),
// MCP Server, Custom OAuth (any OAuth 2.0 provider), and API Key — rather than
// picking one brand per pill. Each sample is just the minimal `getToken` call
// that initializes that kind of connection: https://vercel.com/docs/connect

export interface ConnectType {
  id: string
  label: string
  // One-line pitch shown in the properties menu.
  description: string
  // Example connector uid passed to getToken(...) for this connection type.
  connector: string
  accent: string
  // Chip in the card title bar (e.g. "app token", "user token").
  badge: string
  // Minimal init-only TypeScript sample — just import + getToken.
  code: string
  // Substring inside `code` to highlight in the accent color.
  highlight: string
}

export const CONNECT_TYPES: ConnectType[] = [
  {
    id: "oauth-app",
    label: "OAuth App",
    description: "Vercel-managed connector — Slack, GitHub, Linear, Snowflake, Salesforce.",
    connector: "slack/acme-slack",
    accent: "#6366f1",
    badge: "app token",
    highlight: "slack/acme-slack",
    code: `import { getToken } from '@vercel/connect'

const token = await getToken('slack/acme-slack', {
  subject: { type: 'app' },
})`,
  },
  {
    id: "mcp",
    label: "MCP Server",
    description: "Any MCP server, registered by URL — mcp.<host>/<name>.",
    connector: "mcp.linear.app/my-agent",
    accent: "#22c55e",
    badge: "user token",
    highlight: "mcp.linear.app/my-agent",
    code: `import { getToken } from '@vercel/connect'

const token = await getToken('mcp.linear.app/my-agent', {
  subject: { type: 'user', id: userId },
})`,
  },
  {
    id: "custom-oauth",
    label: "Custom OAuth",
    description: "Any OAuth 2.0 / OIDC provider — bring your own client, or let Vercel register one.",
    connector: "oauth/my-provider",
    accent: "#38bdf8",
    badge: "user token",
    highlight: "oauth/my-provider",
    code: `import { getToken } from '@vercel/connect'

const token = await getToken('oauth/my-provider', {
  subject: { type: 'user', id: userId },
})`,
  },
  {
    id: "api-key",
    label: "API Key",
    description: "A static credential you supply once — Connect stores and serves it at runtime.",
    connector: "api-key/my-service",
    accent: "#f59e0b",
    badge: "app token",
    highlight: "api-key/my-service",
    code: `import { getToken } from '@vercel/connect'

const token = await getToken('api-key/my-service', {
  subject: { type: 'app' },
})`,
  },
]

export const DEFAULT_CONNECT_TYPE = CONNECT_TYPES[0].id

export function connectTypeById(id: string | undefined): ConnectType | undefined {
  return CONNECT_TYPES.find((t) => t.id === id)
}
