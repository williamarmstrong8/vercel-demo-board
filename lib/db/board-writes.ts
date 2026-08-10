import { db } from "@/lib/db"
import { boards, type BoardData, type BoardRow } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

// Thrown when a board doesn't exist, or exists but isn't the caller's to write.
// Deliberately one error for both: telling an outsider which of the two it is
// would leak the existence of other people's private boards.
export class BoardWriteDeniedError extends Error {
  constructor() {
    super("Board not found, or you don't have permission to edit it.")
    this.name = "BoardWriteDeniedError"
  }
}

// Shared by the `saveBoard` Server Action (normal autosave) and the
// `/api/boards/flush` Route Handler (sendBeacon on tab-hide/close) so both
// paths write boards the same way.
//
// Ownership is enforced in the UPDATE's own WHERE clause rather than by reading
// the row first: autosave runs this on every edit, so this keeps it to a single
// round trip and leaves no window between the check and the write.
export async function writeBoardData(
  id: string,
  ownerId: string,
  patch: { name?: string; data?: BoardData },
): Promise<void> {
  const set: Partial<BoardRow> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.data !== undefined) set.data = patch.data

  const result = await db
    .update(boards)
    .set(set)
    .where(and(eq(boards.id, id), eq(boards.ownerId, ownerId)))

  if (result.rowCount === 0) throw new BoardWriteDeniedError()
}
