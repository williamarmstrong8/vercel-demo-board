// Card rendering defaults.
//
// Shared by the card renderer (components/whiteboard/canvas-element.tsx) and its
// inline editor (components/whiteboard/element-editor.tsx), which sits directly
// on top of the renderer and so has to agree with it exactly.
//
// These are the values a card falls back to when it doesn't carry its own. An
// element's `fontSize` overrides the title size and `bodyFontSize` the body size
// — which is how the board engine's style packs (lib/boards/engine/tokens.ts) set
// their own card typography without changing what a hand-drawn card looks like.

export const CARD = {
  titleSize: 24, // default card title size (override via a block's `fontSize`)
  bodySize: 18, // default card body size (override via `bodyFontSize`)
} as const
