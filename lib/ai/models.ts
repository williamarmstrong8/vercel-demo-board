// Model shortlist for the board builder's picker.
//
// The AI Gateway catalog is hundreds of models deep — most of them variants,
// dated snapshots, and niche open-weight builds that nobody wants to scroll
// past. This narrows the live catalog down to the handful people actually
// reach for: the top providers, and for each one the newest model in three
// well-known tiers (flagship / mid / small).

export interface BuilderModel {
  id: string
  name: string
  provider: string
}

/** Raw shape we need out of the Gateway catalog. `provider` is the slug. */
export interface CatalogModel {
  id: string
  name: string
  provider: string
}

export const MODELS_PER_PROVIDER = 3

interface ProviderSpec {
  /** Gateway provider slugs that map to this entry. */
  slugs: string[]
  label: string
  /**
   * Ordered model families. One model is offered per family — the newest one
   * that matches — so the three options are meaningfully different rather than
   * three spellings of the same model.
   */
  families: RegExp[]
}

const TOP_PROVIDERS: ProviderSpec[] = [
  {
    slugs: ["anthropic"],
    label: "Anthropic",
    families: [/opus/, /sonnet/, /haiku/],
  },
  {
    slugs: ["openai", "azure"],
    label: "OpenAI",
    families: [/^gpt-[\d.]+$/, /^gpt-[\d.]+-(mini|nano)$/, /^(o\d|gpt-[\d.]+-(pro|codex))/],
  },
  {
    slugs: ["google", "google-vertex", "vertex"],
    label: "Google",
    families: [/pro/, /^gemini-[\d.]+-flash$/, /flash-lite|^gemini-[\d.]+-flash-/],
  },
  {
    slugs: ["xai"],
    label: "xAI",
    families: [/^grok-[\d.]+$/, /-(fast-)?reasoning$/, /mini|non-reasoning/],
  },
]

// Variants that are never the right pick for authoring a board.
const EXCLUDED = /embed|rerank|whisper|tts|audio|image|video|vision-only|guard|moderation|-beta$/

// Dated snapshots (gpt-5.5-2026-01-14, claude-…-20241022) are pinned aliases of
// a model we'd rather show under its clean name.
const DATED = /\d{4}-?\d{2}-?\d{2}|\d{8}/

function versionOf(slug: string): number[] {
  return (slug.match(/\d+(?:\.\d+)?/g) ?? []).flatMap((n) => n.split(".").map(Number))
}

/** Newest first: clean names before dated snapshots, then by version desc. */
function byNewest(a: string, b: string): number {
  const dated = Number(DATED.test(a)) - Number(DATED.test(b))
  if (dated !== 0) return dated

  const av = versionOf(a)
  const bv = versionOf(b)
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (bv[i] ?? -1) - (av[i] ?? -1)
    if (diff !== 0) return diff
  }
  return a.length - b.length
}

/**
 * Reduce a full Gateway catalog to the picker's shortlist: the top providers,
 * in order, with at most `MODELS_PER_PROVIDER` models each.
 */
export function shortlistModels(catalog: CatalogModel[]): BuilderModel[] {
  const shortlist: BuilderModel[] = []

  for (const spec of TOP_PROVIDERS) {
    const pool = catalog
      .filter((m) => spec.slugs.includes(m.provider) || spec.slugs.includes(m.id.split("/")[0]))
      .map((m) => ({ ...m, slug: m.id.split("/").slice(1).join("/").toLowerCase() }))
      .filter((m) => !EXCLUDED.test(m.slug))
      .sort((a, b) => byNewest(a.slug, b.slug))

    const picked = new Set<(typeof pool)[number]>()
    for (const family of spec.families) {
      if (picked.size >= MODELS_PER_PROVIDER) break
      const hit = pool.find((m) => family.test(m.slug) && !picked.has(m))
      if (hit) picked.add(hit)
    }
    // If a provider renamed its families out from under us, fall back to its
    // newest models so the provider doesn't vanish from the dropdown.
    if (picked.size === 0) {
      for (const m of pool.slice(0, MODELS_PER_PROVIDER)) picked.add(m)
    }

    for (const m of picked) {
      shortlist.push({ id: m.id, name: m.name, provider: spec.label })
    }
  }

  return shortlist
}

/**
 * Used when the Gateway catalog can't be reached, so the picker is never empty.
 * Deliberately short — it's replaced by the live shortlist as soon as
 * /api/ai/models responds.
 */
export const FALLBACK_MODELS: BuilderModel[] = [
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "openai/gpt-5.5", name: "GPT-5.5", provider: "OpenAI" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "xai/grok-4.3", name: "Grok 4.3", provider: "xAI" },
]

// Matched loosely against whatever the shortlist ends up containing.
const PREFERRED_DEFAULTS = ["anthropic/claude-sonnet", "openai/gpt-5", "openai/gpt", "google/gemini"]

export function pickDefaultModel(models: BuilderModel[]): string {
  for (const pref of PREFERRED_DEFAULTS) {
    const hit = models.find((m) => m.id.startsWith(pref))
    if (hit) return hit.id
  }
  return models[0]?.id ?? ""
}
