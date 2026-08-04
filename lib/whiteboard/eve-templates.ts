import type { AgentFile } from "./types"

/**
 * eve agent file-tree templates.
 *
 * `AGENT_FILE_TEMPLATES` holds the selectable code templates for each file
 * inside an agent folder, keyed by the file's base name. `AGENT_STRUCTURES`
 * holds whole file-tree layouts (agent name + starting files) selectable from
 * the eve agent block's edit menu.
 *
 * A file's `name` is its path relative to the agent root and may contain
 * folders, e.g. `tools/get-weather.ts` or `skills/research/SKILL.md`. The
 * file-tree renders these as nested folders.
 */

export interface EveFileTemplate {
  id: string
  label: string
  description: string
  code: string
}

// --- reusable file bodies -------------------------------------------------

const AGENT_BASIC = `import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-5.4-mini",
});`

const AGENT_ADVANCED = `import { defineAgent } from "eve";

export default defineAgent({
  name: "eve-agent",
  model: "openai/gpt-5.4-mini",
  fallbackModel: "anthropic/claude-sonnet-4.5",
  temperature: 0.7,
  maxOutputTokens: 4096,
  maxSteps: 12,
  tools: ["./tools"],
  skills: ["./skills"],
});`

const AGENT_WEATHER = `import { defineAgent } from "eve";

export default defineAgent({
  name: "weather-assistant",
  model: "openai/gpt-5.4-mini",
  tools: ["./tools"],
});`

const INSTRUCTIONS_BASIC = `# eve-agent

You are eve-agent, a helpful AI assistant.

## Guidelines
- Be clear, concise, and friendly.
- Ask a clarifying question when a request is ambiguous.
- Prefer using your tools over guessing.`

const INSTRUCTIONS_WEATHER = `# weather-assistant

You are a friendly weather assistant.

## Guidelines
- Use the \`get_weather\` tool to look up live conditions.
- Always state the city and units in your answer.
- If the user doesn't give a city, ask which one they mean.
- Keep replies to two short sentences.`

const TOOL_GET_WEATHER = `// This is a "tool" the assistant can use to look up the weather for any place you name.
// Live data from wttr.in — free, no API key and no signup. The URL path is the
// place: wttr.in/tokyo, wttr.in/94103, wttr.in/SFO. "format=j1" asks for JSON.
import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    const url = \`https://wttr.in/\${encodeURIComponent(city)}?format=j1\`;
    const res = await fetch(url);
    const data = await res.json();
    const now = data.current_condition[0];
    return {
      city,
      region: data.nearest_area[0].region[0].value,
      condition: now.weatherDesc[0].value.trim(),
      temperatureC: Number(now.temp_C),
      temperatureF: Number(now.temp_F),
      humidity: Number(now.humidity),
      windKph: Number(now.windspeedKmph),
      source: "wttr.in",
    };
  },
});`

// --- general-purpose tools (useful in any eve agent) ----------------------

// Fetch a URL and return its text — a universal building block for research,
// scraping, and API calls.
const TOOL_FETCH_URL = `import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Fetch a URL and return its text content.",
  inputSchema: z.object({ url: z.string().url() }),
  async execute({ url }) {
    const res = await fetch(url);
    return { status: res.status, body: await res.text() };
  },
});`

// Run a shell command in the agent's sandbox — lets the model inspect files,
// run scripts, and use CLI tools.
const TOOL_RUN_COMMAND = `import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Run a shell command in the sandbox.",
  inputSchema: z.object({ command: z.string() }),
  async execute({ command }, { sandbox }) {
    const { stdout, stderr } = await sandbox.exec(command);
    return { stdout, stderr };
  },
});`

// The current date and time — grounds the model, which has no live clock.
const TOOL_NOW = `import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Get the current date and time (ISO 8601, UTC).",
  inputSchema: z.object({}),
  async execute() {
    return { now: new Date().toISOString() };
  },
});`

// Simple key/value memory so the agent can remember facts across turns.
const TOOL_REMEMBER = `import { defineTool } from "eve/tools";
import { z } from "zod";

const memory = new Map<string, string>();

export default defineTool({
  description: "Store or recall a value by key. Omit value to recall.",
  inputSchema: z.object({ key: z.string(), value: z.string().optional() }),
  async execute({ key, value }) {
    if (value !== undefined) memory.set(key, value);
    return { key, value: memory.get(key) ?? null };
  },
});`

