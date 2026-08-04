"use server"

import { db } from "@/lib/db"
import { boards, type BoardData, type BoardRow } from "@/lib/db/schema"
import { writeBoardData } from "@/lib/db/board-writes"
import { PUBLIC_LIBRARY_SEED } from "@/lib/whiteboard/public-library-seed"
import { eq, desc } from "drizzle-orm"
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

// Every board is a shared, sign-in-free resource — this is the whole pool,
// not scoped to any particular viewer.
export async function listBoards(): Promise<BoardSummary[]> {
  const rows = await db.select().from(boards).orderBy(desc(boards.updatedAt))
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
  const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1)
  if (!row) return null
  return toSummary(row)
}

export async function createBoard(name?: string): Promise<string> {
  const id = uid()
  await db.insert(boards).values({
    id,
    name: name?.trim() || "Untitled board",
    data: EMPTY_DATA,
  })
  revalidatePath("/")
  return id
}

// Create a board pre-populated with data (e.g. from a workflow template).
export async function createBoardFromData(name: string, data: BoardData): Promise<string> {
  const id = uid()
  await db.insert(boards).values({
    id,
    name: name?.trim() || "Untitled board",
    data,
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
  await writeBoardData(id, patch)
}

export async function renameBoard(id: string, name: string): Promise<void> {
  // Intentionally do NOT touch updatedAt: renaming is metadata, not a content
  // edit, so it must not change the "Edited …" time or reorder the boards grid
  // (which is sorted by updatedAt desc).
  await db
    .update(boards)
    .set({ name: name.trim() || "Untitled board" })
    .where(eq(boards.id, id))
  revalidatePath("/")
}

export async function deleteBoard(id: string): Promise<void> {
  await db.delete(boards).where(eq(boards.id, id))
  revalidatePath("/")
}
