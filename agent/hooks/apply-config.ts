import { defineHook } from "eve/hooks"
import { parseConfigFromText, setConfig } from "../lib/session-config"

/**
 * Recovers the per-block operator configuration from each inbound message and
 * stores it for the session, so gated tools can enforce which capabilities the
 * calling block has enabled.
 *
 * The browser embeds the config as a single marker line at the top of the
 * message text (see `lib/whiteboard/agent-chat.ts`). Instructions tell the
 * model to ignore that line and follow the operator instructions it carries.
 */
export default defineHook({
  events: {
    "message.received"(event) {
      const config = parseConfigFromText(event.data.message)
      if (config) setConfig(config)
    },
  },
})