// A safe arithmetic evaluator — LLMs are unreliable at exact math.
const TOOL_CALCULATE = `import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Evaluate a basic arithmetic expression (e.g. \\"3 * (4 + 5)\\").",
  inputSchema: z.object({ expression: z.string() }),
  async execute({ expression }) {
    if (!/^[0-9+\\-*/().\\s]+$/.test(expression)) throw new Error("Invalid expression");
    return { result: Function(\`return (\${expression})\`)() };
  },
});`

// A packaged skill — a SKILL.md with a description the model routes on, loaded
// into context on demand. https://eve.dev/docs/skills
const SKILL_RESEARCH = `---
description: Research unfamiliar topics before answering with confidence.
---

When the task is novel or ambiguous, gather evidence first, then answer with
the key facts and the remaining uncertainty.`

// Keeps replies short and scannable.
const SKILL_CONCISE = `---
description: Answer concisely — lead with the result, then the why.
---

Lead with the direct answer in one sentence. Add supporting detail only if it
changes the decision. Prefer bullet points over paragraphs. Never pad.`

// Turns rough notes into a tidy summary.
const SKILL_SUMMARIZE = `---
description: Summarize long inputs into a structured brief.
---

Produce: a one-line TL;DR, 3-5 key points, and any action items. Preserve
names, numbers, and dates exactly. Omit filler and repetition.`

// Adds a citation discipline to any answer.
const SKILL_CITE = `---
description: Cite sources for every factual claim.
---

After each claim that came from a tool or document, add a bracketed source like
[source: url or file]. If a claim has no source, say so plainly instead.`

// The sandbox is the agent's isolated bash environment rooted at /workspace.
// Override it to seed files, pick a backend, or lock down egress.
// https://eve.dev/docs/sandbox
const SANDBOX = `import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  async onSession({ use }) {
    await use({ networkPolicy: "deny-all" });
  },
});`

// A sandbox that lets the agent actually build things: full egress so it can
// install packages, fetch dependencies, and reach the AI Gateway while it codes
// in /workspace. Use this when the agent needs to write files & run commands.
// https://eve.dev/docs/sandbox
const SANDBOX_OPEN = `import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  async onSession({ use }) {
    // "allow-all" is the default — the agent can reach the network to install
    // packages and fetch dependencies while it works in /workspace.
    await use({ networkPolicy: "allow-all" });
  },
});`

// The eve channel is the default HTTP API for the agent (sessions + streaming).
// https://eve.dev/docs/channels
const CHANNEL_EVE = `import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

export default eveChannel({
  auth: [localDev(), vercelOidc()],
});`

// Slack: mentions, DMs & interactive components, credentials via Vercel Connect.
// https://eve.dev/docs/channels/slack
const CHANNEL_SLACK = `import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

export default slackChannel({
  credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/my-agent"),
});`

// Discord: server messages & slash commands.
const CHANNEL_DISCORD = `import { connectDiscordCredentials } from "@vercel/connect/eve";
import { discordChannel } from "eve/channels/discord";

export default discordChannel({
  credentials: connectDiscordCredentials(process.env.DISCORD_CONNECTOR ?? "discord/my-agent"),
});`

// Telegram: bot chats & groups.
const CHANNEL_TELEGRAM = `import { connectTelegramCredentials } from "@vercel/connect/eve";
import { telegramChannel } from "eve/channels/telegram";

export default telegramChannel({
  credentials: connectTelegramCredentials(process.env.TELEGRAM_CONNECTOR ?? "telegram/my-agent"),
});`

// Twilio: SMS & voice-transcribed phone calls.
const CHANNEL_TWILIO = `import { connectTwilioCredentials } from "@vercel/connect/eve";
import { twilioChannel } from "eve/channels/twilio";

export default twilioChannel({
  credentials: connectTwilioCredentials(process.env.TWILIO_CONNECTOR ?? "twilio/my-agent"),
});`

// A connection wires the agent into an external MCP server. The model calls its
// tools by qualified name (e.g. linear__list_issues). https://eve.dev/docs/connections
const CONNECTION_LINEAR = `import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description: "Linear workspace: issues, projects, cycles, and comments.",
  auth: connect("linear/myagent"),
});`

