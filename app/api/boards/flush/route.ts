import { NextResponse, type NextRequest } from "next/server"
import { writeBoardData } from "@/lib/db/board-writes"
import type { BoardData } from "@/lib/db/schema"

// A plain (non-Server-Action) endpoint so the client can flush a pending edit
// via navigator.sendBeacon on visibilitychange/beforeunload. Server Actions
// can't be targeted by sendBeacon (it needs a real URL), and a normal fetch
// isn't guaranteed to survive page teardown — this route is the thing that is.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: string
    name?: string
    data?: BoardData
  } | null

  if (!body?.id) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await writeBoardData(body.id, { name: body.name, data: body.data })
  return NextResponse.json({ ok: true })
}
