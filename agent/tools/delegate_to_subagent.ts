import { defineTool } from "eve/tools"
import { generateText } from "ai"
import { z } from "zod"
import { getConfig, isSubagentEnabled } from "../lib/session-config"

/**
 * Delegate a task to one of the agent's enabled subagents. This runs a REAL,
 * bounded specialist generation (routed through the Vercel AI Gateway) rather
 * than returning a canned string — each subagent has its own persona, system
 * prompt, and model. Only subagents the block has added are accepted, so the
 * capability stays gated per-block like every other tool.
 */
interface Persona {
  /** Human label used in the result. */
  role: string
  /** Model routed via AI Gateway. */
  model: string
  /** Specialist system prompt. */
  system: string
  /** Keep outputs bounded so the turn stays responsive. */
  maxOutputTokens: number
  temperature: number
}

const PERSONAS: Record<string, Persona> = {
  researcher: {
    role: "Researcher",
    model: "anthropic/claude-sonnet-4.5",
    system:
      "You are a meticulous research specialist. Given a task, produce a concise, well-structured briefing: " +
      "state the key facts you are confident about, list the most important considerations, and call out open " +
      "questions or unknowns. Use short markdown bullets. Do not fabricate sources or statistics — if something " +
      "requires live data you cannot access, say so explicitly. Keep it under ~200 words.",
    maxOutputTokens: 700,
    temperature: 0.3,
  },
  writer: {
    role: "Writer",
    model: "anthropic/claude-sonnet-4.5",
    system:
      "You are a skilled writing specialist. Turn the task and any provided notes into clear, polished prose. " +
      "Match the requested format (email, summary, post, etc.). Use a natural, professional voice, tight " +
      "structure, and markdown where it helps. Return only the finished piece, no preamble.",
    maxOutputTokens: 900,
    temperature: 0.7,
  },
  reviewer: {
    role: "Reviewer",
    model: "anthropic/claude-sonnet-4.5",
    system:
      "You are a critical review specialist. Evaluate the provided material for correctness, clarity, gaps, and " +
      "risks. Return concise markdown: a one-line overall assessment, then bullet points of specific issues with " +
      "concrete suggested fixes. Be direct and prioritize the most important problems. Keep it under ~200 words.",
    maxOutputTokens: 700,
    temperature: 0.2,
  },
}

export default defineTool({
  description:
    "Delegate a task to an enabled specialist subagent, which runs a real generation and returns its result. " +
    "subagent must be one of the agent's enabled subagents (e.g. researcher, writer, reviewer).",
  inputSchema: z.object({
    subagent: z.string().describe("The subagent id, e.g. researcher, writer, reviewer."),
    task: z
      .string()
      .describe("A complete, self-contained task for the subagent. It does not see the conversation history."),
  }),
  async execute({ subagent, task }) {
    const enabled = getConfig().subagents
    if (enabled.length === 0) {
      return {
        disabled: true,
        message: "No subagents are added to this agent yet. Add one from the block's edit menu.",
      }
    }
    if (!isSubagentEnabled(subagent)) {
      return {
        disabled: true,
        message: `The "${subagent}" subagent is not enabled. Enabled subagents: ${enabled.join(", ")}.`,
      }
    }

    const persona = PERSONAS[subagent]
    if (!persona) {
      return {
        disabled: true,
        message: `Unknown subagent "${subagent}". Known specialists: ${Object.keys(PERSONAS).join(", ")}.`,
      }
    }

    try {
      const { text } = await generateText({
        model: persona.model,
        system: persona.system,
        prompt: task,
        maxOutputTokens: persona.maxOutputTokens,
        temperature: persona.temperature,
      })
      return {
        subagent,
        role: persona.role,
        task,
        result: text.trim(),
      }
    } catch (err) {
      return {
        subagent,
        role: persona.role,
        task,
        error: true,
        message: `The ${persona.role} subagent failed to complete the task: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }
    }
  },
})
