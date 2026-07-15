"use server"

import { db } from "@/lib/db"
import { boards, boardStars, user, type BoardData, type BoardRow } from "@/lib/db/schema"
import { PUBLIC_LIBRARY_SEED } from "@/lib/whiteboard/public-library-seed"
import { getCurrentUser, requireUserId } from "@/lib/auth/current-user"
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

const LIBRARY_OWNER = "vercel-ecosystem"

// Seed the curated public library once. Uses fixed ids + onConflictDoNothing so
// it is idempotent and safe to call on every public-library read.
async function ensurePublicLibrarySeeded(): Promise<void> {
  await db
    .insert(boards)
    .values(
      PUBLIC_LIBRARY_SEED.map((b) => ({
        id: b.id,
        ownerId: LIBRARY_OWNER,
        name: b.name,
        data: b.data,
        isPublic: true,
        authorName: b.authorName,
        description: b.description,
      })),
    )
    .onConflictDoNothing({ target: boards.id })
}

// --- Identity -------------------------------------------------------------
// Identity is authenticated at the edge by Vercel Passport and resolved into a
// Better Auth user in lib/auth/current-user.ts. Every board is scoped by this
// ownerId. In local dev a mock identity is used (see lib/auth/passport.ts).
async function getOwnerId(): Promise<string> {
  return requireUserId()
}

const EMPTY_DATA: BoardData = {
  elements: [],
  connections: [],
  camera: { x: 0, y: 0, zoom: 1 },
}

function uid() {
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
  // Whether the current viewer owns this board (set by getBoard). Library boards
  // are readable but not editable, so the editor opens them read-only.
  canEdit?: boolean
}

// A public-library board with its author + social (stars) metadata.
export interface PublicBoardSummary extends BoardSummary {
  author: string
  starCount: number
  isStarred: boolean
}

function toSummary(row: BoardRow): BoardSummary {
  return {
    id: row.id,
    name: row.name,
    data: row.data,
    isPublic: row.isPublic,
    authorName: row.authorName,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listMyBoards(): Promise<BoardSummary[]> {
  const ownerId = await getOwnerId()
  const rows = await db
    .select()
    .from(boards)
    .where(eq(boards.ownerId, ownerId))
    .orderBy(desc(boards.updatedAt))
  return rows.map(toSummary)
}

// --- Public library reads (with author + stars) ---------------------------

// Assemble PublicBoardSummary objects from board+author rows, attaching star
// counts and whether the current viewer has starred each board.
async function withStarMeta(
  rows: { board: BoardRow; authorName: string | null }[],
  viewerId: string | null,
): Promise<PublicBoardSummary[]> {
  const ids = rows.map((r) => r.board.id)
  if (ids.length === 0) return []

  const counts = await db
    .select({ boardId: boardStars.boardId, count: sql<number>`count(*)::int` })
    .from(boardStars)
    .where(inArray(boardStars.boardId, ids))
    .groupBy(boardStars.boardId)
  const countByBoard = new Map(counts.map((c) => [c.boardId, c.count]))

  let mine = new Set<string>()
  if (viewerId) {
    const starred = await db
      .select({ boardId: boardStars.boardId })
      .from(boardStars)
      .where(and(eq(boardStars.userId, viewerId), inArray(boardStars.boardId, ids)))
    mine = new Set(starred.map((s) => s.boardId))
  }

  return rows.map(({ board, authorName }) => ({
    ...toSummary(board),
    author: authorName || board.authorName || "Unknown",
    starCount: countByBoard.get(board.id) ?? 0,
    isStarred: mine.has(board.id),
  }))
}

export async function listPublicBoards(): Promise<PublicBoardSummary[]> {
  await ensurePublicLibrarySeeded()
  const viewer = await getCurrentUser()
  const rows = await db
    .select({ board: boards, authorName: user.name })
    .from(boards)
    .leftJoin(user, eq(boards.ownerId, user.id))
    .where(eq(boards.isPublic, true))
    .orderBy(desc(boards.updatedAt))
  return withStarMeta(rows, viewer?.id ?? null)
}

// Search the public library by board name, description, or author.
export async function searchPublicBoards(query: string): Promise<PublicBoardSummary[]> {
  await ensurePublicLibrarySeeded()
  const q = query.trim()
  if (!q) return listPublicBoards()

  const viewer = await getCurrentUser()
  const term = `%${q}%`
  const rows = await db
    .select({ board: boards, authorName: user.name })
    .from(boards)
    .leftJoin(user, eq(boards.ownerId, user.id))
    .where(
      and(
        eq(boards.isPublic, true),
        or(
          ilike(boards.name, term),
          ilike(boards.description, term),
          ilike(boards.authorName, term),
          ilike(user.name, term),
        ),
      ),
    )
    .orderBy(desc(boards.updatedAt))
  return withStarMeta(rows, viewer?.id ?? null)
}

// Boards the current user has starred (their favorites dashboard).
export async function listFavoriteBoards(): Promise<PublicBoardSummary[]> {
  const viewer = await getCurrentUser()
  if (!viewer) return []
  const rows = await db
    .select({ board: boards, authorName: user.name })
    .from(boardStars)
    .innerJoin(boards, eq(boardStars.boardId, boards.id))
    .leftJoin(user, eq(boards.ownerId, user.id))
    .where(eq(boardStars.userId, viewer.id))
    .orderBy(desc(boardStars.createdAt))
  return withStarMeta(rows, viewer.id)
}

export async function getBoard(id: string): Promise<BoardSummary | null> {
  const ownerId = await getOwnerId()
  const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1)
  if (!row) return null
  // A board is readable if you own it or it is public.
  if (row.ownerId !== ownerId && !row.isPublic) return null
  return { ...toSummary(row), canEdit: row.ownerId === ownerId }
}

export async function createBoard(name?: string): Promise<string> {
  const ownerId = await getOwnerId()
  const id = uid()
  await db.insert(boards).values({
    id,
    ownerId,
    name: name?.trim() || "Untitled board",
    data: EMPTY_DATA,
  })
  revalidatePath("/")
  return id
}

// Create a board pre-populated with data (e.g. from a workflow template).
export async function createBoardFromData(name: string, data: BoardData): Promise<string> {
  const ownerId = await getOwnerId()
  const id = uid()
  await db.insert(boards).values({
    id,
    ownerId,
    name: name?.trim() || "Untitled board",
    data,
  })
  revalidatePath("/")
  return id
}

// Persist canvas changes. Scoped by ownerId so one user can't overwrite
// another's board (and so public library boards stay read-only to viewers).
export async function saveBoard(
  id: string,
  patch: { name?: string; data?: BoardData },
): Promise<void> {
  const ownerId = await getOwnerId()
  const set: Partial<BoardRow> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.data !== undefined) set.data = patch.data
  await db
    .update(boards)
    .set(set)
    .where(and(eq(boards.id, id), eq(boards.ownerId, ownerId)))
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const ownerId = await getOwnerId()
  // Intentionally do NOT touch updatedAt: renaming is metadata, not a content
  // edit, so it must not change the "Edited …" time or reorder the boards grid
  // (which is sorted by updatedAt desc).
  await db
    .update(boards)
    .set({ name: name.trim() || "Untitled board" })
    .where(and(eq(boards.id, id), eq(boards.ownerId, ownerId)))
  revalidatePath("/")
}

