import type { AgentFile } from "@/lib/whiteboard/types"
import { channelsForFiles } from "@/lib/whiteboard/eve-templates"

/**
 * Client-side derivation of a block's "operator configuration" — the set of
 * capabilities currently added to the agent, plus its instructions.md. This is
 * sent to the real eve agent each turn so it knows which tools it may call and
 * which persona to adopt. The server-side counterpart lives in
 * `agent/lib/session-config.ts`.
 */

export interface OperatorConfig {
  instructions: string
  tools: string[]
  skills: string[]
  channels: string[]
  subagents: string[]
  sandbox: boolean
}

/** Marker the agent's `apply-config` hook looks for at the top of the message. */
export const CONFIG_MARKER = "eve-operator-config:"

const basename = (path: string) => path.split("/").pop() ?? path

/** tools/get_weather.ts -> "get_weather" */
function toolSlug(file: string): string {
  return basename(file).replace(/\.ts$/, "")
}

/** skills/research/SKILL.md -> "research" ; subagents/writer/agent.ts -> "writer" */
function segmentId(file: string): string | null {
  const parts = file.split("/")
  return parts.length >= 2 ? parts[1] : null
}

/** Derive the operator configuration from a file-tree block's files. */
export function configFromFiles(files: AgentFile[] | undefined): OperatorConfig {
  const list = files ?? []
  const instructions = list.find((f) => basename(f.name) === "instructions.md")?.code ?? ""

  const tools = list.filter((f) => f.name.startsWith("tools/")).map((f) => toolSlug(f.name))

  const skills = list
    .filter((f) => f.name.startsWith("skills/") && basename(f.name) === "SKILL.md")
    .map((f) => segmentId(f.name))
    .filter((x): x is string => !!x)

  const channels = channelsForFiles(list).map((c) => c.id)

  const subagents = list
    .filter((f) => f.name.startsWith("subagents/") && basename(f.name) === "agent.ts")
    .map((f) => segmentId(f.name))
    .filter((x): x is string => !!x)

  const sandbox = list.some((f) => f.name.startsWith("sandbox/"))

  return { instructions, tools, skills, channels, subagents, sandbox }
}

/**
 * Build the message text sent to the agent: a single machine-readable marker
 * line carrying the operator config, followed by the user's actual message.
 * The agent's instructions tell it to consume the marker line silently.
 */
export function buildAgentMessage(userText: string, config: OperatorConfig): string {
  return `${CONFIG_MARKER} ${JSON.stringify(config)}\n\n${userText}`
}
