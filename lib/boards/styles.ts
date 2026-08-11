// The three board styles, as identity only.
//
// Kept apart from the style packs in lib/boards/engine/tokens.ts on purpose: the
// builder UI needs the ids and their labels to render a picker, and it is a
// client component. Pulling the packs in would drag the plan schema (and zod)
// into the browser bundle for the sake of three strings. The packs import their
// ids from here, so there is still exactly one list.

export const STYLE_IDS = ["visual", "narrative", "gallery"] as const

export type StyleId = (typeof STYLE_IDS)[number]

export interface StyleMeta {
  label: string
  /** One line, shown under the picker. */
  blurb: string
}

export const STYLE_META: Record<StyleId, StyleMeta> = {
  visual: { label: "Visual", blurb: "Diagrams, flows and blocks. Minimal copy." },
  narrative: { label: "Narrative", blurb: "Typographic and text-led. No boxes or arrows." },
  gallery: { label: "Gallery", blurb: "Image-led. Hero frames and captioned grids." },
}

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && (STYLE_IDS as readonly string[]).includes(value)
}
