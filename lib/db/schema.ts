import { pgTable, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core"
import type { CanvasElement, Connection, Camera } from "@/lib/whiteboard/types"

// The serialized canvas payload stored in the `data` JSONB column. This mirrors
// the shape the client store works with for a single board.
export interface BoardData {
  elements: CanvasElement[]
  connections: Connection[]
  camera: Camera
}

// A whiteboard board. `ownerId` defaults to "anonymous" for now; once identity
// (Vercel Passport / Okta) is wired in, it becomes the Passport `external_sub`
// and every query gets scoped by it — no schema change required.
export const boards = pgTable("boards", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().default("anonymous"),
  name: text("name").notNull().default("Untitled board"),
  data: jsonb("data").$type<BoardData>().notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  authorName: text("author_name"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type BoardRow = typeof boards.$inferSelect
export type NewBoardRow = typeof boards.$inferInsert
