import { defineAgent } from "eve"

/**
 * The real, running eve agent behind the whiteboard's "eve agent" block.
 *
 * One deployed agent backs every agent block on the canvas. Each block has its
 * own instructions and its own set of enabled capabilities, so the per-block
 * configuration is delivered per turn via `clientContext` (see
 * `agent/hooks/apply-config.ts` and `agent/lib/session-config.ts`). The tools
 * below are always registered but refuse to run unless the calling block has
 * enabled them, which is what makes building the agent visibly change its
 * behavior.
 */
export default defineAgent({
  // Routed through the Vercel AI Gateway (zero-config on Vercel via OIDC).
  // Haiku 4.5 is used instead of Sonnet: same provider/family (so tool-calling
  // and output style stay consistent) but far faster token generation, which is
  // the real bottleneck when building sites (the sandbox itself is instant).
  model: "anthropic/claude-haiku-4.5",
})
