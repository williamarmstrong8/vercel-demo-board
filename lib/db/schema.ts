import {
  pgTable,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core"
import type { CanvasElement, Connection, Camera } from "@/lib/whiteboard/types"
import { user } from "./auth-schema"

export { user, session, account, verification } from "./auth-schema"

// The serialized canvas payload stored in the `data` JSONB column. This mirrors
// the shape the client store works with for a single board.
export interface BoardData {
  elements: CanvasElement[]
  connections: Connection[]
  camera: Camera
}

// A whiteboard board. `ownerId` holds the owning user's id (Better Auth
// `user.id` from the visitor's email + password session). The curated public
// library seed uses a synthetic owner id ("vercel-ecosystem") that has no user
// row, which is why there is no hard FK constraint on `ownerId`.
export const boards = pgTable(
  "boards",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().default("anonymous"),
    name: text("name").notNull().default("Untitled board"),
    data: jsonb("data").$type<BoardData>().notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    authorName: text("author_name"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("boards_owner_id_idx").on(table.ownerId),
    index("boards_is_public_idx").on(table.isPublic),
  ],
)

// A "star" (favorite) placed by a user on a public board. Composite PK enforces
// one star per user per board; both sides cascade so stars vanish with the board
// or the user.
export const boardStars = pgTable(
  "board_stars",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index("board_stars_user_id_idx").on(table.userId),
  ],
)

export type BoardRow = typeof boards.$inferSelect
export type NewBoardRow = typeof boards.$inferInsert
export type BoardStarRow = typeof boardStars.$inferSelect
