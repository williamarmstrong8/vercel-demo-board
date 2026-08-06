import { gateway, generateText, stepCountIs, tool, type ToolSet } from "ai"
import { z } from "zod"
import type { MCPClient } from "@ai-sdk/mcp"
import * as boards from "@/lib/boards/service"
import { blockSchema, hydrateBlocks, BlockSpecError } from "@/lib/boards/blocks"
import { openNotionClient, ConsentRequiredError } from "@/lib/connections/notion"
import { TYPE_SCALE, CARD } from "@/lib/whiteboard/board-design"

// Chat endpoint that builds Canvas boards from a natural-language conversation.
//
// The model authors boards through the `blockSchema` + `hydrateBlocks` path in
// lib/boards/blocks.ts, so there is exactly one definition of what a "block" is
// and how it becomes canvas elements.
//
// Auth: the AI Gateway provider reads AI_GATEWAY_API_KEY when set and otherwise
// falls back to the Vercel OIDC token (VERCEL_OIDC_TOKEN, pulled by `vercel dev`
// / injected automatically on Vercel) — so no key wiring is needed here.

export const maxDuration = 60

const SYSTEM = `You are the board-building assistant for Canvas, an infinite whiteboard for software architecture diagrams, flows, and product demos. The user describes what they want (and may attach source pages); you build it by calling a tool. Reply in one short sentence — the board is the deliverable.

PICK THE RIGHT BLOCK — do not default to cards:
- code — real source code. \`title\` = filename, \`text\` = the code. Use for ANY code sample.
- terminal — shell commands or CLI output. \`title\` = shell name, \`text\` = the transcript.
- server — an HTTP API endpoint. \`method\` + \`endpoint\`.
- card — a labeled box: a titled concept (title + one to three sentences) OR a labeled node in a flow/diagram (\`title\` only, omit \`text\`). Your default for boxes-with-labels.
- text — a heading, label, or standalone line (no box). Sizing below.
- rectangle / ellipse / diamond — UNLABELED shapes only (a colored panel behind a group, a divider, a plain node). They render NO text — never use one where a label must show; use a card.
- aigateway, ec2, fluidcompute, serverlesscompute, computecomparison, requestdemo — Vercel showcase blocks.

DESIGN SYSTEM — use these EXACT sizes so the board has real hierarchy (never one uniform grid of identical cards):
- Board title: ONE text block at the top, \`fontSize\` 40, bold.
- Section heading: text, \`fontSize\` 28, bold — one above each group.
- Sub-label / small heading: text, \`fontSize\` 20, bold.
- Standalone body copy: text, \`fontSize\` 16.
- Cards: \`width\` 260 standard, or 380 for a detail-heavy card. Titles are ${CARD.titleSize}px and body text ${CARD.bodySize}px by default; set a card's \`fontSize\` higher (e.g. 40) to emphasize a hero/summary card. Cards auto-grow to fit their text.
- Color: keep most blocks white. Use a light \`fill\` (e.g. #fafafa, #f0f7ff, #f6f8f0) on a card or a background rectangle to group or highlight a section — sparingly.
- Vary it: mix title-only nodes with detailed cards, standard and wide widths, and the heading scale, so the board reads as a designed layout — not a wall of same-size cards.

RULES:
- Prefer specialized blocks over cards: code to code, commands to terminal, endpoint to server.
- Emojis: almost never — do NOT put one in every title. At most one or two on the whole board. Titles are plain text.
- Card text: one to three concise sentences. Consolidate related points; don't flood the board with tiny cards.
- Flow / sequence: make each step a title-only \`card\` (or a real block where apt), lay them left-to-right (omit x/y), and put ONE \`arrow\` between each pair. Auto-placed arrows snap to the blocks' edges with padding — just alternate: step, arrow, step, arrow, step.

Blocks auto-layout left-to-right and wrap into rows when x/y are omitted; a text block starts a new row (it's a heading) with the next content below it. Omit x/y unless you need a specific arrangement.

Decide sensibly: if the request is clear, build it immediately in one tool call. When a board already exists in this conversation, extend it with add_blocks unless the user asks for a fresh one.`

const createBoardInput = z.object({
  name: z.string().describe("Board name shown in the boards grid."),
  blocks: z.array(blockSchema).min(1),
})

const addBlocksInput = z.object({
  blocks: z.array(blockSchema).min(1),
})

interface BuiltBoard {
  id: string
  name: string
  blocks: number
}

interface Source {
  type: "notion"
  url: string
}

