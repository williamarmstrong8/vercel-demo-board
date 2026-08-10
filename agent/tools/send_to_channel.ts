import { defineTool } from "eve/tools"
import { z } from "zod"
import { getConfig, isChannelEnabled } from "../lib/session-config"

/**
 * Demo tool: deliver a message through one of the agent's enabled channels
 * (Slack, Discord, Telegram, Twilio). Channels are mocked in this playground, so
 * this returns a delivery preview instead of actually posting. Only channels the
 * block has added are accepted.
 */
export default defineTool({
  description:
    "Send a message through an enabled channel (preview: does not actually post). " +
    "channel must be one of the agent's enabled channels.",
  inputSchema: z.object({
    channel: z.string().describe("The channel id, e.g. slack, discord, telegram, twilio."),
    message: z.string(),
  }),
  async execute({ channel, message }) {
    const enabled = getConfig().channels
    if (enabled.length === 0) {
      return {
        disabled: true,
        message: "No channels are added to this agent yet. Add one from the block's edit menu.",
      }
    }
    if (!isChannelEnabled(channel)) {
      return {
        disabled: true,
        message: `The "${channel}" channel is not enabled. Enabled channels: ${enabled.join(", ")}.`,
      }
    }
    return {
      channel,
      message,
      delivered: false,
      preview: true,
      note: `Preview only — this would post to ${channel}. No real message was sent.`,
    }
  },
})
