/**
 * Per-session operator configuration for the eve canvas agent.
 *
 * One deployed agent serves many differently-configured blocks, so each turn
 * the browser sends the block's configuration. `apply-config` hook parses it and
 * stores it here, keyed by session id, so tools can enforce which capabilities
 * the calling block has enabled.
 */

import { defineState } from "eve/context"

export interface OperatorConfig {
  /** The block's own instructions.md contents (the operator's system prompt). */
  instructions: string
  /** Enabled tool names, matching the tool file slugs (e.g. "calculate"). */
  tools: string[]
  /** Enabled skill ids. */
  skills: string[]
  /** Enabled channel ids (e.g. "slack"). */
  channels: string[]
  /** Enabled subagent ids (e.g. "researcher"). */
  subagents: string[]
  /** Whether a sandbox is attached to the block. */
  sandbox: boolean
}

const EMPTY: OperatorConfig = {
  instructions: "",
  tools: [],
  skills: [],
  channels: [],
  subagents: [],
  sandbox: false,
}

/**
 * Durable per-session slot holding the operator config. A module-level Map does
 * NOT work here: eve runs hooks and tools in isolated durable workflow steps
 * that don't share in-process memory, so the hook's write would be invisible to
 * the tool. `defineState` persists across those step boundaries.
 */
const configState = defineState<OperatorConfig>("eve-canvas.operator-config", () => EMPTY)

/** The machine-readable marker the browser embeds so hooks can recover config. */
export const CONFIG_MARKER = "eve-operator-config:"

export function normalizeConfig(raw: unknown): OperatorConfig {
  const obj = (raw ?? {}) as Record<string, unknown>
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  return {
    instructions: typeof obj.instructions === "string" ? obj.instructions : "",
    tools: arr(obj.tools),
    skills: arr(obj.skills),
    channels: arr(obj.channels),
    subagents: arr(obj.subagents),
    sandbox: obj.sandbox === true,
  }
}

/** Try to extract an OperatorConfig from an inbound message's flattened text. */
export function parseConfigFromText(text: string | undefined): OperatorConfig | null {
  if (!text) return null
  const idx = text.indexOf(CONFIG_MARKER)
  if (idx === -1) return null
  const after = text.slice(idx + CONFIG_MARKER.length).trimStart()
  // The marker is followed by a single-line JSON object.
  const end = after.indexOf("\n")
  const jsonText = (end === -1 ? after : after.slice(0, end)).trim()
  try {
    return normalizeConfig(JSON.parse(jsonText))
  } catch {
    return null
  }
}

/** Persist the operator config for the current session. Call from a hook. */
export function setConfig(config: OperatorConfig) {
  configState.update(() => config)
}

/** Read the current session's operator config. Call from a tool or hook. */
export function getConfig(): OperatorConfig {
  return configState.get()
}

export function isToolEnabled(tool: string): boolean {
  return getConfig().tools.includes(tool)
}

export function isChannelEnabled(channel: string): boolean {
  return getConfig().channels.includes(channel)
}

export function isSubagentEnabled(subagent: string): boolean {
  return getConfig().subagents.includes(subagent)
}

/**
 * Standard payload a gated tool returns when the calling block has not enabled
 * it. The model relays this to the user instead of fabricating a result.
 */
export function disabledResult(tool: string) {
  return {
    disabled: true,
    tool,
    message: `The "${tool}" capability is not added to this agent yet. Ask the operator to add it from the block's edit menu, then try again.`,
  }
}
