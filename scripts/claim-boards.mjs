// One-off: hand the pre-ownership boards to a real account.
//
// Boards created before ownership existed carry `owner_id = 'anonymous'`, which
// matches no Vercel identity, so nobody can see or edit them. This reassigns
// them (as private boards) to whoever you name.
//
// There is no users table to look an account up in — identity lives in the
// session JWT — so the way to find your id is to sign in and create one board,
// then run this with no arguments to see which ids the table now knows about.
//
//   pnpm db:claim                 list the owners currently in the table
//   pnpm db:claim <owner-id>      give every 'anonymous' board to that owner

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Pool } from "pg"

const LEGACY_OWNER = "anonymous"

function loadEnvLocal() {
  let contents
  try {
    contents = readFileSync(join(process.cwd(), ".env.local"), "utf8")
  } catch {
    return
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.trim().replace(/^["'](.*)["']$/, "$1")
  }
}

loadEnvLocal()

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run `vercel env pull` first.")
  process.exit(1)
}

const targetOwner = process.argv[2]
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  const { rows: owners } = await pool.query(`
    SELECT owner_id, author_name, count(*)::int AS boards
    FROM boards
    GROUP BY owner_id, author_name
    ORDER BY boards DESC
  `)

  if (!targetOwner) {
    console.log("Owners currently in the boards table:\n")
    console.table(owners)

    const legacy = owners.find((row) => row.owner_id === LEGACY_OWNER)
    if (!legacy) {
      console.log("No legacy boards left to claim.")
    } else {
      console.log(
        `${legacy.boards} board(s) still owned by "${LEGACY_OWNER}".\n` +
          "Sign in and create one board, then re-run this to see your own id in the\n" +
          "list above, and claim them with: pnpm db:claim <your-owner-id>",
      )
    }
    process.exit(0)
  }

  if (targetOwner === LEGACY_OWNER) {
    console.error(`"${LEGACY_OWNER}" is the placeholder these boards already have.`)
    process.exit(1)
  }

  // Reuse the display name already recorded on one of the target's own boards,
  // so claimed boards are credited correctly if they're later made public.
  const authorName = owners.find((row) => row.owner_id === targetOwner)?.author_name ?? null

  const result = await pool.query(
    `UPDATE boards
     SET owner_id = $1, author_name = COALESCE(author_name, $2), is_public = false
     WHERE owner_id = $3`,
    [targetOwner, authorName, LEGACY_OWNER],
  )

  console.log(`Moved ${result.rowCount} board(s) from "${LEGACY_OWNER}" to "${targetOwner}".`)
} finally {
  await pool.end()
}
