import { defineTool } from "eve/tools"
import { z } from "zod"
import { disabledResult, isToolEnabled } from "../lib/session-config"

/** Real tool: fetch a URL and return a trimmed text snapshot. */
export default defineTool({
  description: "Fetch a URL and return its text content (truncated).",
  inputSchema: z.object({ url: z.string().url() }),
  async execute({ url }) {
    if (!isToolEnabled("fetch_url")) return disabledResult("fetch_url")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: "follow" })
      const body = await res.text()
      return { url, status: res.status, body: body.slice(0, 4000) }
    } catch (err) {
      return { url, error: err instanceof Error ? err.message : "Request failed." }
    } finally {
      clearTimeout(timeout)
    }
  },
})
