---
name: board-narrative
description: Author Canvas board plans in the Narrative style — typographic, text-led, no boxes or arrows.
---

You are authoring a **board plan** for the Narrative style. You do not place
anything on the canvas: a structure engine owns every coordinate, width, color
and font size. Your job is **the writing and its structure**.

Never think about x, y, width, overlap, or spacing. You cannot express them.

## What the Narrative style is for

Write-ups, decision records, post-mortems, research summaries, briefs, teaching
material — anything whose value is in the prose. The board is laid out as a
reading column with a real typographic scale, and the engine renders your text
**without boxes around it**: a `node` becomes a small heading, a `detail` becomes
a heading and its paragraph, a `quote` becomes set-in type with its attribution.

**There are no arrows in this style, at all.** The engine has connectors switched
off. A `sequence` or a `hub` is silently laid out as a `stack` instead, because a
document does not have a flow diagram running through it. Don't reach for them.

## Pick the right item kind

This is the one style where prose is the point, so the balance is inverted from
the others — there is no cap on how much of your board is written copy.

| Use | When |
| --- | --- |
| `prose` | A paragraph. **Your workhorse.** Up to ~600 characters, real sentences. |
| `detail` | A sub-heading plus its paragraph. The main structural unit. |
| `bullets` | 2–6 points. Use when the items are genuinely parallel, not to avoid writing. |
| `quote` | A pulled quote, with `attribution`. One or two per board at most. |
| `node` | A short standalone heading with nothing under it. |
| `stat` | A figure worth setting large. `value` + `label`. |
| `code` | Real source, `filename` + `source`. Renders full-measure. |
| `terminal` | A shell session. |
| `image` | A figure, with an absolute `https://` URL and a `caption`. |

Prefer one substantial `prose` item to three thin ones. The reading column has a
rhythm and chopping every thought into its own block destroys it.

## Pick the right layout

Only four layouts exist here. Anything else is remapped:

- **`stack`** — one column in reading order. **This is the default and you will
  use it for most sections.**
- **`columns`** — 2–4 parallel stacks. The right choice for a genuine
  before/after or option-A/option-B comparison. Supply `columnLabels`.
- **`grid`** — two across, for short parallel items like stats.
- **`feature`** — one item at hero size with an optional caption. For a figure or
  a single pulled quote that carries a section.

## Rules the engine enforces

- At most **10 items** in a section — more means it wants to be two sections with
  their own headings.
- At most **48 items** on the board.
- `columns` needs at least as many items as it has `columnLabels`.
- Connectors are off. `edges` are discarded.

## Style discipline

- **Structure by heading, not by box.** Sections are how you organise; each gets
  a `heading`, and a `subhead` when one clarifying line helps.
- **Write in full sentences.** No fragments-as-bullets, no telegraphic notes, no
  headline-ese. If the source material is thin, write less rather than padding.
- **No emojis. No bold-as-emphasis inside copy.** The type scale does that work.
- **`emphasis: "panel"`** tints a background behind a group. At most one section.
- **Quotes are for voices**, not for restating your own point in italics.

## Worked example

A request like "write up why we moved checkout to a server action":

```json
{
  "title": "Why we moved the checkout to a server action",
  "subtitle": "A short write-up of the migration, what broke, and what we would do again.",
  "sections": [
    {
      "heading": "The problem",
      "layout": "stack",
      "items": [
        {
          "kind": "prose",
          "text": "The old checkout posted to an API route that re-validated the cart, re-priced it, and then redirected. Three round trips before the customer saw anything change, and every one of them could fail independently. The failure modes were not the interesting part — the latency was."
        },
        {
          "kind": "bullets",
          "label": "What we measured",
          "points": [
            "p75 time-to-confirmation was 2.4s on mobile",
            "18% of failures were a retry of an already-successful charge",
            "The cart was serialized three times per checkout"
          ]
        },
        {
          "kind": "quote",
          "text": "We were paying the cost of a distributed system to move data between two functions in the same region.",
          "attribution": "Priya, platform team"
        }
      ]
    },
    {
      "heading": "Before and after",
      "layout": "columns",
      "columnLabels": ["API route", "Server action"],
      "items": [
        { "kind": "detail", "label": "Three round trips", "body": "Validate, price, redirect — each a separate request." },
        { "kind": "detail", "label": "One round trip", "body": "The action validates and prices in the same invocation." },
        { "kind": "detail", "label": "Manual error plumbing", "body": "Every failure had to be mapped to a status code and re-parsed." },
        { "kind": "detail", "label": "Errors are values", "body": "The action returns a typed result the form renders directly." }
      ]
    },
    {
      "heading": "The shape of the new code",
      "layout": "stack",
      "items": [
        {
          "kind": "code",
          "filename": "app/checkout/actions.ts",
          "source": "\"use server\"\n\nexport async function checkout(cart: Cart) {\n  const priced = await priceCart(cart)\n  if (!priced.ok) return { error: priced.reason }\n  return { orderId: await charge(priced) }\n}"
        },
        {
          "kind": "prose",
          "text": "There is no route handler left. The form calls the action directly, and the only serialization boundary is the one the framework already owns."
        }
      ]
    }
  ]
}
```

Note the `columns` section: items deal left, right, left, right — so consecutive
pairs line up as the comparison you intended.
