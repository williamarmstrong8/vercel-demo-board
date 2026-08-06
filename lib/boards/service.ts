import { db } from "@/lib/db"
import { boards, type BoardData, type BoardRow } from "@/lib/db/schema"
import { writeBoardData, BoardWriteDeniedError } from "@/lib/db/board-writes"
import { getCurrentUser, requireUser } from "@/lib/auth"
import { and, eq, ne, desc } from "drizzle-orm"
import { revalidatePath } from "next/cache"

// Board persistence, shared by the Server Actions in app/actions/boards.ts (the
// browser UI) and the AI board builder in app/api/ai/build-board/route.ts, so
// both callers create and mutate boards through exactly one implementation.
//
// This is also where access control lives, for the same reason: every caller is
// request-scoped, so each function resolves the viewer from the session itself
// instead of trusting an id passed in from above. The rules are:
//
//   read   — the owner, or anyone at all once the board is public
//   write  — the owner, and only the owner, public or not
//   create — any signed-in user; the board starts private
//
// Reads that a viewer isn't entitled to return null (a 404 at the page level)
// rather than a distinct "forbidden", so private boards don't advertise that
// they exist. Writes throw BoardWriteDeniedError.

export { BoardWriteDeniedError }

export const EMPTY_DATA: BoardData = {
  elements: [],
  camera: { x: 0, y: 0, zoom: 1 },
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// A lightweight board summary for grids (keeps the full element data for
// rendering previews, but nothing else heavy).
export interface BoardSummary {
  id: string
  name: string
  data: BoardData
  isPublic: boolean
  authorName: string | null
  description: string | null
  updatedAt: string
  // Whether the viewer this summary was loaded for owns the board. Drives both
  // the UI (edit affordances) and the editor's read-only mode; the server
  // re-checks on every write regardless.
  isOwner: boolean
}

function toSummary(row: BoardRow, viewerId: string | null): BoardSummary {
  return {
    id: row.id,
    name: row.name,
    data: row.data,
    isPublic: row.isPublic,
    authorName: row.authorName,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
    isOwner: viewerId !== null && row.ownerId === viewerId,
  }
}

// The signed-in user's own boards, private and public alike. Signed-out
// visitors own nothing, so they get an empty personal section.
export async function listMyBoards(): Promise<BoardSummary[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const rows = await db
    .select()
    .from(boards)
    .where(eq(boards.ownerId, user.id))
    .orderBy(desc(boards.updatedAt))

  return rows.map((row) => toSummary(row, user.id))
}

// Boards other people have published. The viewer's own public boards are
// excluded so they appear once, in the personal section, flagged as public —
// rather than in both grids.
export async function listSharedBoards(): Promise<BoardSummary[]> {
  const user = await getCurrentUser()

  const visible = user
    ? and(eq(boards.isPublic, true), ne(boards.ownerId, user.id))
    : eq(boards.isPublic, true)

  const rows = await db.select().from(boards).where(visible).orderBy(desc(boards.updatedAt))
  return rows.map((row) => toSummary(row, user?.id ?? null))
}

export async function getBoard(id: string): Promise<BoardSummary | null> {
  const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1)
  if (!row) return null

  const user = await getCurrentUser()
  const isOwner = user !== null && row.ownerId === user.id
  if (!isOwner && !row.isPublic) return null

  return toSummary(row, user?.id ?? null)
}

export async function createBoard(name?: string): Promise<string> {
  return createBoardFromData(name ?? "", EMPTY_DATA)
}

// Create a board pre-populated with data (e.g. from a workflow template, or
// from the AI builder that authored the whole canvas in one shot).
export async function createBoardFromData(name: string, data: BoardData): Promise<string> {
  const user = await requireUser()
  const id = uid()

  await db.insert(boards).values({
    id,
    ownerId: user.id,
    // Captured now rather than joined at read time: there is no users table, so
    // this is the only record of who made the board once it's shared.
    authorName: user.displayName,
    name: name?.trim() || "Untitled board",
    data,
    isPublic: false,
  })

  revalidatePath("/")
  return id
}

// Persist canvas changes. Debounced client-side to a single write path (see
// components/whiteboard/board-editor.tsx) and mirrored by the sendBeacon
// lifecycle flush in app/api/boards/flush/route.ts — both call this same
// underlying writer so there's one source of truth for what a "save" does.
export async function saveBoard(
  id: string,
  patch: { name?: string; data?: BoardData },
): Promise<void> {
  const user = await requireUser()
  await writeBoardData(id, user.id, patch)
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const user = await requireUser()

  // Intentionally do NOT touch updatedAt: renaming is metadata, not a content
  // edit, so it must not change the "Edited …" time or reorder the boards grid
  // (which is sorted by updatedAt desc).
  const result = await db
    .update(boards)
    .set({ name: name.trim() || "Untitled board" })
    .where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))

  if (result.rowCount === 0) throw new BoardWriteDeniedError()
  revalidatePath("/")
}

// Publish or unpublish a board. Public is read-only for everyone but the owner,
// so this only widens who can see it — never who can change it.
export async function setBoardVisibility(id: string, isPublic: boolean): Promise<void> {
  const user = await requireUser()

  // Visibility is metadata too, so like renameBoard this leaves updatedAt alone.
  const result = await db
    .update(boards)
    .set({ isPublic })
    .where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))

  if (result.rowCount === 0) throw new BoardWriteDeniedError()
  revalidatePath("/")
}

export async function deleteBoard(id: string): Promise<void> {
  const user = await requireUser()

  const result = await db
    .delete(boards)
    .where(and(eq(boards.id, id), eq(boards.ownerId, user.id)))

  if (result.rowCount === 0) throw new BoardWriteDeniedError()
  revalidatePath("/")
}
