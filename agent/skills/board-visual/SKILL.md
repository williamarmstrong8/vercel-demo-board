---
name: board-visual
description: Author Canvas board plans in the Visual style — diagrams, flows and blocks with minimal copy.
---

You are authoring a **board plan** for the Visual style. You do not place anything
on the canvas: a structure engine owns every coordinate, width, color and font
size. Your whole job is to decide **what the board says and how its parts relate**.

Never think about x, y, width, overlap, or spacing. You cannot express them, and
guessing at them is the thing this pipeline exists to remove.

## What the Visual style is for

Architecture, request paths, pipelines, system shape, product demos. The picture
carries the meaning; the words label it. A viewer should understand the structure
before they read a single sentence.

The failure mode to avoid is **a wall of cards** — twelve identical boxes each
with a title and two sentences, laid out in a grid. That is not a diagram, it is
a bulleted list wearing a costume. The engine enforces this: at most half your
items may be `detail`, and it will reject the plan and make you rewrite it.

## Pick the right item kind

Reach past `detail` almost always.

| Use | When |
| --- | --- |
| `node` | A step, a box, a labeled thing in a diagram. **Your default.** Label only, 1–5 words. |
| `detail` | A concept that genuinely needs 1–3 sentences. Use sparingly. |
| `stat` | A figure. `value: "40%"`, `label: "less compute"`. |
| `bullets` | 2–6 short points that belong together. One item, not six cards. |
| `code` | Real source. `filename` + `source`. |
| `terminal` | A shell session. Lines starting with `$` render as commands. |
| `api` | An HTTP endpoint. `method` + `path`. |
| `db` | A data store. `engine` defaults to postgres. |
| `showcase` | A Vercel block: `aigateway`, `connect`, `ec2`, `fluidcompute`, `serverlesscompute`, `computecomparison`, `requestdemo`. |
| `filetree` | An agent's files. |
| `image` | A picture, with an absolute `https://` URL. |

If a card's body would restate its title, it is a `node`. If it would list
things, it is `bullets`. If it contains code, it is `code`.

## Pick the right layout

One `layout` per section, and it decides whether connectors exist:

- **`sequence`** — ordered steps. The engine draws one connector between each
  consecutive pair and serpentines when the row runs out, so the flow turns
  cleanly instead of trailing back across the board. **Do not add `edges`.**
- **`grid`** — peers. Never gets connectors, by design: things in a list are not
  a flow, and wiring them together is the single most common way an AI board
  turns to spaghetti.
- **`split`** — one anchor (the first item) with supporting points beside it.
  Ideal for a code block plus what to notice about it.
- **`hub`** — a center with satellites. The first item is the center. Connectors
  radiate from it. If you supply `edges`, connect the **center to satellites**;
  a satellite-to-satellite edge usually cannot be drawn without crossing the
  center, and the engine will drop it rather than draw through a block.
- **`columns`** — 2–4 parallel stacks for a comparison. Give `columnLabels`;
  items deal into the columns in order.
- **`feature`** — one item at hero size, optionally captioned by a second.
- **`stack`** — one column in reading order. Use for a single wide block.

## Rules the engine enforces

Breaking these gets the plan rejected with a note, and you get one more try:

- At most **10 items** in a section. More means it should be two sections.
- At most **48 items** on the board.
- At most **half** the board's items may be `detail`.
- `edges` only work on a `hub`, and every `from`/`to` must match an item `key`
  in that same section.

## Style discipline

- **One board title.** Set `title`; add `subtitle` only if it earns its line.
- **Headings.** Give each section a `heading`. A `subhead` is one clarifying line,
  not a paragraph.
- **Emojis.** No. Titles are plain text.
- **`emphasis: "panel"`** draws a tinted background behind a group. Use it on at
  most one or two sections — it means "these belong together", and if everything
  is panelled nothing is.
- **Copy length.** A `node` label is 1–5 words. A `detail` body is 1–3 sentences.
  Real sentences, no lorem, no filler.

## Worked example

A request like "show me how a deploy reaches production":

```json
{
  "title": "How a deploy reaches production",
  "subtitle": "Every push runs the same path; only the target environment differs.",
  "sections": [
    {
      "heading": "The pipeline",
      "layout": "sequence",
      "items": [
        { "kind": "node", "label": "git push" },
        { "kind": "node", "label": "Build" },
        { "kind": "node", "label": "Checks" },
        { "kind": "node", "label": "Preview URL" },
        { "kind": "node", "label": "Promote" },
        { "kind": "node", "label": "Production" }
      ]
    },
    {
      "heading": "What the build does",
      "layout": "split",
      "items": [
        { "kind": "code", "filename": "next.config.mjs", "source": "export default {\n  experimental: { ppr: true },\n}" },
        { "kind": "node", "label": "Install from lockfile" },
        { "kind": "node", "label": "Compile and tree-shake" },
        { "kind": "detail", "label": "Trace", "body": "Only the files a route reaches are bundled into its function." }
      ]
    },
    {
      "heading": "Runtime shape",
      "layout": "hub",
      "emphasis": "panel",
      "items": [
        { "kind": "node", "key": "edge", "label": "Edge network" },
        { "kind": "api", "key": "api", "method": "POST", "path": "/api/checkout" },
        { "kind": "db", "key": "db", "label": "Orders" },
        { "kind": "node", "key": "cache", "label": "Data cache" }
      ],
      "edges": [
        { "from": "edge", "to": "api", "label": "miss" },
        { "from": "edge", "to": "db" },
        { "from": "edge", "to": "cache" }
      ]
    },
    {
      "heading": "By the numbers",
      "layout": "grid",
      "items": [
        { "kind": "stat", "value": "1.2s", "label": "median build" },
        { "kind": "stat", "value": "40%", "label": "less compute" },
        { "kind": "stat", "value": "12k", "label": "deploys a day" }
      ]
    }
  ]
}
```

Note what that plan does **not** contain: no coordinates, no colors, no font
sizes, no arrows listed as items, and only one `detail` in nineteen lines of
content.
