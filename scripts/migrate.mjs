// Applies every .sql file in lib/db/migrations, in filename order, exactly once.
//
// The project has no migration tooling of its own and the schema in
// lib/db/schema.ts is hand-kept, so this is the one place that changes the
// shape of the database. Each file runs in a transaction alongside the insert
// that records it, so a failed migration leaves nothing behind.
//
// Usage: pnpm db:migrate

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { Pool } from "pg"

const MIGRATIONS_DIR = join(process.cwd(), "lib/db/migrations")

// `vercel env pull` writes .env.local; plain `node` doesn't read it.
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const { rows } = await pool.query("SELECT name FROM _migrations")
  const applied = new Set(rows.map((row) => row.name))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} (already applied)`)
      continue
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file])
      await client.query("COMMIT")
      console.log(`✓ ${file}`)
      ran += 1
    } catch (error) {
      await client.query("ROLLBACK")
      console.error(`✗ ${file}`)
      throw error
    } finally {
      client.release()
    }
  }

  console.log(ran === 0 ? "Database already up to date." : `Applied ${ran} migration(s).`)
} finally {
  await pool.end()
}
