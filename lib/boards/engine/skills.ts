import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type StyleId, stylePack } from "./tokens"

// Loads the style skill that teaches the model how to author a plan for a given
// style pack.
//
// The skills live as real markdown in agent/skills/board-*/SKILL.md rather than
// as string literals in here, for one reason: they are the part of this pipeline
// a human will want to iterate on. Rewording "prefer a node to a detail card"
// should be editing a document, not editing TypeScript and redeploying a module.
//
// Node's `fs` is used rather than an import because Next has no text loader.
// next.config.mjs lists the skills directory in `outputFileTracingIncludes` so
// the files ship with the serverless function; if that ever stops being true the
// fallback below keeps board generation working — with a worse prompt, not a
// crash.

const SKILL_DIR = "agent/skills"

const cache = new Map<StyleId, string>()

/** Strip YAML frontmatter — it's metadata for humans, not instructions. */
function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source.trim()
  const end = source.indexOf("\n---", 3)
  if (end === -1) return source.trim()
  return source.slice(source.indexOf("\n", end + 1) + 1).trim()
}

/**
 * A terse restatement of the pack's own rules, used only if the skill file can't
 * be read. Derived from the pack so it can never drift out of sync with what the
 * engine will actually enforce.
 */
function fallback(style: StyleId): string {
  const pack = stylePack(style)
  const kinds = Object.entries(pack.render)
    .filter(([, r]) => r.mode !== "block")
    .map(([kind]) => kind)
  return [
    `You are authoring a board plan for the ${pack.label} style: ${pack.blurb}`,
    "You do not place anything — a structure engine owns every coordinate, width, colour and font size. Describe what the board says and how its parts relate.",
    `Layouts available: ${pack.layouts.join(", ")}.`,
    pack.connectors
      ? "Connectors are drawn only for a `sequence`'s consecutive steps, a `hub`'s spokes, and explicit `edges` on a hub. A grid or stack never gets one."
      : "This style draws no connectors at all; `sequence` and `hub` are laid out as reading order instead.",
    `Prefer these item kinds over \`detail\`: ${kinds.filter((k) => k !== "detail").join(", ")}.`,
    `At most ${pack.guards.maxItemsPerSection} items per section, and at most ${Math.round(
      pack.guards.maxDetailRatio * 100,
    )}% of the board's items may be \`detail\` cards.`,
    "No emojis. Write real sentences, never filler.",
  ].join("\n")
}

/** The authoring guidance for one style. Cached for the life of the process. */
export function loadStyleSkill(style: StyleId): string {
  const cached = cache.get(style)
  if (cached) return cached

  let skill: string
  try {
    const path = join(process.cwd(), SKILL_DIR, `board-${style}`, "SKILL.md")
    skill = stripFrontmatter(readFileSync(path, "utf8"))
    if (!skill) throw new Error("empty skill file")
  } catch (err) {
    console.warn(`board style skill "${style}" unavailable, using the built-in summary:`, err)
    skill = fallback(style)
  }

  cache.set(style, skill)
  return skill
}
