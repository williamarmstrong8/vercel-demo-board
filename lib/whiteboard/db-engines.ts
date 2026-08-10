// Curated catalog for the Database showcase block. Picking a pill swaps the
// illustrative query + result set, echoing the AI Gateway block's "swap one
// line" pitch — here it's "swap the engine, keep the same query shape."

import type { DbEngine } from "./types"

export interface DbEngineInfo {
  id: DbEngine
  label: string
  // Provider-ish accent dot, used sparingly as a data cue (mirrors GatewayModel.accent).
  accent: string
  // Single-line illustrative query, tokenized by DatabaseView's mono renderer.
  query: string
  columns: string[]
  rows: string[][]
}

export const DB_ENGINES: DbEngineInfo[] = [
  {
    id: "postgres",
    label: "Postgres",
    accent: "#336791",
    query: "SELECT id, name, plan FROM accounts LIMIT 3;",
    columns: ["id", "name", "plan"],
    rows: [
      ["1", "acme-corp", "pro"],
      ["2", "globex", "enterprise"],
      ["3", "initech", "free"],
    ],
  },
  {
    id: "mysql",
    label: "MySQL",
    accent: "#00758f",
    query: "SELECT id, name, plan FROM accounts LIMIT 3;",
    columns: ["id", "name", "plan"],
    rows: [
      ["1", "acme-corp", "pro"],
      ["2", "globex", "enterprise"],
      ["3", "initech", "free"],
    ],
  },
  {
    id: "redis",
    label: "Redis",
    accent: "#dc382d",
    query: 'HGETALL session:9f2a "user_id"',
    columns: ["field", "value"],
    rows: [
      ["user_id", "1"],
      ["plan", "pro"],
      ["ttl", "3600"],
    ],
  },
  {
    id: "mongodb",
    label: "MongoDB",
    accent: "#00ed64",
    query: 'db.accounts.find({}).limit(3)',
    columns: ["_id", "name", "plan"],
    rows: [
      ["1", "acme-corp", "pro"],
      ["2", "globex", "enterprise"],
      ["3", "initech", "free"],
    ],
  },
]

export const DEFAULT_DB_ENGINE: DbEngine = DB_ENGINES[0].id

export function dbEngineById(id: DbEngine | undefined): DbEngineInfo {
  return DB_ENGINES.find((e) => e.id === id) ?? DB_ENGINES[0]
}
