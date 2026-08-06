"use server"

// Server Action surface for the browser UI. The implementation lives in
// lib/boards/service.ts so non-action callers (the /api/boards/flush and
// /api/ai/build-board routes) share the same write path — and, more
// importantly, the same ownership checks. Nothing here takes a user id from the
// client; the service resolves the viewer from the session cookie itself.
import * as boards from "@/lib/boards/service"
import type { BoardData } from "@/lib/db/schema"

export type { BoardSummary } from "@/lib/boards/service"

export async function listMyBoards() {
  return boards.listMyBoards()
}

export async function listSharedBoards() {
  return boards.listSharedBoards()
}

export async function getBoard(id: string) {
  return boards.getBoard(id)
}

export async function createBoard(name?: string): Promise<string> {
  return boards.createBoard(name)
}

export async function createBoardFromData(name: string, data: BoardData): Promise<string> {
  return boards.createBoardFromData(name, data)
}

export async function saveBoard(
  id: string,
  patch: { name?: string; data?: BoardData },
): Promise<void> {
  return boards.saveBoard(id, patch)
}

export async function renameBoard(id: string, name: string): Promise<void> {
  return boards.renameBoard(id, name)
}

export async function setBoardVisibility(id: string, isPublic: boolean): Promise<void> {
  return boards.setBoardVisibility(id, isPublic)
}

export async function deleteBoard(id: string): Promise<void> {
  return boards.deleteBoard(id)
}
