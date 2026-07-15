// Curated catalog of AI Gateway models for the "one line of code" showcase
// block. Model ids use the Gateway's `creator/model-name` string form — the
// exact value you pass to the AI SDK's `model` field. See:
// https://vercel.com/docs/ai-gateway/models-and-providers

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
  { id: "openai/gpt-5.5", label: "GPT-5.5", provider: "OpenAI", accent: "#10a37f" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic", accent: "#d97757" },
  { id: "xai/grok-4.3", label: "Grok 4.3", provider: "xAI", accent: "#8a8a8a" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", accent: "#4285f4" },
  { id: "meta/llama-4-scout", label: "Llama 4 Scout", provider: "Meta", accent: "#1d78ff" },
  { id: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "DeepSeek", accent: "#4d6bfe" },
  { id: "alibaba/qwen-3-32b", label: "Qwen3 32B", provider: "Alibaba", accent: "#615ced" },
  { id: "mistral/mistral-large", label: "Mistral Large", provider: "Mistral", accent: "#fa5211" },
]

export const DEFAULT_GATEWAY_MODEL = GATEWAY_MODELS[0].id

export function gatewayModelById(id: string | undefined): GatewayModel | undefined {
  return GATEWAY_MODELS.find((m) => m.id === id)
}
