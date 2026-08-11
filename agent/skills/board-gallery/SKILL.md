---
name: board-gallery
description: Author Canvas board plans in the Gallery style — image-led hero frames and captioned grids.
---

You are authoring a **board plan** for the Gallery style. You do not place
anything on the canvas: a structure engine owns every coordinate, width, color
and font size. Your job is **choosing the images and the words around them**.

Never think about x, y, width, overlap, or spacing. You cannot express them.

## What the Gallery style is for

Visual audits, design reviews, screenshot walkthroughs, moodboards, before/after
comparisons, brand or UI inventories. The images carry the board and text is
demoted to captions and short labels.

Every frame is laid out at the **same 3:2 aspect ratio**, on purpose — a gallery
reads as a gallery because the rhythm doesn't vary. Images are cropped to fit
rather than stretched, so you never need to worry about their real dimensions.

**There are no arrows in this style.** Connectors are switched off; a `sequence`
or `hub` is laid out as a `grid` instead.

## Images: the one thing to get right

An `image` item takes `src`, `caption` and `alt`:

```json
{ "kind": "image", "src": "https://…/hero.png", "caption": "Hero at 1440px, light theme" }
```

- **`src` must be an absolute `https://` URL.** Use URLs you actually have — from
  a source page you were given, or from the conversation. Never invent one, and
  never guess at a plausible-looking path.
- **If you have no real URL, omit `src`** and write a descriptive `alt`. The
  engine lays out a captioned placeholder frame in its place, so the composition
  is complete and real images can be dropped in later. A described empty frame is
  useful; a broken image link is not.
- **Always write a `caption`.** In this style the caption is the text — it is how a
  viewer knows what they're looking at.

## Pick the right item kind

| Use | When |
| --- | --- |
| `image` | A picture. **The point of this style.** |
| `node` | A short label between groups of frames. |
| `detail` | A note that needs 1–3 sentences. Used sparingly — see the cap below. |
| `bullets` | 2–6 observations or open questions. |
| `stat` | A figure worth calling out. |
| `prose` | A paragraph of framing at the top of a section. |
| `quote` | Feedback worth pulling out, with `attribution`. |
| `code` | Real source, when a visual point needs the code behind it. |

## Pick the right layout

Four layouts. Anything else is remapped to `grid`:

- **`grid`** — the workhorse. Three frames across, captioned, uniform.
- **`feature`** — one image at hero size with its caption. Open with this.
- **`columns`** — 2–4 parallel stacks. The right choice for before/after, with
  `columnLabels` naming the sides.
- **`stack`** — one column, for a section of notes rather than pictures.

## Rules the engine enforces

- At most **12 items** in a section, and **48** on the board.
- At most **40% of the board's items may be `detail`.** This style is images with
  captions; if you find yourself writing card after card, you have picked the
  wrong style — a text-led board should be built in the Narrative style instead.
- `columns` needs at least as many items as `columnLabels`.
- Connectors are off; `edges` are discarded.

## Style discipline

- **Open with a `feature`.** One hero frame establishes what the board is about.
- **Group frames by what varies** — states, breakpoints, themes, versions — and
  let the section heading name the variable.
- **Captions are labels, not sentences.** "Empty state, 375px" beats "This shows
  what the screen looks like when there are no results to display."
- **No emojis.**
- Put commentary in its own `stack` section at the end rather than interleaving
  paragraphs between frames.

## Worked example

A request like "audit the storefront redesign screenshots":

```json
{
  "title": "Storefront redesign — visual audit",
  "sections": [
    {
      "heading": "The new hero",
      "layout": "feature",
      "items": [
        { "kind": "image", "src": "https://assets.example.com/hero-1440.png", "caption": "Hero at 1440px, light theme" }
      ]
    },
    {
      "heading": "Product grid states",
      "layout": "grid",
      "items": [
        { "kind": "image", "caption": "Default", "alt": "Grid, three across, no filters applied" },
        { "kind": "image", "caption": "Filtered", "alt": "Grid with two facets active" },
        { "kind": "image", "caption": "Empty", "alt": "No results, with a reset affordance" },
        { "kind": "image", "caption": "Loading", "alt": "Skeleton cards" },
        { "kind": "image", "caption": "Error", "alt": "Inline retry" },
        { "kind": "image", "caption": "Mobile, 375px", "alt": "Single column" }
      ]
    },
    {
      "heading": "Light and dark",
      "layout": "columns",
      "columnLabels": ["Light", "Dark"],
      "items": [
        { "kind": "image", "caption": "Product detail", "alt": "Light theme PDP" },
        { "kind": "image", "caption": "Product detail", "alt": "Dark theme PDP" }
      ]
    },
    {
      "heading": "Notes",
      "layout": "stack",
      "items": [
        {
          "kind": "bullets",
          "label": "Open questions",
          "points": ["Does the filter bar stick on mobile?", "Do we keep the price range slider?"]
        }
      ]
    }
  ]
}
```

Note that most frames here have no `src` — they are described placeholders,
because inventing image URLs would produce a board full of broken pictures. The
structure is right either way.
