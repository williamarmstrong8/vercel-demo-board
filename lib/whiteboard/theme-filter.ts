import type { ElementType } from "./types"

/**
 * Excalidraw's dark-mode transform, applied as a presentational CSS filter
 * rather than by rewriting stored colours.
 *
 * `invert(93%)` takes a near-black stroke (#1e1e1e) to a near-white one
 * (#d3d3d3) — stopping short of a full invert keeps it off pure white, which
 * glares against a dark canvas — and drops a pale fill to a dark one.
 * Inverting alone would also flip every hue to its opposite, so
 * `hue-rotate(180deg)` turns them back: a pink fill lands on a deep red rather
 * than the teal a plain invert would give it.
 *
 * Because this is presentation only, the element keeps its light-mode colour in
 * the store. Switching themes back and forth is lossless, and a board shared
 * between a light and a dark viewer is still the same board.
 */
export const DARK_THEME_FILTER = "invert(93%) hue-rotate(180deg)"

/**
 * The element types whose colours the user actually picks, and so the only ones
 * the theme flips. Every other block (code, terminal, server, the eve and
 * compute blocks, images) carries a fixed dark-panel design of its own that is
 * meant to look the same on either canvas — inverting those would turn their
 * chrome inside out.
 */
const THEMED_TYPES = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "text",
  "card",
])

export function themeFilterFor(type: ElementType, theme: "light" | "dark"): string | undefined {
  return theme === "dark" && THEMED_TYPES.has(type) ? DARK_THEME_FILTER : undefined
}
