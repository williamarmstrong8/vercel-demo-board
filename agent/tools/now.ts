import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/** Real tool: the current date and time (the model has no live clock). */
export default defineTool({
  description: "Get the current date and time (ISO 8601, UTC).",
  inputSchema: z.object({}),
  async execute() {
    if (!isToolEnabled("now")) return disabledResult("now")
    return { now: new Date().toISOString() }
  },
})
