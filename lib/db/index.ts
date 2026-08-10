import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

// Single shared pg Pool + Drizzle client. Reused across hot reloads in dev so we
// don't exhaust connections.
const globalForDb = globalThis as unknown as { __pool?: Pool }

const isNewPool = !globalForDb.__pool
export const pool = globalForDb.__pool ?? new Pool({ connectionString: process.env.DATABASE_URL })

// Neon's pooler closes idle connections; without this listener that surfaces
// as an unhandled 'error' event on the pool and crashes the process. Guarded
// by isNewPool since this module re-runs on every dev hot reload but reuses
// the same pool instance — re-attaching each time would stack listeners.
if (isNewPool) {
  pool.on("error", (err) => {
    console.error("Idle Postgres client error", err)
  })
}

if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool

export const db = drizzle(pool, { schema })
