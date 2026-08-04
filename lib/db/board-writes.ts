import { db } from "@/lib/db"
import { boards, type BoardData, type BoardRow } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// Shared by the `saveBoard` Server Action (normal autosave) and the
// `/api/boards/flush` Route Handler (sendBeacon on tab-hide/close) so both
// paths write boards the same way.
export async function writeBoardData(
  id: string,
  patch: { name?: string; data?: BoardData },
): Promise<void> {
  const set: Partial<BoardRow> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.data !== undefined) set.data = patch.data
  await db.update(boards).set(set).where(eq(boards.id, id))
}
