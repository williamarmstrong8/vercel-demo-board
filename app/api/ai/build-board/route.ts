import { gateway, streamText, stepCountIs, tool, type ToolSet } from "ai"
import { z } from "zod"
import type { MCPClient } from "@ai-sdk/mcp"
import * as boards from "@/lib/boards/service"
import { blockSchema, hydrateBlocks, BlockSpecError } from "@/lib/boards/blocks"
import { openNotionClient, ConsentRequiredError } from "@/lib/connections/notion"
import { getCurrentUser } from "@/lib/auth"
import { TYPE_SCALE, CARD } from "@/lib/whiteboard/board-design"
import {
  BUILD_STREAM_CONTENT_TYPE,
  type BuildEvent,
  type BuildStepStatus,
} from "@/lib/ai/build-events"

// Chat endpoint that builds Canvas boards from a natural-language conversation.
//
// The model authors boards through the `blockSchema` + `hydrateBlocks` path in
// lib/boards/blocks.ts, so there is exactly one definition of what a "block" is
// and how it becomes canvas elements.
//
// The response is an NDJSON stream of `BuildEvent`s (lib/ai/build-events.ts).
// Reading a Notion page and drafting a few dozen blocks routinely takes a
// minute or more; a buffered JSON response spends that whole time silent, which
// reads as a hang and gives intermediaries every reason to cut the connection.
//
// Auth: the AI Gateway provider reads AI_GATEWAY_API_KEY when set and otherwise
// falls back to the Vercel OIDC token (VERCEL_OIDC_TOKEN, pulled by `vercel dev`
// / injected automatically on Vercel) — so no key wiring is needed here.

export const maxDuration = 300

const HEARTBEAT_MS = 10_000