export async function POST(req: Request) {
  let body: {
    messages?: { role: "user" | "assistant"; content: string }[]
    model?: string
    boardId?: string | null
    sources?: Source[]
    userId?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const { messages, model } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 })
  }
  if (typeof model !== "string" || !model.includes("/")) {
    return Response.json({ error: "A valid Gateway model id is required." }, { status: 400 })
  }

  const notionSources = (body.sources ?? []).filter((s) => s?.type === "notion" && s.url)
  const userId = typeof body.userId === "string" ? body.userId : null

  // Tracks the board this conversation is working on. Seeded from the client so
  // follow-up turns extend the same board instead of spawning new ones.
  let currentBoardId = typeof body.boardId === "string" ? body.boardId : null
  let built: BuiltBoard | null = null

  // When the user attached Notion pages, open an MCP client to Notion (authed
  // per-user through Vercel Connect) and hand its tools to the model so it can
  // read those pages before building. Closed in `finally`.
  let notionClient: MCPClient | null = null
  let notionTools: ToolSet = {}
  let system = SYSTEM
  if (notionSources.length > 0 && userId) {
    const callbackUrl = `${new URL(req.url).origin}/connections/callback`
    try {
      notionClient = await openNotionClient(userId, { callbackUrl })
      // The MCP adapter and `ai` ship structurally-identical Tool types from
      // different package copies; bridge the nominal mismatch.
      notionTools = (await notionClient.tools()) as unknown as ToolSet
    } catch (err) {
      // User hasn't connected Notion yet — hand the consent URL back so the UI
      // can prompt them, rather than failing the whole build.
      if (err instanceof ConsentRequiredError) {
        return Response.json({ needsAuth: "notion", authorizeUrl: err.url })
      }
      console.error("notion source setup failed:", err)
      return Response.json(
        {
          error:
            "Couldn't reach Notion. Make sure the Notion connector is set up and reconnect it.",
        },
        { status: 502 },
      )
    }
    system = `${SYSTEM}\n\nThe user attached these Notion pages as sources:\n${notionSources
      .map((s) => `- ${s.url}`)
      .join(
        "\n",
      )}\nUse the available Notion tools to read them first, then build the board from their real content — headings become cards or text, code samples become code blocks, and so on.`
  }

  try {
    const result = await generateText({
      model: gateway(model),
      system,
      messages,
      // Extra steps when Notion tools are in play: read the page(s), then build.
      stopWhen: stepCountIs(notionSources.length > 0 ? 8 : 4),
      tools: {
        ...notionTools,
        create_board: tool({
          description:
            "Create a new Canvas board populated with blocks. Use this for the first board in the conversation, or when the user asks for a brand-new board.",
          inputSchema: createBoardInput,
          execute: async ({ name, blocks }) => {
            try {
              const hydrated = hydrateBlocks(blocks)
              const id = await boards.createBoardFromData(name, {
                elements: hydrated.elements,
                camera: { x: 0, y: 0, zoom: 1 },
              })
              currentBoardId = id
              built = { id, name, blocks: hydrated.elements.length }
              return `Created board "${name}" with ${hydrated.elements.length} blocks (id: ${id}).`
            } catch (err) {
              if (err instanceof BlockSpecError) {
                return `Could not build the board: ${err.message} Fix the blocks and try again.`
              }
              throw err
            }
          },
        }),
        add_blocks: tool({
          description:
            "Append blocks to the board already being built in this conversation. New blocks flow in below the existing content.",
          inputSchema: addBlocksInput,
          execute: async ({ blocks }) => {
            if (!currentBoardId) {
              return "No board exists yet — call create_board first."
            }
            const board = await boards.getBoard(currentBoardId)
            if (!board) return "The board no longer exists — call create_board to make a new one."
            try {
              const hydrated = hydrateBlocks(blocks, {
                existing: board.data.elements,
              })
              await boards.saveBoard(currentBoardId, {
                data: {
                  ...board.data,
                  elements: [...board.data.elements, ...hydrated.elements],
                },
              })
              const total = board.data.elements.length + hydrated.elements.length
              built = { id: currentBoardId, name: board.name, blocks: total }
              return `Added ${hydrated.elements.length} blocks to "${board.name}" (now ${total}).`
            } catch (err) {
              if (err instanceof BlockSpecError) {
                return `Could not add the blocks: ${err.message} Fix them and try again.`
              }
              throw err
            }
          },
        }),
      },
    })

    // `built` is only ever assigned inside the tool closures above, which TS
    // control-flow analysis can't see — read it through an explicit alias so it
    // keeps its declared type instead of narrowing to `null`.
    const finalBoard = built as BuiltBoard | null

    const reply =
      result.text.trim() ||
      (finalBoard
        ? `Done — I built "${finalBoard.name}" with ${finalBoard.blocks} blocks.`
        : "I wasn't able to build anything from that — could you add more detail?")

    return Response.json({
      reply,
      board: finalBoard ? { ...finalBoard, url: `/board/${finalBoard.id}` } : null,
    })
  } catch (err) {
    // A Notion tool call can surface a consent requirement mid-generation.
    if (err instanceof ConsentRequiredError) {
      return Response.json({ needsAuth: "notion", authorizeUrl: err.url })
    }
    console.error("build-board generation failed:", err)
    const raw = err instanceof Error ? err.message : "The model request failed. Please try again."
    // Provider errors (e.g. the AI Gateway) can embed ANSI terminal color codes;
    // strip them so the message reads cleanly in a chat bubble.
    // eslint-disable-next-line no-control-regex
    const message = raw.replace(/\u001b\[[0-9;]*m/g, "").trim()
    return Response.json({ error: message }, { status: 502 })
  } finally {
    await notionClient?.close().catch(() => {})
  }
}
