import { gateway, streamText, stepCountIs, tool, type ToolSet } from "ai"
import { z } from "zod"
import type { MCPClient } from "@ai-sdk/mcp"
import * as boards from "@/lib/boards/service"
import {
  LayoutError,
  PlanRejectedError,
  boardPlanSchema,
  buildBoard,
  describeBoard,
  isStyleId,
  stylePack,
  type StyleId,
} from "@/lib/boards/engine"
import { boardExtensionSchema } from "@/lib/boards/engine/plan"
import { loadStyleSkill } from "@/lib/boards/engine/skills"
import { openNotionClient, ConsentRequiredError } from "@/lib/connections/notion"
import { getCurrentUser } from "@/lib/auth"
import {
  BUILD_STREAM_CONTENT_TYPE,
  type BuildEvent,
  type BuildStepStatus,
} from "@/lib/ai/build-events"

// Chat endpoint that builds Canvas boards from a natural-language conversation.
//
// The model authors a semantic PLAN — sections, each with a layout primitive and
// a list of items — and the structure engine in lib/boards/engine turns that into
// canvas elements. The model never sees a coordinate, a width, a color or a font
// size, which is what makes two boards built in the same style actually look like
// each other.
//
// The style is chosen by the user in the builder UI, not inferred here. It
// selects both the engine's style pack (the geometry and the design tokens) and
// the authoring skill appended to the system prompt (how to compose a plan for
// that look), so the guidance the model gets and the rules the engine enforces
// are always the same style.
//
// The response is an NDJSON stream of `BuildEvent`s (lib/ai/build-events.ts).
// Reading a Notion page and drafting a plan routinely takes a minute or more; a
// buffered JSON response spends that whole time silent, which reads as a hang and
// gives intermediaries every reason to cut the connection.
//
// Auth: the AI Gateway provider reads AI_GATEWAY_API_KEY when set and otherwise
// falls back to the Vercel OIDC token (VERCEL_OIDC_TOKEN, pulled by `vercel dev`
// / injected automatically on Vercel) — so no key wiring is needed here.

export const maxDuration = 300

const HEARTBEAT_MS = 10_000

/** The part of the prompt that is true regardless of style. */
function baseSystem(style: StyleId): string {
  const pack = stylePack(style)
  return `You are the board-building assistant for Canvas, an infinite whiteboard for software architecture diagrams, flows, write-ups and product demos. The user describes what they want (and may attach source pages); you build it by calling a tool. Reply in one short sentence — the board is the deliverable.

YOU DO NOT LAY ANYTHING OUT. A structure engine owns every coordinate, size, colour, font and connector on the board. You author a semantic plan: a title and a handful of sections, each with a layout primitive and a list of items. There is no way to express a position, and no reason to want one — get the content and the relationships right and the board comes out laid out correctly and consistently.

The user has chosen the ${pack.label} style for this board: ${pack.blurb} Author for that style specifically — the guidance below is not general advice, it is what this style is.

If a tool rejects your plan it tells you exactly what to change. Fix that specific thing and call the tool again. Do not apologise at length and do not fall back to a worse board.

When a board already exists in this conversation, extend it with extend_board unless the user asks for a brand-new one.

──────────────────────────────────────────
${loadStyleSkill(style)}`
}

const createBoardInput = z.object({
  name: z.string().describe("Board name shown in the boards grid."),
  plan: boardPlanSchema,
})