// A declared subagent is a specialist with its own directory. Its agent.ts must
// export a description the parent reads to delegate. https://eve.dev/docs/subagents
const SUBAGENT_RESEARCHER = `import { defineAgent } from "eve";

export default defineAgent({
  description: "Investigate ambiguous questions before the parent agent responds.",
  model: "anthropic/claude-opus-4.8",
});`

// A subagent that turns findings into polished prose.
const SUBAGENT_WRITER = `import { defineAgent } from "eve";

export default defineAgent({
  description: "Turn notes and findings into clear, well-structured prose.",
  model: "anthropic/claude-opus-4.8",
});`

// A subagent that reviews work for correctness before it ships.
const SUBAGENT_REVIEWER = `import { defineAgent } from "eve";

export default defineAgent({
  description: "Review the parent's draft for errors, gaps, and unclear claims.",
  model: "anthropic/claude-opus-4.8",
});`

// A schedule starts the agent on a cron cadence. Markdown form is fire-and-forget.
// https://eve.dev/docs/schedules
const SCHEDULE_DAILY = `import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 9 * * 1-5",
  markdown: "Summarize yesterday's open issues and post them to the team channel.",
});`

const AGENT_ALL = `import { defineAgent } from "eve";

export default defineAgent({
  name: "all-agent",
  model: "openai/gpt-5.4-mini",
  tools: ["./tools"],
  skills: ["./skills"],
});`

// --- web developer agent --------------------------------------------------

// A coding agent tuned to build polished, static HTML sites in its sandbox.
const AGENT_WEBDEV = `import { defineAgent } from "eve";

export default defineAgent({
  name: "web-developer",
  // Haiku 4.5: fast token generation so sites stream in quickly.
  model: "anthropic/claude-haiku-4.5",
  tools: ["./tools"],
  skills: ["./skills"],
  // Building a full site takes several file writes.
  maxSteps: 40,
});`

const INSTRUCTIONS_WEBDEV = `# web-developer

You are a senior front-end engineer who ships polished, production-quality
static websites in the visual style of Vercel.

## How you work
- Do all of your work in the sandbox under \`/workspace\`.
- Create and edit files with \`write_file\`; inspect them with \`read_file\`.
- Everything must live in ONE self-contained \`index.html\` — inline \`<style>\`
  and inline \`<script>\`. The preview opens this single file directly, so linked
  external \`.css\`/\`.js\` files will NOT load. Keep it dependency-light.
- Do NOT start a local web server (no \`python -m http.server\`, no \`npx serve\`,
  no \`cd\` into a server, etc.). The operator previews the site by clicking the
  "Open site" button on the sandbox, which opens your \`index.html\` in a new
  tab — so there is nothing to serve. Spinning up a server only wastes steps.

## Build incrementally — this is important for fast feedback
Do NOT try to emit the entire finished site in one massive \`write_file\`. A huge
single write means nothing is visible until the whole file finishes generating,
which feels like a long hang. Instead, grow \`index.html\` in stages:
1. FIRST, write a SHORT but complete \`index.html\`: doctype, \`<head>\` with an
   inline \`<style>\` holding your base tokens (font, colors, max-width container)
   and a header/nav plus a hero section with the real headline. Keep this first
   write small so it lands within a couple of seconds — this opens the preview
   and the operator immediately sees a working page.
2. THEN rewrite the full \`index.html\` to add the remaining sections (features,
   pricing, footer, etc.), building on what you already wrote. Each write
   updates the live preview, so progress streams in visibly.

## Narrate as you go — keep the operator informed
The operator watches a live chat while you work, and while a file is being
written they see nothing until it lands. So ALWAYS type a short one-line status
BEFORE every tool call describing what you're about to do — e.g. "Scaffolding
the page shell and hero…", then "Adding the features and pricing sections…",
then "Wiring up the mobile nav…". These lines stream in instantly and tell the
operator exactly what's happening. Keep them to a single concise sentence; do
not narrate code or paste markup.
- After you finish, briefly summarize what you built and tell the operator to
  click "Open site" to preview. Do not paste the full file back into the chat.

## Consult your design skill
Follow the \`vercel-web-design\` skill for the aesthetic: type scale, spacing,
color, and layout. Match it closely on every page.`

