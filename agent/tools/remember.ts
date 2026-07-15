import { defineTool } from "eve/tools"
import { defineState } from "eve/context"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/**
 * Real tool: simple key/value memory. Backed by durable per-session state so
 * values persist across turns (a module-level Map would be lost between the
 * isolated workflow steps eve runs tools in).
 */
const memoryState = defineState<Record<string, string>>("eve-canvas.memory", () => ({}))

export default defineTool({
  description: "Store or recall a value by key. Omit value to recall it.",
  inputSchema: z.object({ key: z.string(), value: z.string().optional() }),
  async execute({ key, value }) {
    if (!isToolEnabled("remember")) return disabledResult("remember")
    if (value !== undefined) {
      memoryState.update((bag) => ({ ...bag, [key]: value }))
    }
    return { key, value: memoryState.get()[key] ?? null, stored: value !== undefined }
  },
})
