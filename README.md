# Canvas

An infinite whiteboard for software architecture diagrams, request flows, write-ups and product demos — with an AI board builder that composes boards from a description instead of leaving you to draw them.

Built with Next.js 16, React 19 and Postgres.

## Features

**Canvas**

- Infinite pan-and-zoom surface with snapping, multi-select, copy/paste, layer ordering and undo/redo
- Shapes, arrows, lines, text and cards, with a hand-drawn sketch mode ([roughjs](https://roughjs.com)) alongside the crisp render
- Plain, dotted or grid paper backgrounds, and a light/dark canvas
- Drag-and-drop images from the desktop or another tab

**Blocks**

Purpose-built blocks that render more than a labelled box:

- `code` and `terminal` — syntax-highlighted source and shell transcripts
- `server` and `database` — an HTTP endpoint node and a data store with a sample query, for Postgres, MySQL, Redis or MongoDB
- Vercel showcase blocks — AI Gateway, Vercel Connect, and live compute-spend comparisons between EC2, Serverless and Fluid
- `filetree` — an IDE-style explorer for an [eve](https://www.npmjs.com/package/eve) agent, with a chat channel and a sandbox terminal that mirror the agent's real activity

**AI board builder**

Describe a board in plain language and get a laid-out canvas. Pick one of three
design systems — Visual, Narrative or Gallery — and optionally attach a Notion
page to build from its real content. See [AI board generation](#ai-board-generation).

**Sharing**

Boards are private to their owner and can be published for anyone signed in to read. A people directory and per-user profile pages list who has published what.

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions), React 19 |
| Styling | Tailwind CSS 4, [Geist](https://vercel.com/font) |
| State | Zustand |
| Database | Postgres via Drizzle ORM |
| AI | [AI SDK 7](https://ai-sdk.dev) through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), MCP for connectors |
| Validation | Zod |

## Getting started

### Prerequisites

- Node.js 24
- pnpm 10
- A Postgres database

### Install

```bash
pnpm install
```

### Configure

Create `.env.local`:

```text
DATABASE_URL=postgres://…
AI_GATEWAY_API_KEY=…
```

`AI_GATEWAY_API_KEY` is read by the AI Gateway provider and is only needed for
the AI board builder. On Vercel it falls back to the OIDC token, so it can be
left unset there.

The app authenticates users with OAuth and reads its client credentials from the
environment; see [`lib/auth.ts`](lib/auth.ts) and [`proxy.ts`](proxy.ts) for the
variables it expects. Optional connector variables (`NOTION_CONNECTOR`,
`NOTION_MCP_URL`, and the Slack, Discord, Telegram and Twilio equivalents) enable
the matching integrations.

### Set up the database

```bash
pnpm db:migrate
```

### Run

```bash
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | Lint the project |
| `pnpm db:migrate` | Apply any migrations that haven't run yet |
| `pnpm db:claim` | One-off: reassign pre-ownership `anonymous` boards to a real account |

## Project structure

```
app/
  actions/            Server Actions for board reads and writes
  api/                Route handlers — AI board builder, models, auth, connectors
  board/[id]/         The board editor
  u/[handle]/         Public profiles
  people/             People directory
components/
  whiteboard/         Canvas surface, element renderers, toolbar, properties panel
  home/               Dashboard, board cards, AI builder modal
  ui/                 shadcn/ui primitives
lib/
  whiteboard/         Element types, store, geometry, templates, sketch rendering
  boards/             Board persistence, access control, and the structure engine
  db/                 Drizzle schema and SQL migrations
  connections/        Connector clients (Notion over MCP)
  ai/                 Model list and the build-event wire format
agent/                eve agent definition, tools, channels and skills
scripts/              Database migration and maintenance scripts
```

## AI board generation

The board builder does **not** ask a model to place things on a canvas. A model
that emits coordinates will eventually emit overlapping ones, and a model that
picks its own colours and font sizes produces a different-looking board every
time. Instead the pipeline is split in two:

```
model  →  BoardPlan (semantic)  →  structure engine  →  canvas elements
```

The model authors a **plan**: a title and a handful of sections, each with one
layout primitive (`sequence`, `grid`, `columns`, `stack`, `split`, `hub`,
`feature`) and a list of semantic items (`node`, `detail`, `stat`, `bullets`,
`prose`, `quote`, `code`, `terminal`, `api`, `db`, `image`, `showcase`,
`filetree`). A plan has no geometry and no colour in it at all — position isn't
representable, so an overlap can't be expressed.

The engine in [`lib/boards/engine`](lib/boards/engine) turns a plan into elements
through five stages:

1. **Guards** — reject a plan that would produce a bad board, with a message
   telling the model what to change. Sections are capped, and a hard limit on how
   many items may be `detail` cards stops a board becoming a wall of identical
   boxes.
2. **Place** — lay each section out as a band, using the active style pack's type
   scale, widths and spacing. Text is sized with per-glyph advance-width tables
   measured from the real fonts, biased slightly wide so a block can only ever
   shrink when the canvas re-measures it on mount — never grow into its neighbour.
3. **Settle** — sweep every pair of elements for intersection and push whole
   sections apart until the board is clean, rather than trusting the layout code
   to be correct.
4. **Route** — only now draw connectors, against final coordinates with every
   other block treated as an obstacle. A connector that can't be drawn without
   crossing a block is dropped and reported instead.
5. **Stack** — assign z-order by layer: background panels beneath, connectors
   above them, content on top.

Arrows exist only as a consequence of a `sequence`'s adjacency, a `hub`'s spokes,
or explicit `edges` — a grid or a stack can never be wired up, because peers in a
list aren't a flow.

### Style packs

Each style is a design system held as data in
[`lib/boards/engine/tokens.ts`](lib/boards/engine/tokens.ts), paired with an
authoring skill in `agent/skills/board-*` that teaches the model how to compose
for it:

| Style | Character |
| --- | --- |
| **Visual** | Diagram-first. Boxes, flows and showcase blocks; minimal copy; real connectors. |
| **Narrative** | Text-first. A reading column with a full typographic scale, no boxes and no arrows. |
| **Gallery** | Image-first. A hero frame and captioned grids at one uniform aspect ratio. |

The style is chosen in the builder and locks once the board exists, so follow-up
turns extend it in the same design system.

## Board ownership

The whole site sits behind sign in — [`proxy.ts`](proxy.ts) redirects anyone
without a session to `/signin`, preserving where they were headed so a shared
board link survives the detour.

Every board belongs to the account that created it and starts private:

- **Private** — only the owner can open it. To everyone else it 404s, so a
  board's existence is never leaked.
- **Public** — any signed-in user can open and read it. Editing, renaming,
  publishing and deleting stay with the owner; other viewers get the canvas
  read-only with no toolbar.

The dashboard shows this as two grids: **Your boards** and **Shared boards**
(everyone else's public ones). Use the ⋯ menu on a board you own to change its
visibility.

Access control lives in [`lib/boards/service.ts`](lib/boards/service.ts), which
resolves the viewer from the session cookie rather than trusting an id from the
caller — so the Server Actions and the `/api/boards/flush` and
`/api/ai/build-board` routes are all covered by the same rules.

## Database

The schema in [`lib/db/schema.ts`](lib/db/schema.ts) is hand-kept, and
`lib/db/migrations/*.sql` is what actually changes the database. Each file runs
once, in filename order, inside a transaction alongside the row that records it —
so a failed migration leaves nothing behind.

```bash
pnpm db:migrate
```

## Deployment

Deploy to [Vercel](https://vercel.com). Set the same environment variables on the
project, and run `pnpm db:migrate` against the production database whenever a new
migration lands.
