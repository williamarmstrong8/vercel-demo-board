import { pgTable, text, jsonb, boolean, timestamp, index, primaryKey } from "drizzle-orm/pg-core"
import type { CanvasElement, Camera } from "@/lib/whiteboard/types"

// The serialized canvas payload stored in the `data` JSONB column. This mirrors
// the shape the client store works with for a single board.
export interface BoardData {
  elements: CanvasElement[]
  camera: Camera
}

// A whiteboard board. `ownerId` is the Vercel identity (`sub` claim) of whoever
// created it; boards start private and only their owner can read or write them.
// Flipping `isPublic` publishes a board read-only to everyone — it stays
// editable by its owner alone. `authorName` is the owner's display name at
// creation time, denormalized so the shared grid can credit a board without a
// users table (identity lives in the session JWT, not in Postgres).
//
// Rows predating ownership carry the legacy `owner_id = 'anonymous'` default,
// which matches no real identity and so is visible to nobody.
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
    index("boards_owner_updated_idx").on(table.ownerId, table.updatedAt.desc()),
    index("boards_public_updated_idx").on(table.isPublic, table.updatedAt.desc()),
  ],
)

// A user can star each public board once. Keeping this as a join table means
// the count is derived from real votes rather than a mutable counter that can
// drift on retries or concurrent requests.
//
// `userId` deliberately has no foreign key: identities live in the Vercel
// session JWT (`sub`), not in a Postgres table, so there is nothing to point at.
export const boardStars = pgTable(
  "board_stars",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index("board_stars_user_idx").on(table.userId),
  ],
)

// A person, keyed by their Vercel identity (`sub`). This table is deliberately a
// cache of the session JWT rather than a source of truth: nothing here is
// authoritative — access control still resolves the viewer from the verified
// token (see lib/auth.ts). It exists so the app can show a *directory* of people
// and render someone's profile without them being the one signed in, which the
// JWT alone can't do (it only describes the current viewer).
//
// Rows are upserted on sign-in, and backfilled from `boards.owner_id` /
// `author_name` for accounts that authored boards before this table existed —
// those rows carry only a display name until their owner next signs in and fills
// in username/picture. `displayName` is the same computed label auth.ts derives,
// stored so a profile card can credit someone with one lookup.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username"),
    name: text("name"),
    displayName: text("display_name").notNull().default("Vercel user"),
    email: text("email"),
    picture: text("picture"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_username_idx").on(table.username)],
)

export type BoardRow = typeof boards.$inferSelect
export type NewBoardRow = typeof boards.$inferInsert
export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
