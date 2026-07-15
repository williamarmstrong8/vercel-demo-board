import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/** Real tool: exact arithmetic. LLMs are unreliable at precise math. */
export default defineTool({
  description: "Evaluate a basic arithmetic expression, e.g. \"3 * (4 + 5)\".",
  inputSchema: z.object({ expression: z.string() }),
  async execute({ expression }) {
    if (!isToolEnabled("calculate")) return disabledResult("calculate")
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      return { error: "Invalid expression. Only numbers and + - * / ( ) are allowed." }
    }
    try {
      const result = Function(`"use strict"; return (${expression})`)()
      return { expression, result }
    } catch {
      return { error: "Could not evaluate that expression." }
    }
  },
})
