// Curated catalog of AI Gateway models for the "one line of code" showcase
// block. Model ids use the Gateway's `creator/model-name` string form — the
// exact value you pass to the AI SDK's `model` field. See:
// https://vercel.com/docs/ai-gateway/models-and-providers
//
// The lineup mirrors the top models by token volume on the live Gateway
// leaderboard (sorted by popularity): https://vercel.com/ai-gateway/models?sortField=popularity

export interface GatewayModel {
  // The full model string passed to the AI SDK, e.g. "openai/gpt-5.5".
  id: string
  // Human label shown on the pill.
  label: string
  // Provider/creator display name.
  provider: string
  // Brand-ish accent dot color for the provider (used sparingly as a data cue).
  accent: string
}

export const GATEWAY_MODELS: GatewayModel[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", accent: "#4d6bfe" },
  { id: "deepseek/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash 0731", provider: "DeepSeek", accent: "#4d6bfe" },
  { id: "stepfun/step-3.7-flash", label: "Step 3.7 Flash", provider: "StepFun", accent: "#7c5cff" },
  { id: "openai/gpt-5-nano", label: "GPT-5 nano", provider: "OpenAI", accent: "#10a37f" },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "Anthropic", accent: "#d97757" },
  { id: "anthropic/claude-opus-5", label: "Claude Opus 5", provider: "Anthropic", accent: "#d97757" },
  { id: "openai/gpt-5.6-luna", label: "GPT 5.6 Luna", provider: "OpenAI", accent: "#10a37f" },
  { id: "zai/glm-5.2", label: "GLM 5.2", provider: "Z.AI", accent: "#00b8a9" },
  { id: "moonshotai/kimi-k3", label: "Kimi K3", provider: "Moonshot AI", accent: "#7047eb" },
]

export const DEFAULT_GATEWAY_MODEL = GATEWAY_MODELS[0].id

export function gatewayModelById(id: string | undefined): GatewayModel | undefined {
  return GATEWAY_MODELS.find((m) => m.id === id)
}
