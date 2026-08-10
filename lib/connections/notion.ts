import "server-only"
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp"
import { connectAuthProvider, ConsentRequiredError } from "@vercel/connect/ai-sdk"
import { getTokenResponse, startAuthorization, UserAuthorizationRequiredError } from "@vercel/connect"

// Notion connection via Vercel Connect.
//
// The connector is registered in the Vercel dashboard (Connect → the Notion
// OAuth connector). `getToken`/the MCP auth provider authenticate to Vercel
// Connect with the deployment's OIDC token (VERCEL_OIDC_TOKEN locally), which
// then mints a short-lived Notion token per user. See:
// https://vercel.com/docs/connect

// Connector uid as registered in the dashboard. Overridable via env so the same
// code works across projects/renames.
export const NOTION_CONNECTOR = process.env.NOTION_CONNECTOR ?? "mcp.notion.com/vercel-demo-board"

// Notion's hosted MCP endpoint. Overridable in case the path changes.
export const NOTION_MCP_URL = process.env.NOTION_MCP_URL ?? "https://mcp.notion.com/mcp"

export { ConsentRequiredError }

function subjectFor(userId: string) {
  return { type: "user" as const, id: userId }
}

/**
 * Open an MCP client to Notion, authenticated as `userId` through Vercel
 * Connect. If the user hasn't authorized Notion yet, the auth provider throws
 * `ConsentRequiredError` (carrying the consent `url`) — catch it at the call
 * site and surface the URL so the user can connect.
 *
 * `callbackUrl` is where Connect returns the user after they grant access.
 */
export async function openNotionClient(
  userId: string,
  opts: { callbackUrl?: string } = {},
): Promise<MCPClient> {
  return createMCPClient({
    transport: {
      type: "http",
      url: NOTION_MCP_URL,
      authProvider: connectAuthProvider(
        NOTION_CONNECTOR,
        { subject: subjectFor(userId) },
        { redirectUrl: opts.callbackUrl },
      ),
    },
  })
}

export interface NotionStatus {
  connected: boolean
  name?: string
  error?: string
}

/** Whether `userId` has an active Notion grant, and the workspace name. */
export async function notionStatus(userId: string): Promise<NotionStatus> {
  try {
    const res = await getTokenResponse(NOTION_CONNECTOR, { subject: subjectFor(userId) })
    return { connected: true, name: res.name }
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) return { connected: false }
    // Expired OIDC, connector-not-found, project-not-linked, etc. Report the
    // reason so the UI can distinguish "not connected" from "misconfigured".
    return { connected: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Begin the Notion OAuth consent flow; returns the URL to send the user to. */
export async function startNotionAuthorization(userId: string, callbackUrl: string): Promise<string> {
  const { url } = await startAuthorization(
    NOTION_CONNECTOR,
    { subject: subjectFor(userId) },
    { callbackUrl },
  )
  return url
}
