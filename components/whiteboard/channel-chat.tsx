"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useEveAgent } from "eve/react"
import { SendHorizontal, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { EveChannelMeta } from "@/lib/whiteboard/eve-templates"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { makeSandboxElement, SANDBOX_WIDTH, SANDBOX_GAP } from "@/lib/whiteboard/factory"
import type { SandboxRun, SandboxFile } from "@/lib/whiteboard/types"
import { buildAgentMessage, configFromFiles, CONFIG_MARKER } from "@/lib/whiteboard/agent-chat"
import { ScrollBox } from "@/components/whiteboard/scroll-box"

/**
 * Channel UI blocks get a larger footprint on the canvas (see the block width in
 * canvas-element.tsx and the factory defaults) so there's room for a real
 * conversation — but the chrome inside (text, logos, padding, icons) stays at
 * its natural size. `s()` is therefore an identity passthrough: it keeps the
 * per-dimension call sites readable while rendering everything 1:1.
 */
export const CHANNEL_UI_SCALE = 2.5
export const s = (n: number) => n

interface Palette {
  bg: string
  border: string
  textColor: string
  mutedColor: string
  inputBg: string
  inputBorder: string
  bubbleBg: string
}

/** Remove the operator-config marker line so it never shows in a chat bubble. */
function stripMarker(text: string): string {
  if (!text.includes(CONFIG_MARKER)) return text
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(CONFIG_MARKER))
    .join("\n")
    .trim()
}

/**
 * A live chat wired to the real eve agent. Each turn it sends the parent block's
 * current capability configuration, so the agent only calls tools that have been
 * added to that block. Rendered inside a channel-branded composer.
 */