// Publish / unpublish a board to the public library. Owner-scoped. When
// publishing we stamp the author name from the owner's profile so library cards
// have a display name even before the user->board join resolves.
export async function setBoardVisibility(
  id: string,
  isPublic: boolean,
  description?: string,
): Promise<void> {
  const owner = await requireUserId()
  const viewer = await getCurrentUser()
  const set: Partial<BoardRow> = { isPublic }
  if (isPublic) set.authorName = viewer?.name ?? viewer?.email ?? null
  if (description !== undefined) set.description = description.trim() || null
  await db
    .update(boards)
    .set(set)
    .where(and(eq(boards.id, id), eq(boards.ownerId, owner)))
  revalidatePath("/")
  revalidatePath(`/board/${id}`)
}

export async function deleteBoard(id: string): Promise<void> {
  const ownerId = await getOwnerId()
  await db.delete(boards).where(and(eq(boards.id, id), eq(boards.ownerId, ownerId)))
  revalidatePath("/")
}

// Clone any readable board (typically a public library board) into the current
// user's own boards, then return the new id so the caller can open it.
export async function cloneBoard(id: string): Promise<string | null> {
  const ownerId = await getOwnerId()
  const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1)
  if (!row) return null
  if (row.ownerId !== ownerId && !row.isPublic) return null
  const newId = uid()
  await db.insert(boards).values({
    id: newId,
    ownerId,
    name: `${row.name} (copy)`,
    data: row.data,
    isPublic: false,
  })
  revalidatePath("/")
  return newId
}

// --- Stars / favorites ----------------------------------------------------

export async function starBoard(id: string): Promise<void> {
  const userId = await requireUserId()
  // Only allow starring boards the user can actually see (public or their own).
  const [row] = await db
    .select({ id: boards.id, isPublic: boards.isPublic, ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, id))
    .limit(1)
  if (!row || (!row.isPublic && row.ownerId !== userId)) return
  await db
    .insert(boardStars)
    .values({ boardId: id, userId })
    .onConflictDoNothing()
  revalidatePath("/")
}

export async function unstarBoard(id: string): Promise<void> {
  const userId = await requireUserId()
  await db
    .delete(boardStars)
    .where(and(eq(boardStars.boardId, id), eq(boardStars.userId, userId)))
  revalidatePath("/")
}
