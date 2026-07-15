"use server"

import { db } from "@/lib/db"
import { boards, type BoardData, type BoardRow } from "@/lib/db/schema"
import { PUBLIC_LIBRARY_SEED } from "@/lib/whiteboard/public-library-seed"
import { and, desc, eq } from "drizzle-orm"
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
// Auth is intentionally deferred. Every board is scoped by ownerId so that when
// Vercel Passport / Okta lands, this is the ONLY function that changes: it will
// read the Passport `external_sub` claim from the request headers instead of
// returning the shared placeholder. No query or schema change is needed.
async function getOwnerId(): Promise<string> {
  return "anonymous"
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

export async function listPublicBoards(): Promise<BoardSummary[]> {
  await ensurePublicLibrarySeeded()
  const rows = await db
    .select()
    .from(boards)
    .where(eq(boards.isPublic, true))
    .orderBy(desc(boards.updatedAt))
  return rows.map(toSummary)
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