export function ChannelChat({
  channel,
  parentId,
  selfId,
  palette,
}: {
  channel: EveChannelMeta
  parentId: string | undefined
  selfId: string
  palette: Palette
}) {
  const { bg, border, textColor, mutedColor, inputBg, inputBorder, bubbleBg } = palette
  // The terminal channel renders a distinct, monospace, prompt-driven UI instead
  // of the chat-bubble layout the other channels use.
  const terminal = channel.surface === "terminal"
  const mono = "var(--font-mono, monospace)"

  // The parent file-tree's files drive the operator configuration.
  const files = useWhiteboard((st) => {
    const proj = st.projects.find((p) => p.id === st.currentId) ?? st.projects[0]
    return proj.elements.find((e) => e.id === parentId)?.files
  })
  const config = useMemo(() => configFromFiles(files), [files])

  const { data, status, send, stop, error } = useEveAgent()
  const [input, setInput] = useState("")
  const busy = status === "submitted" || status === "streaming"
  const scrollRef = useRef<HTMLDivElement>(null)

  // Deleting the eve agent block cascades and unmounts this component. On
  // unmount we `stop()`, which aborts the in-flight request stream and cancels
  // the running agent turn on the server — so the sandbox stops executing
  // instead of continuing to run against an orphaned block.
  //
  // We deliberately do NOT `reset()` here: reset only clears local client state
  // (it makes no server call and ends nothing extra), and that state is thrown
  // away on unmount anyway. An already-idle sandbox can't be force-killed from
  // the client — eve reclaims it on its inactivity timeout. Reopening the block
  // mounts a fresh session, so the next run provisions a brand-new sandbox.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    return () => stopRef.current()
  }, [])

  const messages = data?.messages ?? []

  // Show a "Thinking…" indicator whenever the agent is working but hasn't put
  // any visible assistant text on screen yet (covers submitted, tool calls, and
  // the gap before the first streamed token).
  const lastMessage = messages[messages.length - 1]
  const lastAssistantText =
    lastMessage?.role === "assistant"
      ? lastMessage.parts.some((p) => p.type === "text" && p.text.trim().length > 0)
      : false
  const showThinkingBase = busy && !lastAssistantText

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, status])

  const submit = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput("")
    void send({ message: buildAgentMessage(text, config) })
  }

  // Collect all sandbox activity from the live session, oldest first. eve's
  // built-in harness exposes `bash` (shell) plus `write_file`/`read_file`
  // (filesystem); we also support our custom `run_command` tool. Shell calls
  // become terminal "runs"; file calls populate the sandbox file tree.
  const { runs, sandboxFiles, sandboxIntent, sandboxReady } = useMemo(() => {
    const runsOut: SandboxRun[] = []
    const fileMap = new Map<string, SandboxFile>()
    // `intent`: the agent has invoked a sandbox tool (in any state, even before
    // output) — i.e. it decided it needs a sandbox. `ready`: at least one
    // sandbox tool has actually COMPLETED. The gap between the two is the real
    // sandbox spin-up window (eve opens the backend while the first tool runs),
    // which is what the "sandbox · starting…" chip covers. We can't key the chip
    // off captured files because a streaming `write_file` exposes its filePath
    // (and thus a file) before the sandbox has finished opening.
    let intent = false
    let ready = false
    const SANDBOX_TOOLS = new Set(["bash", "run_command", "write_file", "read_file"])
    for (const m of messages) {
      if (m.role !== "assistant") continue
      for (const p of m.parts) {
        if (p.type !== "dynamic-tool") continue
        const done = p.state === "output-available" || p.state === "output-error"
        if (SANDBOX_TOOLS.has(p.toolName)) {
          intent = true
          if (done) ready = true
        }
        const inp = "input" in p ? (p.input as Record<string, unknown>) : undefined
        const outp = "output" in p ? (p.output as Record<string, unknown>) : undefined
        const running = p.state !== "output-available" && p.state !== "output-error"

        if (p.toolName === "bash" || p.toolName === "run_command") {
          runsOut.push({
            id: p.toolCallId,
            command: typeof inp?.command === "string" ? inp.command : "",
            stdout: typeof outp?.stdout === "string" ? outp.stdout : "",
            stderr: typeof outp?.stderr === "string" ? outp.stderr : "",
            exitCode: typeof outp?.exitCode === "number" ? outp.exitCode : undefined,
            running,
          })
        } else if (p.toolName === "write_file" || p.toolName === "read_file") {
          // eve uses `filePath`; accept `path` as a fallback.
          const path =
            (typeof inp?.filePath === "string" && inp.filePath) ||
            (typeof inp?.path === "string" && inp.path) ||
            (typeof outp?.path === "string" && outp.path) ||
            ""
          if (!path) continue
          const content =
            (typeof inp?.content === "string" && inp.content) ||
            (typeof outp?.content === "string" && outp.content) ||
            ""
          // Last touch wins, so the tree reflects the newest contents.
          fileMap.set(path, { path, content, action: p.toolName === "write_file" ? "write" : "read" })
        }
      }
    }
    return { runs: runsOut, sandboxFiles: Array.from(fileMap.values()), sandboxIntent: intent, sandboxReady: ready }
  }, [messages])

  // Mirror sandbox activity into a dedicated block pinned to the LEFT of this
  // channel UI, so the operator can watch the sandbox as the agent works. The
  // eve session lives inside this component's hook, so we lift the data into the
  // shared store; the block renders from there.
  //
  // The block opens when the agent actually DECIDES to use the sandbox — i.e.
  // the first time it invokes a sandbox tool (`sandboxIntent`) — NOT when the
  // prompt is merely submitted. While reasoning or loading skills the agent
  // hasn't touched the sandbox, so no block appears. Once it invokes a tool we
  // show a brief "booting" state (the VM really is provisioning at that point)
  // until the first command/file is captured, then live activity streams in.
  const runsKey = useMemo(() => JSON.stringify(runs), [runs])
  const filesKey = useMemo(() => JSON.stringify(sandboxFiles), [sandboxFiles])
  // Booting = the agent has reached for the sandbox but no sandbox tool has
  // finished yet (the backend is opening). Keyed on `sandboxReady`, not on
  // captured files, so a mid-stream write_file doesn't prematurely end it.
  const booting = config.sandbox && sandboxIntent && !sandboxReady
  // While the sandbox is booting we show a dedicated "sandbox · starting…" chip
  // (in the conversation), so suppress the generic thinking spinner to avoid
  // showing two spinners at once.
  const showThinking = showThinkingBase && !booting
  const dataRef = useRef({ runs, sandboxFiles, booting, sandboxIntent })
  dataRef.current = { runs, sandboxFiles, booting, sandboxIntent }
  useEffect(() => {
    const store = useWhiteboard.getState()
    const els = store.current().elements
    const self = els.find((e) => e.id === selfId)
    const existing = els.find((e) => e.type === "sandbox" && e.sandboxParent === selfId)
    const current = dataRef.current
    const hasActivity = current.runs.length > 0 || current.sandboxFiles.length > 0
    // Nothing to show: the agent has not decided to use the sandbox yet.
    if (!hasActivity && !current.booting) {
      if (existing) store.removeElements([existing.id])
      return
    }
    if (!existing) {
      if (!self) return
      const el = makeSandboxElement(self.x - SANDBOX_WIDTH - SANDBOX_GAP, self.y, selfId)
      el.runs = current.runs
      el.sandboxFiles = current.sandboxFiles
      el.booting = current.booting
      store.addElement(el)
    } else if (
      JSON.stringify(existing.runs ?? []) !== runsKey ||
      JSON.stringify(existing.sandboxFiles ?? []) !== filesKey ||
      (existing.booting ?? false) !== current.booting
    ) {
      store.update([existing.id], {
        runs: current.runs,
        sandboxFiles: current.sandboxFiles,
        booting: current.booting,
      })
    }
  }, [runsKey, filesKey, booting, selfId])

  // When this channel UI unmounts (closed), remove its pinned sandbox block.
  useEffect(() => {
    return () => {
      const store = useWhiteboard.getState()
      const orphans = store
        .current()
        .elements.filter((e) => e.type === "sandbox" && e.sandboxParent === selfId)
        .map((e) => e.id)
      if (orphans.length) store.removeElements(orphans)
    }
  }, [selfId])

  return (
    <>
      {/* conversation — fixed viewport so it scrolls internally instead of
          growing the block unbounded; ScrollBox draws an always-visible thumb. */}
      <ScrollBox viewportRef={scrollRef} style={{ height: 440 }}>
        <div
          style={{
            padding: s(16),
            display: "flex",
            flexDirection: "column",
            gap: s(12),
          }}
        >
        {messages.length === 0 &&
          (terminal ? (
            <div style={{ fontFamily: mono, fontSize: s(12), lineHeight: 1.6, color: mutedColor, whiteSpace: "pre-wrap" }}>
              <div style={{ color: channel.accent }}>eve agent ready.</div>
              <div>
                {config.tools.length
                  ? `capabilities: ${config.tools.join(", ")}`
                  : "no tools added yet — add one to give me more to work with."}
              </div>
            </div>
          ) : (
            <Bubble accent={channel.accent} textColor={textColor} bubbleBg={bubbleBg}>
              Hi! I&apos;m your eve agent. I can only use the capabilities you&apos;ve added to this
              block{config.tools.length ? ` — right now: ${config.tools.join(", ")}.` : ". Add a tool to give me more to work with."}
            </Bubble>
          ))}

        {messages.map((m) => {
          if (m.role === "user") {
            const clean = stripMarker(
              m.parts
                .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                .map((p) => p.text.trim())
                .filter(Boolean)
                .join("\n\n"),
            )
            if (!clean) return null
            if (terminal) {
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: s(8),
                    fontFamily: mono,
                    fontSize: s(12),
                    lineHeight: 1.6,
                    color: textColor,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  <span style={{ color: channel.accent, flexShrink: 0, userSelect: "none" }}>❯</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{clean}</span>
                </div>
              )
            }
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    background: channel.accent,
                    color: "#fff",
                    borderRadius: s(10),
                    padding: `${s(8)}px ${s(10)}px`,
                    fontSize: s(12),
                    lineHeight: 1.5,
                    maxWidth: "82%",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {clean}
                </div>
              </div>
            )
          }

          // Assistant: render parts in document order so a tool chip appears
          // beneath the text that preceded it, and any following text starts on
          // a new line below the chip.
          const items: React.ReactNode[] = []
          let buffer: string[] = []
          const flushText = (key: string) => {
            const t = stripMarker(buffer.join("\n\n").trim())
            buffer = []
            if (!t) return
            items.push(
              <div
                key={key}
                style={{
                  background: bubbleBg,
                  color: textColor,
                  borderRadius: terminal ? 0 : s(10),
                  padding: terminal ? 0 : `${s(8)}px ${s(10)}px`,
                  fontSize: s(12),
                  lineHeight: terminal ? 1.6 : 1.5,
                  fontFamily: terminal ? mono : undefined,
                  overflow: "hidden",
                }}
              >
                <Markdown text={t} textColor={textColor} mutedColor={mutedColor} border={border} accent={channel.accent} />
              </div>,
            )
          }
          m.parts.forEach((p, i) => {
            if (p.type === "text") {
              const t = p.text.trim()
              if (t) buffer.push(t)
            } else if (p.type === "dynamic-tool") {
              flushText(`${m.id}-t${i}`)
              // run_command renders its rich terminal in the pinned sandbox block;
              // here it's just a breadcrumb chip like any other tool.
              items.push(
                <ToolChip
                  key={p.toolCallId}
                  name={p.toolName}
                  input={"input" in p ? (p.input as Record<string, unknown>) : undefined}
                  state={p.state}
                  mutedColor={mutedColor}
                  border={border}
                  accent={channel.accent}
                />,
              )
            }
          })
          flushText(`${m.id}-tail`)

          if (items.length === 0) return null

          // Terminal: no avatar, full width — output reads like program stdout.
          if (terminal) {
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: s(6), minWidth: 0, alignItems: "stretch" }}>
                {items}
              </div>
            )
          }

          return (
            <div key={m.id} style={{ display: "flex", gap: s(8), alignItems: "flex-start" }}>
              <span
                style={{
                  width: s(24),
                  height: s(24),
                  borderRadius: 9999,
                  background: channel.accent,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: s(11),
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                E
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: s(6), maxWidth: "82%", minWidth: 0, alignItems: "flex-start" }}>
                {items}
              </div>
            </div>
          )
        })}

        {booting && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: s(6),
              alignSelf: "flex-start",
              border: `1px solid ${border}`,
              borderRadius: s(8),
              padding: `${s(3)}px ${s(8)}px`,
              fontSize: s(11),
              color: mutedColor,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <Loader2 size={s(11)} className="animate-spin" /> sandbox · starting…
          </div>
        )}
        {showThinking && (
          <div style={{ display: "flex", alignItems: "center", gap: s(6), color: mutedColor, fontSize: s(12), fontFamily: terminal ? mono : undefined }}>
            <Loader2 size={s(13)} className="animate-spin" /> {terminal ? "thinking…" : "Thinking…"}
          </div>
        )}
        {status === "error" && (
          <div style={{ color: "#ef4444", fontSize: s(12), fontFamily: terminal ? mono : undefined }}>
            {error?.message ?? "Something went wrong. Try again."}
          </div>
        )}
        </div>
      </ScrollBox>

      {/* composer */}
      <div style={{ padding: s(12), borderTop: `1px solid ${border}`, background: bg }}>
        {terminal ? (
          <div style={{ display: "flex", alignItems: "center", gap: s(8), fontFamily: mono }}>
            <span style={{ color: channel.accent, flexShrink: 0, userSelect: "none", fontSize: s(13) }}>❯</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  submit()
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={channel.placeholder}
              aria-label={`Message the ${channel.label} agent`}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: s(12),
                color: textColor,
                fontFamily: mono,
                caretColor: channel.accent,
              }}
            />
            {busy && <Loader2 size={s(14)} className="animate-spin" color={mutedColor} style={{ flexShrink: 0 }} />}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: s(8),
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: s(10),
              padding: `${s(6)}px ${s(6)}px ${s(6)}px ${s(10)}px`,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  submit()
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={channel.placeholder}
              aria-label={`Message the ${channel.label} agent`}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: s(12),
                color: textColor,
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              type="button"
              onClick={submit}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={busy || !input.trim()}
              aria-label="Send message"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: s(28),
                height: s(28),
                borderRadius: s(8),
                border: "none",
                background: channel.accent,
                color: "#fff",
                flexShrink: 0,
                cursor: busy || !input.trim() ? "default" : "pointer",
                opacity: busy || !input.trim() ? 0.5 : 1,
              }}
            >
              {busy ? <Loader2 size={s(15)} className="animate-spin" /> : <SendHorizontal size={s(15)} />}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Bubble({
  children,
  accent,
  textColor,
  bubbleBg,
}: {
  children: React.ReactNode
  accent: string
  textColor: string
  bubbleBg: string
}) {
  return (
    <div style={{ display: "flex", gap: s(8), alignItems: "flex-start" }}>
      <span
        style={{
          width: s(24),
          height: s(24),
          borderRadius: 9999,
          background: accent,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: s(11),
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        E
      </span>
      <div
        style={{
          background: bubbleBg,
          color: textColor,
          borderRadius: s(10),
          padding: `${s(8)}px ${s(10)}px`,
          fontSize: s(12),
          lineHeight: 1.5,
          maxWidth: "82%",
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Builds a human-readable "<name> <kind>" label for a tool call so it's clear
 * which capability ran — a plain tool ("calculate tool"), a delegated subagent
 * ("research subagent"), a channel action ("slack channel"), or a sandbox run.
 */
function chipLabel(name: string, input?: Record<string, unknown>): string {
  if (name === "bash" || name === "run_command") {
    const cmd = typeof input?.command === "string" ? input.command.trim().split(/\s+/)[0] : ""
    return cmd ? `sandbox · ${cmd}` : "sandbox"
  }
  if (name === "write_file" || name === "read_file") {
    const raw = (typeof input?.filePath === "string" && input.filePath) || (typeof input?.path === "string" && input.path) || ""
    const base = raw ? raw.split("/").filter(Boolean).pop() : ""
    const verb = name === "write_file" ? "write" : "read"
    return base ? `sandbox · ${verb} ${base}` : `sandbox · ${verb}`
  }
  if (name === "delegate_to_subagent") {
    const target = typeof input?.subagent === "string" ? input.subagent : "subagent"
    return `${target} subagent`
  }
  if (name === "send_to_channel") {
    const target = typeof input?.channel === "string" ? input.channel : "channel"
    return `${target} channel`
  }
  return `${name} tool`
}

/** A compact indicator that the agent called one of its capabilities. */
function ToolChip({
  name,
  input,
  state,
  mutedColor,
  border,
  accent,
}: {
  name: string
  input?: Record<string, unknown>
  state: string
  mutedColor: string
  border: string
  accent: string
}) {
  const done = state === "output-available"
  const failed = state === "output-error" || state === "output-denied"
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s(6),
        alignSelf: "flex-start",
        border: `1px solid ${border}`,
        borderRadius: s(8),
        padding: `${s(3)}px ${s(8)}px`,
        fontSize: s(11),
        color: mutedColor,
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      {!done && !failed ? (
        <Loader2 size={s(11)} className="animate-spin" />
      ) : (
        <span style={{ width: s(6), height: s(6), borderRadius: 9999, background: failed ? "#ef4444" : accent }} />
      )}
      {chipLabel(name, input)}
    </div>
  )
}

/**
 * Renders the agent's markdown reply (bullets, bold, inline code, links, etc.)
 * with themed inline styles so it matches the surrounding chat bubble instead of
 * showing raw `**` / backtick syntax.
 */
function Markdown({
  text,
  textColor,
  mutedColor,
  border,
  accent,
}: {
  text: string
  textColor: string
  mutedColor: string
  border: string
  accent: string
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: s(6),
        minWidth: 0,
        maxWidth: "100%",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
          ul: ({ children }) => (
            <ul style={{ margin: 0, paddingLeft: s(18), display: "flex", flexDirection: "column", gap: s(3) }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: 0, paddingLeft: s(18), display: "flex", flexDirection: "column", gap: s(3) }}>
              {children}
            </ol>
          ),
          li: ({ children }) => <li style={{ margin: 0 }}>{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: accent, textDecoration: "underline" }}>
              {children}
            </a>
          ),
          h1: ({ children }) => <div style={{ fontSize: s(14), fontWeight: 700 }}>{children}</div>,
          h2: ({ children }) => <div style={{ fontSize: s(13), fontWeight: 700 }}>{children}</div>,
          h3: ({ children }) => <div style={{ fontSize: s(12), fontWeight: 700 }}>{children}</div>,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: 0, paddingLeft: s(10), borderLeft: `2px solid ${border}`, color: mutedColor }}>
              {children}
            </blockquote>
          ),
          hr: () => <hr style={{ border: "none", borderTop: `1px solid ${border}`, margin: `${s(2)}px 0` }} />,
          // Block code container (fenced ```): clean bordered card, no grey fill.
          pre: ({ children }) => (
            <pre
              style={{
                margin: 0,
                padding: s(12),
                background: "transparent",
                border: `1px solid ${border}`,
                borderRadius: s(8),
                maxWidth: "100%",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                fontSize: s(12),
                lineHeight: 1.6,
                color: textColor,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = typeof className === "string" && className.includes("language-")
            // Inside a <pre> the parent handles styling; inline code gets a
            // subtle accent-colored mono treatment with no background pill.
            if (isBlock) return <code>{children}</code>
            return (
              <code
                style={{
                  fontSize: "0.9em",
                  fontFamily: "var(--font-mono, monospace)",
                  color: accent,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {children}
              </code>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
