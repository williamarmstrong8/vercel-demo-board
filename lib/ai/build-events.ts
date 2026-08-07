// Wire format for the board-builder stream (`POST /api/ai/build-board`).
//
// One JSON object per line (NDJSON). Streaming rather than a single JSON
// response serves two purposes: the UI can narrate what the model is doing
// while it does it, and the connection never goes quiet long enough for a
// proxy to drop it mid-build.

export interface BuiltBoard {
  id: string
  name: string
  blocks: number
  url: string
}

export type BuildStepStatus = "active" | "done" | "error"

export type BuildEvent =
  /** A unit of work starting, finishing, or failing. Re-sent by id to update. */
  | { type: "step"; id: string; label: string; status: BuildStepStatus }
  /** A chunk of the assistant's reply. */
  | { type: "text"; delta: string }
  /** The user needs to authorize a connector before the build can read sources. */
  | { type: "needs-auth"; provider: "notion"; authorizeUrl?: string }
  | { type: "done"; reply: string; board: BuiltBoard | null }
  | { type: "error"; message: string }
  /** Keepalive; carries no meaning. */
  | { type: "ping" }

export const BUILD_STREAM_CONTENT_TYPE = "application/x-ndjson"
