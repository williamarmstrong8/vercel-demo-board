// Design system for AI-authored boards.
//
// Single source of truth shared by the auto-layout (lib/boards/blocks.ts), the
// card renderer (components/whiteboard/canvas-element.tsx), and the build-board
// system prompt (app/api/ai/build-board/route.ts) — so the sizes the model is
// told to use are exactly the sizes the canvas lays out and renders.

// Typographic scale for `text` blocks (headings, labels, standalone copy).
export const TYPE_SCALE = {
  h1: 40, // board title — one per board
  h2: 28, // section heading
  h3: 20, // sub-heading / small label
  body: 16, // standalone body copy
} as const

// Card sizing. Cards auto-fit their height; these govern width and font size.
export const CARD = {
  width: 260, // standard card
  wideWidth: 380, // detail-heavy card
  titleSize: 24, // default card title size (override via a block's `fontSize`)
  bodySize: 18, // card body size
} as const

// Spacing.
export const ARROW_PAD = 16 // gap between an arrow's ends and the blocks it joins
