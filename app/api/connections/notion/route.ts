import { notionStatus, startNotionAuthorization } from "@/lib/connections/notion"

// Connection status + authorization kickoff for the Notion source connector.
//
// GET  ?userId=...        -> { connected, name?, error? }
// POST { userId }         -> { url } consent URL to open, or { error }

function callbackUrl(req: Request): string {
  const origin = new URL(req.url).origin
  return `${origin}/connections/callback`
}

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId")
  if (!userId) return Response.json({ connected: false, error: "Missing userId." }, { status: 400 })
  const status = await notionStatus(userId)
  return Response.json(status)
}

export async function POST(req: Request) {
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }
  if (!body.userId) return Response.json({ error: "Missing userId." }, { status: 400 })

  try {
    const url = await startNotionAuthorization(body.userId, callbackUrl(req))
    return Response.json({ url })
  } catch (err) {
    console.error("notion authorize failed:", err)
    const message = err instanceof Error ? err.message : "Could not start Notion authorization."
    return Response.json({ error: message }, { status: 502 })
  }
}
