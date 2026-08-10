import { NextResponse, type NextRequest } from "next/server"
import { writeBoardData, BoardWriteDeniedError } from "@/lib/db/board-writes"
import { getCurrentUser } from "@/lib/auth"
import type { BoardData } from "@/lib/db/schema"

// A plain (non-Server-Action) endpoint so the client can flush a pending edit
// via navigator.sendBeacon on visibilitychange/beforeunload. Server Actions
// can't be targeted by sendBeacon (it needs a real URL), and a normal fetch
// isn't guaranteed to survive page teardown — this route is the thing that is.
//
// Being a public URL taking a board id, it needs the same ownership check the
// `saveBoard` action gets for free; the session cookie rides along on the
// beacon, so the writer resolves the owner exactly as it does everywhere else.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    id?: string
    name?: string
    data?: BoardData
  } | null

  if (!body?.id) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    await writeBoardData(body.id, user.id, { name: body.name, data: body.data })
  } catch (error) {
    if (error instanceof BoardWriteDeniedError) {
      return NextResponse.json({ ok: false }, { status: 403 })
    }
    throw error
  }

  return NextResponse.json({ ok: true })
}