const SYSTEM = `You are the board-building assistant for Canvas, an infinite whiteboard for software architecture diagrams, flows, and product demos. The user describes what they want (and may attach source pages); you build it by calling a tool. Reply in one short sentence — the board is the deliverable.

PICK THE RIGHT BLOCK — do not default to cards:
- code — real source code. \`title\` = filename, \`text\` = the code. Use for ANY code sample.
- terminal — shell commands or CLI output. \`title\` = shell name, \`text\` = the transcript.
- server — an HTTP API endpoint. \`method\` + \`endpoint\`.
- database — a data store (Postgres/MySQL/Redis/MongoDB). \`dbEngine\` (defaults to postgres).
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
- Prefer specialized blocks over cards: code to code, commands to terminal, endpoint to server, data store to database.
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

/** Provider errors (notably the Gateway's) can embed ANSI color codes. */
function clean(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  // eslint-disable-next-line no-control-regex
  const message = raw.replace(/\u001b\[[0-9;]*m/g, "").trim()
  return message || "The model request failed. Please try again."
}

/** Human-readable progress labels for a tool the model just reached for. */
function toolLabels(toolName: string): { active: string; done: string } {
  switch (toolName) {
    case "create_board":
      return { active: "Drafting the board", done: "Board created" }
    case "add_blocks":
      return { active: "Adding blocks", done: "Blocks added" }
  }
  // Everything else is a Notion MCP tool, whose names vary by connector version.
  const name = toolName.toLowerCase()
  if (name.includes("search")) return { active: "Searching Notion", done: "Searched Notion" }
  if (name.includes("comment")) return { active: "Reading comments", done: "Read comments" }
  const pretty = toolName.replace(/[-_]/g, " ")
  if (name.includes("fetch") || name.includes("get") || name.includes("page") || name.includes("read")) {
    return { active: "Reading the Notion page", done: "Read the Notion page" }
  }
  return { active: `Notion: ${pretty}`, done: `Notion: ${pretty}` }
}

function notionPageLabel(url: string): string {
  try {
    const slug = new URL(url).pathname.split("/").pop() ?? ""
    const words = slug.replace(/-?[0-9a-f]{16,}$/i, "").replace(/-/g, " ").trim()
    return words || "the Notion page"
  } catch {
    return "the Notion page"
  }
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

  // Boards the model builds are owned by whoever asked for them, so there has
  // to be someone to own them. Checked up front rather than letting the create
  // tool throw mid-generation, which would burn a model call to reach the same
  // answer.
  if (!(await getCurrentUser())) {
    return Response.json({ error: "Sign in to build boards." }, { status: 401 })
  }

  const notionSources = (body.sources ?? []).filter((s) => s?.type === "notion" && s.url)
  const userId = typeof body.userId === "string" ? body.userId : null
  const callbackUrl = `${new URL(req.url).origin}/connections/callback`

  // Tracks the board this conversation is working on. Seeded from the client so
  // follow-up turns extend the same board instead of spawning new ones.
  let currentBoardId = typeof body.boardId === "string" ? body.boardId : null
  let built: BuiltBoard | null = null

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const emit = (event: BuildEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      const step = (id: string, label: string, status: BuildStepStatus) =>
        emit({ type: "step", id, label, status })

      // A single tool call can run for a minute with nothing to say. Keep the
      // socket warm so nothing between here and the browser gives up on it.
      const heartbeat = setInterval(() => emit({ type: "ping" }), HEARTBEAT_MS)

      let notionClient: MCPClient | null = null

      try {
        let notionTools: ToolSet = {}
        let system = SYSTEM

        // When the user attached Notion pages, open an MCP client to Notion
        // (authed per-user through Vercel Connect) and hand its tools to the
        // model so it can read those pages before building.
        if (notionSources.length > 0 && userId) {
          const label =
            notionSources.length === 1
              ? `Connecting to Notion for ${notionPageLabel(notionSources[0].url)}`
              : `Connecting to Notion for ${notionSources.length} pages`
          step("notion", label, "active")
          try {
            notionClient = await openNotionClient(userId, { callbackUrl })
            // The MCP adapter and `ai` ship structurally-identical Tool types
            // from different package copies; bridge the nominal mismatch.
            notionTools = (await notionClient.tools()) as unknown as ToolSet
            step("notion", "Connected to Notion", "done")
          } catch (err) {
            // User hasn't connected Notion yet — hand the consent URL back so
            // the UI can prompt them, rather than failing the whole build.
            if (err instanceof ConsentRequiredError) {
              step("notion", "Notion needs your permission", "error")
              emit({ type: "needs-auth", provider: "notion", authorizeUrl: err.url })
              return
            }
            console.error("notion source setup failed:", err)
            step("notion", "Couldn't reach Notion", "error")
            emit({
              type: "error",
              message:
                "Couldn't reach Notion. Make sure the Notion connector is set up and reconnect it.",
            })
            return
          }

          system = `${SYSTEM}\n\nThe user attached these Notion pages as sources:\n${notionSources
            .map((s) => `- ${s.url}`)
            .join(
              "\n",
            )}\nUse the available Notion tools to read them first, then build the board from their real content — headings become cards or text, code samples become code blocks, and so on.`
        }

        step("plan", "Planning the board", "active")
        let planning = true
        const planDone = () => {
          if (!planning) return
          planning = false
          step("plan", "Planned the board", "done")
        }

        const result = streamText({
          model: gateway(model),
          system,
          messages,
          abortSignal: req.signal,
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

        let text = ""
        let failure: string | null = null

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "tool-input-start": {
              planDone()
              step(part.id, toolLabels(part.toolName).active, "active")
              break
            }
            case "tool-call": {
              planDone()
              // Now that the arguments are complete, say what's actually being
              // built rather than just which tool is running.
              const input = part.input as { name?: string; blocks?: unknown[] } | undefined
              const count = Array.isArray(input?.blocks) ? input.blocks.length : 0
              let label = toolLabels(part.toolName).active
              if (part.toolName === "create_board" && count) {
                label = `Drafting "${input?.name ?? "board"}" — ${count} block${count === 1 ? "" : "s"}`
              } else if (part.toolName === "add_blocks" && count) {
                label = `Adding ${count} block${count === 1 ? "" : "s"}`
              }
              step(part.toolCallId, label, "active")
              break
            }
            case "tool-result": {
              const done = toolLabels(part.toolName).done
              const board = built as BuiltBoard | null
              const label =
                (part.toolName === "create_board" || part.toolName === "add_blocks") && board
                  ? `${board.name} — ${board.blocks} block${board.blocks === 1 ? "" : "s"}`
                  : done
              step(part.toolCallId, label, "done")
              break
            }
            case "tool-error": {
              if (part.error instanceof ConsentRequiredError) {
                step(part.toolCallId, "Notion needs your permission", "error")
                emit({ type: "needs-auth", provider: "notion", authorizeUrl: part.error.url })
                return
              }
              step(part.toolCallId, `${toolLabels(part.toolName).active} failed`, "error")
              break
            }
            case "text-delta": {
              planDone()
              if (!part.text) break
              text += part.text
              emit({ type: "text", delta: part.text })
              break
            }
            case "error": {
              failure = clean(part.error)
              break
            }
          }
        }

        planDone()

        if (failure) {
          emit({ type: "error", message: failure })
          return
        }

        // `built` is only ever assigned inside the tool closures above, which TS
        // control-flow analysis can't see — read it through an explicit alias so
        // it keeps its declared type instead of narrowing to `null`.
        const finalBoard = built as BuiltBoard | null

        const reply =
          text.trim() ||
          (finalBoard
            ? `Done — I built "${finalBoard.name}" with ${finalBoard.blocks} blocks.`
            : "I wasn't able to build anything from that — could you add more detail?")

        emit({
          type: "done",
          reply,
          board: finalBoard ? { ...finalBoard, url: `/board/${finalBoard.id}` } : null,
        })
      } catch (err) {
        // The client navigating away or closing the panel isn't a failure.
        if (req.signal.aborted) return
        // A Notion tool call can surface a consent requirement mid-generation.
        if (err instanceof ConsentRequiredError) {
          emit({ type: "needs-auth", provider: "notion", authorizeUrl: err.url })
          return
        }
        console.error("build-board generation failed:", err)
        emit({ type: "error", message: clean(err) })
      } finally {
        clearInterval(heartbeat)
        await notionClient?.close().catch(() => {})
        if (open) {
          open = false
          try {
            controller.close()
          } catch {
            // Already closed by a client disconnect.
          }
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": BUILD_STREAM_CONTENT_TYPE,
      "cache-control": "no-cache, no-store, no-transform",
      // Tell any buffering proxy in front of us to pass bytes straight through.
      "x-accel-buffering": "no",
    },
  })
}
