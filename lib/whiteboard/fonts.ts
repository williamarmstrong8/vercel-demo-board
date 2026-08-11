import type { FontFamily } from "./types"

// The CSS variables come from app/layout.tsx. Each stack falls back to the sans
// variable so an element still renders in something sensible if its font hasn't
// loaded yet (next/font uses display: swap).
const FONT_STACKS: Record<FontFamily, string> = {
  sans: "var(--font-sans)",
  hand: "var(--font-hand), var(--font-sans)",
  mono: "var(--font-mono, monospace)",
}

export const FONT_LABELS: Record<FontFamily, string> = {
  sans: "Normal",
  hand: "Hand-drawn",
  mono: "Code",
}

export const FONT_FAMILIES = ["sans", "hand", "mono"] as const

/**
 * CSS font-family for an element's text. Undefined means sans, so boards saved
 * before the font option existed render exactly as they did before.
 *
 * Every place that draws element text goes through here — the canvas views and
 * the inline editors alike — because the editor sits directly on top of the
 * view it replaces: any disagreement about the typeface shows up as text
 * jumping the moment you start or stop typing, and as a wrong auto-height,
 * since the block measures whichever one is mounted.
 */
export function fontStack(family: FontFamily | undefined): string {
  return FONT_STACKS[family ?? "sans"]
}