// A packaged skill describing the Vercel / Geist visual language so the agent
// produces consistent, on-brand sites. https://eve.dev/docs/skills
const SKILL_WEB_DESIGN = `---
description: Design polished static sites in the Vercel (Geist) visual style.
---

Build clean, high-contrast, content-first pages that feel like vercel.com.

## Type
- Use the Geist font family (fall back to system \`-apple-system, Segoe UI, sans-serif\`).
- Big, tight headings (font-weight 600-700, letter-spacing -0.02em). Generous
  line-height (1.5-1.6) for body copy. Never smaller than 14px for body text.

## Color
- Near-black text (#000 / #111) on white, or white on near-black for dark mode.
- One restrained accent at most. Lean on neutrals and plenty of whitespace.
- Use subtle 1px borders (#eaeaea light / #333 dark) instead of heavy shadows.

## Layout
- Center content in a max-width container (~1100px) with comfortable padding.
- Use CSS grid/flex, a sticky minimal header, and clear vertical rhythm.
- Rounded corners (8-12px), smooth hover transitions, and accessible focus rings.

## Quality bar
- Fully responsive (mobile-first), semantic HTML, and good contrast.
- No lorem-ipsum sprawl — write concise, real-sounding copy.
- Keep everything in one self-contained \`index.html\` (inline \`<style>\`/\`<script>\`)
  so it previews in a new tab. Never start a local server to preview it.
- Build it up in stages: a short, complete skeleton first (so it previews within
  seconds), then expand the same file — never one giant write.`

// --- per-file templates (keyed by base file name) -------------------------

export const AGENT_FILE_TEMPLATES: Record<string, EveFileTemplate[]> = {
  "agent.ts": [
    { id: "agent-basic", label: "Basic", description: "Minimal agent — just a model", code: AGENT_BASIC },
    { id: "agent-advanced", label: "Advanced", description: "Fallback model, temperature & tools", code: AGENT_ADVANCED },
  ],
  "instructions.md": [
    { id: "instructions-basic", label: "Basic", description: "General assistant prompt", code: INSTRUCTIONS_BASIC },
    { id: "instructions-weather", label: "Weather", description: "Weather assistant prompt", code: INSTRUCTIONS_WEATHER },
  ],
  "get_weather.ts": [
    { id: "tool-weather", label: "Weather", description: "Calls wttr.in — free, no API key", code: TOOL_GET_WEATHER },
  ],
  "SKILL.md": [
    { id: "skill-research", label: "Research", description: "A model-loadable procedure", code: SKILL_RESEARCH },
  ],
  "sandbox.ts": [
    { id: "sandbox-open", label: "Build mode", description: "Full egress — install, fetch & code", code: SANDBOX_OPEN },
    { id: "sandbox-basic", label: "Locked down", description: "Isolated bash env, egress denied", code: SANDBOX },
  ],
  "eve.ts": [
    { id: "channel-eve", label: "Terminal", description: "Local terminal-style chat via the eve CLI", code: CHANNEL_EVE },
  ],
  "linear.ts": [
    { id: "connection-linear", label: "Linear", description: "MCP connection via Vercel Connect", code: CONNECTION_LINEAR },
  ],
  "daily.ts": [
    { id: "schedule-daily", label: "Daily", description: "Cron-triggered fire-and-forget run", code: SCHEDULE_DAILY },
  ],
}

// --- whole file-tree structures -------------------------------------------

export interface EveStructureTemplate {
  id: string
  label: string
  description: string
  agentName: string
  files: AgentFile[]
}