const extendBoardInput = z.object({
  plan: boardExtensionSchema,
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
      return { active: "Planning the board", done: "Board created" }
    case "extend_board":
      return { active: "Planning more sections", done: "Sections added" }
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
    style?: string
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
  // The style drives both the engine's geometry and the model's instructions, so
  // there is no sensible default to fall back to — the caller picks it.
  if (!isStyleId(body.style)) {
    return Response.json({ error: "A board style is required." }, { status: 400 })
  }
  const style = body.style

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

      // Adjustments the engine made on the model's behalf, surfaced once at the
      // end rather than as noise mid-build.
      const notes: string[] = []

      try {
        let notionTools: ToolSet = {}
        let system = baseSystem(style)

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

          system = `${system}\n\n──────────────────────────────────────────\nThe user attached these Notion pages as sources:\n${notionSources
            .map((s) => `- ${s.url}`)
            .join(
              "\n",
            )}\nUse the available Notion tools to read them first, then build the board from their real content. Map what you find onto the item kinds above — a code sample is a \`code\` item, a shell transcript is \`terminal\`, a list is \`bullets\`, a paragraph is \`prose\`, an image URL is \`image\`. Never invent content the page doesn't contain.`
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
          // Extra steps when Notion tools are in play: read the page(s), then
          // build. The budget also has to leave room for one retry after a
          // guard rejects a plan, which is the whole point of those messages.
          stopWhen: stepCountIs(notionSources.length > 0 ? 10 : 6),
          tools: {
            ...notionTools,
            create_board: tool({
              description:
                "Create a new Canvas board from a plan. Use this for the first board in the conversation, or when the user asks for a brand-new one.",
              inputSchema: createBoardInput,
              execute: async ({ name, plan }) => {
                try {
                  const result = buildBoard(plan, style)
                  const id = await boards.createBoardFromData(name, {
                    elements: result.elements,
                    camera: { x: 0, y: 0, zoom: 1 },
                  })
                  currentBoardId = id
                  built = { id, name, blocks: result.elements.length }
                  notes.push(...result.warnings)
                  return `Created board "${name}" — ${describeBoard(result.elements)}. Done; do not call another tool.`
                } catch (err) {
                  if (err instanceof PlanRejectedError) {
                    return `Plan rejected: ${err.message} Revise the plan and call create_board again.`
                  }
                  if (err instanceof LayoutError) {
                    return `The plan could not be laid out: ${err.message} Try fewer items per section.`
                  }
                  throw err
                }
              },
            }),
            extend_board: tool({
              description:
                "Append sections to the board already being built in this conversation. New sections flow in below the existing content.",
              inputSchema: extendBoardInput,
              execute: async ({ plan }) => {
                if (!currentBoardId) {
                  return "No board exists yet — call create_board first."
                }
                const board = await boards.getBoard(currentBoardId)
                if (!board) return "The board no longer exists — call create_board to make a new one."
                try {
                  const result = buildBoard({ title: "", ...plan }, style, {
                    existing: board.data.elements,
                    includeTitle: false,
                  })
                  await boards.saveBoard(currentBoardId, {
                    data: {
                      ...board.data,
                      elements: [...board.data.elements, ...result.elements],
                    },
                  })
                  const total = board.data.elements.length + result.elements.length
                  built = { id: currentBoardId, name: board.name, blocks: total }
                  notes.push(...result.warnings)
                  return `Added ${result.elements.length} elements to "${board.name}" (now ${total}). Done; do not call another tool.`
                } catch (err) {
                  if (err instanceof PlanRejectedError) {
                    return `Plan rejected: ${err.message} Revise the sections and call extend_board again.`
                  }
                  if (err instanceof LayoutError) {
                    return `The sections could not be laid out: ${err.message} Try fewer items per section.`
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
              const input = part.input as
                | { name?: string; plan?: { sections?: unknown[] } }
                | undefined
              const sections = Array.isArray(input?.plan?.sections) ? input.plan.sections.length : 0
              let label = toolLabels(part.toolName).active
              if (part.toolName === "create_board" && sections) {
                label = `Laying out "${input?.name ?? "board"}" — ${sections} section${sections === 1 ? "" : "s"}`
              } else if (part.toolName === "extend_board" && sections) {
                label = `Laying out ${sections} more section${sections === 1 ? "" : "s"}`
              }
              step(part.toolCallId, label, "active")
              break
            }
            case "tool-result": {
              const done = toolLabels(part.toolName).done
              const board = built as BuiltBoard | null
              const label =
                (part.toolName === "create_board" || part.toolName === "extend_board") && board
                  ? `${board.name} — ${board.blocks} element${board.blocks === 1 ? "" : "s"}`
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

        let reply =
          text.trim() ||
          (finalBoard
            ? `Done — I built "${finalBoard.name}" in the ${stylePack(style).label} style.`
            : "I wasn't able to build anything from that — could you add more detail?")

        // Surface what the engine changed on the model's behalf, deduped: a
        // dropped connector or a remapped layout is worth knowing about.
        if (finalBoard && notes.length > 0) {
          reply = `${reply}\n\n${[...new Set(notes)].map((n) => `· ${n}`).join("\n")}`
        }

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