export const AGENT_STRUCTURES: EveStructureTemplate[] = [
  {
    id: "starter",
    label: "Starter agent",
    description: "agent.ts + instructions.md + a terminal channel",
    agentName: "eve-agent",
    files: [
      { name: "agent.ts", codeTheme: "dark", code: AGENT_BASIC },
      { name: "instructions.md", codeTheme: "dark", code: INSTRUCTIONS_BASIC },
      // The default eve channel ships enabled so the agent is reachable from a
      // terminal-style chat the moment it's added.
      { name: "channels/eve.ts", codeTheme: "dark", code: CHANNEL_EVE },
    ],
  },
  {
    id: "weather",
    label: "Weather assistant",
    description: "A tool that calls wttr.in — free, no API key",
    agentName: "weather-assistant",
    files: [
      { name: "agent.ts", codeTheme: "dark", code: AGENT_WEATHER },
      { name: "instructions.md", codeTheme: "dark", code: INSTRUCTIONS_WEATHER },
      { name: "tools/get_weather.ts", codeTheme: "dark", code: TOOL_GET_WEATHER },
      // Ship the default eve channel so the weather assistant is reachable from
      // a terminal-style chat the moment it's added, like the other templates.
      { name: "channels/eve.ts", codeTheme: "dark", code: CHANNEL_EVE },
    ],
  },
  {
    id: "all",
    label: "All",
    description: "One folder per capability: tools, skills, sandbox, channels, connections, subagents & schedules",
    agentName: "all-agent",
    files: [
      { name: "agent.ts", codeTheme: "dark", code: AGENT_ALL },
      { name: "instructions.md", codeTheme: "dark", code: INSTRUCTIONS_BASIC },
      { name: "tools/get_weather.ts", codeTheme: "dark", code: TOOL_GET_WEATHER },
      { name: "skills/research/SKILL.md", codeTheme: "dark", code: SKILL_RESEARCH },
      { name: "sandbox/sandbox.ts", codeTheme: "dark", code: SANDBOX },
      { name: "channels/eve.ts", codeTheme: "dark", code: CHANNEL_EVE },
      { name: "connections/linear.ts", codeTheme: "dark", code: CONNECTION_LINEAR },
      { name: "subagents/researcher/agent.ts", codeTheme: "dark", code: SUBAGENT_RESEARCHER },
      { name: "schedules/daily.ts", codeTheme: "dark", code: SCHEDULE_DAILY },
    ],
  },
  {
    id: "webdev",
    label: "Web developer",
    description: "Builds polished HTML sites in the Vercel style — skill, tool & build-mode sandbox",
    agentName: "web-developer",
    files: [
      { name: "agent.ts", codeTheme: "dark", code: AGENT_WEBDEV },
      { name: "instructions.md", codeTheme: "dark", code: INSTRUCTIONS_WEBDEV },
      { name: "tools/fetch_url.ts", codeTheme: "dark", code: TOOL_FETCH_URL },
      { name: "skills/vercel-web-design/SKILL.md", codeTheme: "dark", code: SKILL_WEB_DESIGN },
      { name: "sandbox/sandbox.ts", codeTheme: "dark", code: SANDBOX_OPEN },
      { name: "channels/eve.ts", codeTheme: "dark", code: CHANNEL_EVE },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Start minimal, then add capabilities yourself",
    agentName: "eve-agent",
    files: [
      { name: "agent.ts", codeTheme: "dark", code: AGENT_BASIC },
      { name: "instructions.md", codeTheme: "dark", code: INSTRUCTIONS_BASIC },
    ],
  },
]

// --- add-capability catalog (for the "Custom" agent) ----------------------
//
// The custom agent's edit menu lets you add capabilities file-by-file. Each
// category maps to an eve agent sub-folder; picking an option appends that
// file to the tree. Only channels are wired up for now.

export interface EveAddOption {
  id: string
  label: string
  description: string
  file: string // path relative to the agent root, e.g. "channels/slack.ts"
  code: string
}

export interface EveAddCategory {
  id: string
  label: string
  description: string
  options: EveAddOption[]
  // When true, only one option in the category can be active at a time. Picking
  // a different option replaces the current one (e.g. an agent has one sandbox).
  exclusive?: boolean
}

export const EVE_ADD_CATEGORIES: EveAddCategory[] = [
  {
    id: "tools",
    label: "Tools",
    description: "Capabilities the model can call",
    options: [
      { id: "fetch-url", label: "Fetch URL", description: "Read any web page or API", file: "tools/fetch_url.ts", code: TOOL_FETCH_URL },
      { id: "run-command", label: "Run command", description: "Shell access in the sandbox", file: "tools/run_command.ts", code: TOOL_RUN_COMMAND },
      { id: "now", label: "Current time", description: "Ground the model with the clock", file: "tools/now.ts", code: TOOL_NOW },
      { id: "remember", label: "Memory", description: "Recall facts across turns", file: "tools/remember.ts", code: TOOL_REMEMBER },
      { id: "calculate", label: "Calculator", description: "Exact arithmetic", file: "tools/calculate.ts", code: TOOL_CALCULATE },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    description: "Loadable instructions the model routes on",
    options: [
      { id: "research", label: "Research", description: "Gather evidence before answering", file: "skills/research/SKILL.md", code: SKILL_RESEARCH },
      { id: "concise", label: "Concise", description: "Short, result-first replies", file: "skills/concise/SKILL.md", code: SKILL_CONCISE },
      { id: "summarize", label: "Summarize", description: "Structured briefs from long input", file: "skills/summarize/SKILL.md", code: SKILL_SUMMARIZE },
      { id: "cite", label: "Cite sources", description: "Back every claim with a source", file: "skills/cite/SKILL.md", code: SKILL_CITE },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    description: "Where the agent is reachable",
    options: [
      { id: "terminal", label: "Terminal", description: "Local terminal-style chat via the eve CLI", file: "channels/eve.ts", code: CHANNEL_EVE },
      { id: "slack", label: "Slack", description: "Mentions, DMs & buttons", file: "channels/slack.ts", code: CHANNEL_SLACK },
      { id: "discord", label: "Discord", description: "Server messages & slash commands", file: "channels/discord.ts", code: CHANNEL_DISCORD },
      { id: "telegram", label: "Telegram", description: "Bot chats & groups", file: "channels/telegram.ts", code: CHANNEL_TELEGRAM },
      { id: "twilio", label: "Twilio", description: "SMS & voice calls", file: "channels/twilio.ts", code: CHANNEL_TWILIO },
    ],
  },
  {
    id: "subagents",
    label: "Subagents",
    description: "Specialists the agent can delegate to",
    options: [
      { id: "researcher", label: "Researcher", description: "Investigates ambiguous questions", file: "subagents/researcher/agent.ts", code: SUBAGENT_RESEARCHER },
      { id: "writer", label: "Writer", description: "Turns notes into polished prose", file: "subagents/writer/agent.ts", code: SUBAGENT_WRITER },
      { id: "reviewer", label: "Reviewer", description: "Checks drafts for errors & gaps", file: "subagents/reviewer/agent.ts", code: SUBAGENT_REVIEWER },
    ],
  },
  {
    id: "sandbox",
    label: "Sandbox",
    description: "The agent's isolated bash environment",
    // An agent has exactly one sandbox — picking a mode replaces the other.
    exclusive: true,
    options: [
      { id: "build-mode", label: "Build mode", description: "Full egress — install, fetch & code", file: "sandbox/sandbox.ts", code: SANDBOX_OPEN },
      { id: "locked-down", label: "Locked down", description: "Isolated bash env, egress denied", file: "sandbox/sandbox.ts", code: SANDBOX },
    ],
  },
]

// --- channel identity + "send message" UI metadata -----------------------
//
// Each channel a custom agent adds surfaces as a brand logo beside the agent
// block; clicking it opens a channel-branded message composer. This maps a
// channel id to its file path, logo, brand accent, and composer chrome.

export interface EveChannelMeta {
  id: string
  label: string
  file: string // path in the tree, e.g. "channels/slack.ts"
  logo?: string // public logo path (brand channels only)
  accent: string // brand color
  surface: "dark" | "light" | "terminal"
  header: string // conversation header shown in the composer
  placeholder: string // message input placeholder
}

export const EVE_CHANNELS: EveChannelMeta[] = [
  { id: "terminal", label: "Terminal", file: "channels/eve.ts", accent: "#3ecf8e", surface: "terminal", header: "eve — agent", placeholder: "Type a message and press enter" },
  { id: "slack", label: "Slack", file: "channels/slack.ts", logo: "/logos/slack.svg", accent: "#611f69", surface: "light", header: "#eve-agent", placeholder: "Message #eve-agent" },
  { id: "discord", label: "Discord", file: "channels/discord.ts", logo: "/logos/discord.svg", accent: "#5865f2", surface: "dark", header: "# general", placeholder: "Message #general" },
  { id: "telegram", label: "Telegram", file: "channels/telegram.ts", logo: "/logos/telegram.svg", accent: "#229ed9", surface: "light", header: "eve bot", placeholder: "Write a message…" },
  { id: "twilio", label: "Twilio", file: "channels/twilio.ts", logo: "/logos/twilio.svg", accent: "#f22f46", surface: "light", header: "SMS · +1 (555) 010-4477", placeholder: "Text message" },
]

/** The channels currently present in an agent's file list, in catalog order. */
export function channelsForFiles(files: { name: string }[]): EveChannelMeta[] {
  const names = new Set(files.map((f) => f.name))
  return EVE_CHANNELS.filter((c) => names.has(c.file))
}

export function channelById(id: string | undefined): EveChannelMeta | undefined {
  return EVE_CHANNELS.find((c) => c.id === id)
}
