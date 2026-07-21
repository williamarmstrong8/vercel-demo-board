"use client"

import { memo, useState, useLayoutEffect, useEffect, useRef, useMemo } from "react"
import { Play, Loader2, Check, RotateCw, Lock, ChevronDown, ChevronRight, Folder, FileText, SquareTerminal, ExternalLink, Waypoints, Server, Send, Zap } from "lucide-react"
import type { AgentFile, CanvasElement, RunPhase } from "@/lib/whiteboard/types"
import { getBounds } from "@/lib/whiteboard/geometry"
import { getCodeTheme, tokenizeLine } from "@/lib/whiteboard/code-themes"
import { createElement } from "@/lib/whiteboard/factory"
import { useWhiteboard } from "@/lib/whiteboard/store"
  import { getApiContext, getConnectedCode, detectWebsiteTemplate, METHOD_COLORS, DEMO_ORIGIN, type ApiContext } from "@/lib/whiteboard/workflow"
import { WebsitePage, type WebsiteTemplate } from "@/components/whiteboard/website-templates"
import { channelsForFiles, channelById, type EveChannelMeta } from "@/lib/whiteboard/eve-templates"
import { GATEWAY_MODELS, gatewayModelById, DEFAULT_GATEWAY_MODEL } from "@/lib/whiteboard/ai-gateway-models"
import { ChannelChat, CHANNEL_UI_SCALE, s } from "@/components/whiteboard/channel-chat"
import { ScrollBox } from "@/components/whiteboard/scroll-box"

/**
 * Resolves the upstream API context for a workflow node (website / server) by
 * reading the current project's elements + connections from the store. Lets a
 * node reflect the API route or endpoint defined by whatever comes before it.
 */
function useApiContext(el: CanvasElement): ApiContext | null {
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const connections = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).connections)
  return useMemo(() => {
    // Smart connect is on by default; when explicitly disabled the node keeps
    // its own custom static config instead of reflecting upstream nodes.
    if (el.smartConnect === false) return null
    return getApiContext(el, elements, connections)
  }, [el, elements, connections])
}

/**
 * The website shell driven by the code block this node is connected to (in
 * either direction). Returns null when smart connect is off or nothing in the
 * flow defines a code block, so the node falls back to its own static template.
 */
function useConnectedWebsiteTemplate(el: CanvasElement): WebsiteTemplate | null {
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const connections = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).connections)
  return useMemo(() => {
    if (el.smartConnect === false) return null
    const code = getConnectedCode(el, elements, connections)
    return code ? (detectWebsiteTemplate(code) as WebsiteTemplate) : null
  }, [el, elements, connections])
}

// Keeps a code/terminal block's height fit to its content. Measures the natural
// height of the block body and writes it back to the element so selection,
// resize handles and hit-testing all stay in sync.
function useFitHeight(el: CanvasElement, ref: React.RefObject<HTMLDivElement | null>) {
  const update = useWhiteboard((s) => s.update)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    let raf = 0
    const measure = () => {
      const next = Math.ceil(node.offsetHeight)
      if (next > 0 && Math.abs(next - el.height) > 1) {
        update([el.id], { height: next })
      }
    }
    measure()
    // Defer the observer-driven measurement to the next frame so we never write
    // layout synchronously inside the ResizeObserver callback (which triggers
    // the "ResizeObserver loop completed with undelivered notifications" error).
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(node)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // width/text/theme/title/formatting all affect wrapping and therefore height
  }, [
    el.id,
    el.height,
    el.width,
    el.text,
    el.codeTheme,
    el.title,
    el.fontSize,
    el.bold,
    el.italic,
    el.textAlign,
    ref,
    update,
  ])
}

export const CanvasElementView = memo(function CanvasElementView({ el }: { el: CanvasElement }) {
  const b = getBounds(el)
  const phase = useWhiteboard((s) => s.runStates[el.id])
  const editing = useWhiteboard((s) => s.editingId === el.id)
  const connections = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).connections)
  const active = phase === "running"
  const isLinear = el.type === "arrow" || el.type === "line"
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: b.x,
    top: b.y,
    // Axis-aligned lines have a zero-width or zero-height geometric bound.
    // Keep a one-pixel SVG viewport so the stroke and marker remain paintable.
    width: isLinear ? Math.max(1, b.width) : b.width,
    height: isLinear ? Math.max(1, b.height) : b.height,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity,
    pointerEvents: "none",
  }

  const inner: React.CSSProperties = {
    color: el.stroke,
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: el.rounded ? 12 : 2,
    outline: active ? "2px solid #0070f3" : undefined,
    outlineOffset: active ? 3 : undefined,
    boxShadow: active ? "0 0 0 6px rgba(0,112,243,0.18)" : undefined,
    transition: "box-shadow 0.2s ease, outline-color 0.2s ease",
    // hide underlying content while editing so the transparent editor overlay
    // doesn't ghost behind it (visibility keeps layout for height measurement)
    visibility: editing ? "hidden" : undefined,
  }

  // The run control always lives under the *first* node of a workflow: a node
  // that feeds others (has an outgoing edge) but has nothing feeding into it
  // (no incoming edge). This makes it the natural trigger for the whole chain.
  const hasOutgoing = connections.some((c) => c.from === el.id)
  const hasIncoming = connections.some((c) => c.to === el.id)
  const isWorkflowRoot = hasOutgoing && !hasIncoming

  return (
    <div style={wrapperStyle} data-el-id={el.id}>
      <div style={inner}>{renderContent(el, b, phase)}</div>
      {isWorkflowRoot && <RunButton id={el.id} phase={phase} />}
      {el.type === "filetree" && <ChannelLogos tree={el} />}
    </div>
  )
})

/**
 * Brand logos for every channel an agent has added, stacked to the LEFT of the
 * file-tree block. Clicking a logo opens (or focuses) a channel-branded
 * "send message" UI block for that channel.
 */
function ChannelLogos({ tree }: { tree: CanvasElement }) {
  const channels = channelsForFiles(tree.files ?? [])
  // The channel whose "send message" UI is currently open (only one at a time).
  const activeChannel = useWhiteboard(
    (s) => s.current().elements.find((e) => e.type === "channelui" && e.channelParent === tree.id)?.channel,
  )
  if (channels.length === 0) return null

  const openChannel = (channel: EveChannelMeta) => {
    const store = useWhiteboard.getState()
    const els = store.current().elements
    const t = els.find((e) => e.id === tree.id)
    if (!t) return
    // every channel UI currently pinned to this agent (at most one is expected)
    const open = els.filter((e) => e.type === "channelui" && e.channelParent === t.id)
    const sameOpen = open.some((e) => e.channel === channel.id)
    // toggle: clicking the active channel closes its UI
    if (sameOpen) {
      store.select(open.map((e) => e.id))
      store.deleteSelected()
      return
    }
    // only one open at a time: close any other channel UI before opening this one
    if (open.length) {
      store.select(open.map((e) => e.id))
      store.deleteSelected()
    }
    const tb = getBounds(t)
    const uiWidth = 320 * CHANNEL_UI_SCALE
    const ui = createElement("channelui", tb.x - uiWidth - CHANNEL_UI_GAP, tb.y, {
      stroke: "transparent",
      fill: "transparent",
      strokeWidth: 0,
    })
    ui.width = uiWidth
    ui.channel = channel.id
    ui.channelParent = t.id
    store.addElement(ui)
    store.select([ui.id])
  }

  return (
    <div
      style={{
        position: "absolute",
        right: "calc(100% + 12px)",
        top: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {channels.map((channel) => {
        const isActive = activeChannel === channel.id
        return (
        <button
          key={channel.id}
          type="button"
          title={isActive ? `Close ${channel.label} message UI` : `Open ${channel.label} message UI`}
          aria-label={isActive ? `Close ${channel.label} message UI` : `Open ${channel.label} message UI`}
          aria-pressed={isActive}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            openChannel(channel)
          }}
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            padding: 7,
            borderRadius: 10,
            border: `1px solid ${isActive ? "transparent" : "#2e2e2e"}`,
            background: isActive ? "#1a1a1a" : "#111",
            cursor: "pointer",
            boxShadow: "none",
          }}
        >
          {channel.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channel.logo || "/placeholder.svg"} alt={`${channel.label} logo`} width={22} height={22} style={{ display: "block" }} />
          ) : channel.surface === "terminal" ? (
            <SquareTerminal size={22} color="#fff" strokeWidth={2} />
          ) : (
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                background: channel.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {channel.label[0]}
            </span>
          )}
        </button>
        )
      })}
    </div>
  )
}

/**
 * A channel-branded "send message" composer, opened by clicking a channel logo
 * beside an eve agent. Chrome (surface, accent, logo, header) is driven by the
 * channel's metadata so each app reads like its real message UI.
 */
function ChannelMessageView({ el }: { el: CanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useFitHeight(el, ref)
  const channel = channelById(el.channel)
  if (!channel) return null

  const terminal = channel.surface === "terminal"
  const dark = channel.surface === "dark"
  // Terminal gets its own near-black, borderless, transparent-bubble palette so
  // the chat reads like a real terminal session rather than a chat app.
  const bg = terminal ? "#0c0c0c" : dark ? "#0a0a0a" : "#ffffff"
  const border = terminal ? "#1f1f1f" : dark ? "#2e2e2e" : "#e6e6e6"
  const headerBg = terminal ? "#161616" : dark ? "#141414" : "#f7f7f8"
  const textColor = terminal ? "#e4e4e4" : dark ? "#ededed" : "#1a1a1a"
  const mutedColor = terminal ? "#7a7a7a" : dark ? "#8a8a8a" : "#6a6a6a"
  const inputBg = terminal ? "transparent" : dark ? "#111" : "#ffffff"
  const inputBorder = terminal ? "transparent" : dark ? "#2a2a2a" : "#d8d8d8"
  const bubbleBg = terminal ? "transparent" : dark ? "#1a1a1a" : "#f1f1f3"

  return (
    <div
      ref={ref}
      // The canvas element wrapper is pointer-events:none; re-enable it here and
      // stop propagation so clicking the chat focuses the input and drags/pans
      // the canvas don't hijack the interaction.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        pointerEvents: "auto",
        width: "100%",
        borderRadius: el.rounded ? s(12) : s(2),
        background: bg,
        border: `1px solid ${border}`,
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: s(8),
          padding: `${s(10)}px ${s(12)}px`,
          height: s(44),
          background: headerBg,
          borderBottom: `1px solid ${border}`,
        }}
      >
        {terminal ? (
          <>
            {/* traffic-light window controls */}
            <div style={{ display: "flex", gap: s(6), flexShrink: 0 }}>
              <span style={{ width: s(11), height: s(11), borderRadius: 9999, background: "#ff5f57" }} />
              <span style={{ width: s(11), height: s(11), borderRadius: 9999, background: "#febc2e" }} />
              <span style={{ width: s(11), height: s(11), borderRadius: 9999, background: "#28c840" }} />
            </div>
            <span
              style={{
                fontSize: s(12),
                color: mutedColor,
                flex: 1,
                textAlign: "center",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {channel.header}
            </span>
            <SquareTerminal size={s(15)} color={mutedColor} style={{ flexShrink: 0 }} />
          </>
        ) : (
          <>
            {channel.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.logo || "/placeholder.svg"} alt={`${channel.label} logo`} width={s(18)} height={s(18)} style={{ display: "block", flexShrink: 0 }} />
            ) : (
              <span style={{ width: s(16), height: s(16), borderRadius: s(4), background: channel.accent, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: s(13), fontWeight: 600, color: textColor, flex: 1 }}>{channel.header}</span>
            <span style={{ fontSize: s(11), color: mutedColor }}>{channel.label}</span>
          </>
        )}
      </div>

      {/* live chat wired to the real eve agent */}
      <ChannelChat
        channel={channel}
        parentId={el.channelParent}
        selfId={el.id}
        palette={{ bg, border, textColor, mutedColor, inputBg, inputBorder, bubbleBg }}
      />
    </div>
  )
}

// shared sandbox palette
const SANDBOX_COLORS = {
  bg: "#0c0c0c",
  panel: "#0f0f0f",
  border: "#1f1f1f",
  headerBg: "#161616",
  text: "#e4e4e4",
  muted: "#7a7a7a",
  accent: "#3ecf8e",
  err: "#ef4444",
  mono: "var(--font-mono, monospace)",
}

/**
 * Live sandbox, auto-spawned to the LEFT of a channel UI when the agent works
 * in its /workspace. It mirrors two streams captured by the channel chat: shell
 * `runs` (a terminal) and touched `files` (a file tree + viewer), switchable via
 * tabs, so the operator can watch the agent code in real time.
 */
/** Pick the site's entry file (index.html preferred, else the first .html). */
function findEntryHtml(files: NonNullable<CanvasElement["sandboxFiles"]>) {
  const html = files.filter((f) => /\.html?$/i.test(f.path))
  return html.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? html[0]
}

/** Open captured HTML content in a new browser tab via a blob URL. */
function openSite(file: NonNullable<CanvasElement["sandboxFiles"]>[number]) {
  const blob = new Blob([file.content], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  // Revoke shortly after the new tab has had a chance to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function SandboxView({ el }: { el: CanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  const runs = useMemo(() => el.runs ?? [], [el.runs])
  const files = useMemo(() => el.sandboxFiles ?? [], [el.sandboxFiles])
  useFitHeight(el, ref)

  const [tab, setTab] = useState<"terminal" | "files">("terminal")
  const c = SANDBOX_COLORS
  const booting = !!el.booting && runs.length === 0 && files.length === 0
  const entry = useMemo(() => findEntryHtml(files), [files])

  // Default to whichever stream has content; prefer files once they exist.
  useEffect(() => {
    if (files.length > 0) setTab("files")
    else setTab("terminal")
  }, [files.length])

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        pointerEvents: "auto",
        width: "100%",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: c.mono,
      }}
    >
      {/* title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: c.headerBg,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <span style={{ width: 11, height: 11, borderRadius: 9999, background: "#ff5f57" }} />
          <span style={{ width: 11, height: 11, borderRadius: 9999, background: "#febc2e" }} />
          <span style={{ width: 11, height: 11, borderRadius: 9999, background: "#28c840" }} />
        </div>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: c.muted }}>sandbox — /workspace</span>
        {/* Open the built site in a new tab once an HTML entry file exists. */}
        {entry ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => openSite(entry)}
            title={`Open ${entry.path} in a new tab`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              padding: "4px 10px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              cursor: "pointer",
              fontFamily: c.mono,
              fontSize: 11,
              background: c.accent,
              color: "#04160d",
              fontWeight: 600,
            }}
          >
            <ExternalLink size={13} /> Open site
          </button>
        ) : (
          <SquareTerminal size={15} color={c.muted} style={{ flexShrink: 0 }} />
        )}
      </div>

      {booting ? (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: c.muted, fontSize: 12 }}>
          <Loader2 size={18} className="animate-spin" color={c.accent} />
          <span>Booting sandbox — the agent is getting ready…</span>
        </div>
      ) : (
        <>
          {/* tab bar */}
          <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: c.headerBg, borderBottom: `1px solid ${c.border}` }}>
            <SandboxTab label="Terminal" icon={<SquareTerminal size={13} />} count={runs.length} active={tab === "terminal"} onClick={() => setTab("terminal")} />
            <SandboxTab label="Files" icon={<FileText size={13} />} count={files.length} active={tab === "files"} onClick={() => setTab("files")} />
          </div>

          {tab === "terminal" ? <SandboxTerminal runs={runs} /> : <SandboxFiles files={files} />}
        </>
      )}
    </div>
  )
}

function SandboxTab({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  count: number
  active: boolean
  onClick: () => void
}) {
  const c = SANDBOX_COLORS
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 7,
        border: "none",
        cursor: "pointer",
        fontFamily: c.mono,
        fontSize: 12,
        background: active ? c.bg : "transparent",
        color: active ? c.text : c.muted,
      }}
    >
      {icon}
      {label}
      {count > 0 && (
        <span style={{ fontSize: 10, color: active ? c.accent : c.muted, background: active ? "rgba(62,207,142,0.12)" : "transparent", borderRadius: 9999, padding: "0 6px" }}>
          {count}
        </span>
      )}
    </button>
  )
}

function SandboxTerminal({ runs }: { runs: NonNullable<CanvasElement["runs"]> }) {
  const c = SANDBOX_COLORS
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = bodyRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [runs])

  return (
    <div
      ref={bodyRef}
      className="wb-scroll"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ padding: 14, maxHeight: 440, overflowY: "auto", fontSize: 12, lineHeight: 1.6, color: c.text, display: "flex", flexDirection: "column", gap: 10 }}
    >
      {runs.length === 0 && <div style={{ color: c.muted }}>No commands run yet.</div>}
      {runs.map((run) => {
        const errored = run.exitCode !== undefined && run.exitCode !== 0
        return (
          <div key={run.id} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <div>
              <span style={{ color: c.accent, userSelect: "none" }}>{"❯ "}</span>
              {run.command || <span style={{ color: c.muted }}>…</span>}
            </div>
            {run.stdout && <div style={{ color: c.text }}>{run.stdout}</div>}
            {run.stderr && <div style={{ color: c.err }}>{run.stderr}</div>}
            {run.running ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.muted }}>
                <Loader2 size={12} className="animate-spin" /> running…
              </div>
            ) : (
              <div style={{ color: errored ? c.err : c.muted, fontSize: 11 }}>exit {run.exitCode ?? 0}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SandboxFiles({ files }: { files: NonNullable<CanvasElement["sandboxFiles"]> }) {
  const c = SANDBOX_COLORS
  const codeTheme = getCodeTheme("dark")
  const [selected, setSelected] = useState<string | null>(null)
  // Auto-select the most recently touched file as they stream in.
  useEffect(() => {
    if (files.length > 0) setSelected(files[files.length - 1].path)
  }, [files])

  const active = files.find((f) => f.path === selected) ?? files[files.length - 1]

  if (files.length === 0) {
    return <div style={{ padding: 14, fontSize: 12, color: c.muted }}>No files written yet.</div>
  }

  return (
    <div style={{ display: "flex", height: 440 }}>
      {/* file list */}
      <div
        className="wb-scroll"
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${c.border}`, overflowY: "auto", padding: 8, background: c.panel }}
      >
        {files.map((f) => {
          const name = f.path.split("/").filter(Boolean).pop() || f.path
          const isActive = active && f.path === active.path
          return (
            <button
              key={f.path}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelected(f.path)}
              title={f.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontFamily: c.mono,
                fontSize: 12,
                color: isActive ? c.text : c.muted,
                background: isActive ? c.bg : "transparent",
              }}
            >
              <FileText size={13} style={{ flexShrink: 0, color: f.action === "write" ? c.accent : c.muted }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            </button>
          )
        })}
      </div>

      {/* file contents — rendered as a VS Code "Dark+" style code block */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: codeTheme.bg }}>
        {active && (
          <>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${codeTheme.border}`, background: codeTheme.headerBg, fontSize: 11, color: codeTheme.chrome, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: c.mono }}>
              {active.path}
            </div>
            <ScrollBox
              style={{ flex: 1, minHeight: 0, background: codeTheme.bg }}
            >
              <div style={{ padding: "10px 0", fontFamily: c.mono, fontSize: 11.5, lineHeight: "18px", width: "max-content", minWidth: "100%" }}>
                {active.content ? (
                  active.content.split("\n").map((ln, i) => (
                    <div key={i} style={{ display: "flex", padding: "0 12px" }}>
                      <span style={{ width: 30, color: codeTheme.gutter, flexShrink: 0, userSelect: "none", textAlign: "right", paddingRight: 12 }}>{i + 1}</span>
                      <span style={{ whiteSpace: "pre", tabSize: 2 }}>
                        {ln.length === 0
                          ? " "
                          : tokenizeLine(ln).map((tok, j) => (
                              <span key={j} style={{ color: codeTheme.colors[tok.kind] }}>
                                {tok.text}
                              </span>
                            ))}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "0 12px", color: c.muted }}>(empty file)</div>
                )}
              </div>
            </ScrollBox>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Detached run button that sits *below* a code/terminal block. Clicking it
 * triggers the workflow: this node runs, then each connected node downstream
 * activates in sequence.
 */
function RunButton({ id, phase }: { id: string; phase: RunPhase | undefined }) {
  const runFrom = useWhiteboard((s) => s.runFrom)
  const clearRun = useWhiteboard((s) => s.clearRun)
  const anyRunning = useWhiteboard((s) => Object.values(s.runStates).some((p) => p === "running"))
  const anyState = useWhiteboard((s) => Object.keys(s.runStates).length > 0)
  const state = phase === "running" ? "running" : phase === "done" ? "done" : "idle"

  const run = () => {
    if (anyRunning) return
    runFrom(id)
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        left: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          run()
        }}
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 30,
          padding: "0 14px",
          borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: state === "done" ? "#0070f3" : "#000000",
          color: "#ffffff",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 500,
          cursor: anyRunning ? "default" : "pointer",
          boxShadow: "none",
          transition: "background 0.15s ease",
          whiteSpace: "nowrap",
        }}
      >
        {state === "running" ? (
          <>
            <Loader2 className="animate-spin" size={14} />
            Running
          </>
        ) : state === "done" ? (
          <>
            <Check size={14} />
            Done
          </>
        ) : (
          <>
            <Play size={13} fill="currentColor" />
            Run
          </>
        )}
      </button>

      {/* Reset control — clears the finished run so the workflow returns to its
          pre-run shell state. Only shown once a run has started/completed. */}
      {anyState && (
        <button
          type="button"
          title="Reset workflow"
          aria-label="Reset workflow"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (anyRunning) return
            clearRun()
          }}
          style={{
            pointerEvents: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "#000000",
            color: "#ffffff",
            cursor: anyRunning ? "default" : "pointer",
            opacity: anyRunning ? 0.5 : 1,
            boxShadow: "none",
          }}
        >
          <RotateCw size={14} />
        </button>
      )}
    </div>
  )
}

function renderContent(el: CanvasElement, b: { width: number; height: number }, phase: RunPhase | undefined) {
  switch (el.type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
      return <ShapeSvg el={el} b={b} />
    case "arrow":
    case "line":
      return <LineSvg el={el} />
    case "text":
      return <TextView el={el} />
    case "card":
      return <CardView el={el} />
    case "code":
      return <CodeView el={el} />
    case "terminal":
      return <TerminalView el={el} />
    case "website":
      return <WebsiteView el={el} phase={phase} />
    case "server":
      return <ServerView el={el} phase={phase} />
    case "filetree":
      return <FileTreeView el={el} />
    case "channelui":
      return <ChannelMessageView el={el} />
    case "sandbox":
      return <SandboxView el={el} />
    case "aigateway":
      return <AiGatewayView el={el} />
    case "ec2":
      return <Ec2View el={el} />
  case "fluidcompute":
  return <FluidComputeView el={el} />
  case "serverlesscompute":
  return <ServerlessComputeView el={el} />
  case "computecomparison":
  return <ComputeComparisonView el={el} />
  case "requestdemo":
  return <RequestDemoView el={el} />
  case "image":
      return <ImageView el={el} b={b} />
    default:
      return null
  }
}

function ShapeSvg({ el, b }: { el: CanvasElement; b: { width: number; height: number } }) {
  const noStroke = el.stroke === "transparent" || el.strokeWidth === 0
  const strokeVal = noStroke ? "none" : el.stroke
  const sw = noStroke ? 0 : el.strokeWidth
  const pad = sw
  const w = Math.max(1, b.width)
  const h = Math.max(1, b.height)
  const fill = el.fill === "transparent" ? "none" : el.fill
  const rx = el.rounded ? Math.min(16, Math.min(w, h) * 0.12) : 0
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", display: "block" }}>
      {el.type === "rectangle" && (
        <rect
          x={pad / 2}
          y={pad / 2}
          width={Math.max(1, w - pad)}
          height={Math.max(1, h - pad)}
          rx={rx}
          ry={rx}
          fill={fill}
          stroke={strokeVal}
          strokeWidth={sw}
        />
      )}
      {el.type === "ellipse" && (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(1, (w - pad) / 2)}
          ry={Math.max(1, (h - pad) / 2)}
          fill={fill}
          stroke={strokeVal}
          strokeWidth={sw}
        />
      )}
      {el.type === "diamond" && (
        <polygon
          points={`${w / 2},${pad / 2} ${w - pad / 2},${h / 2} ${w / 2},${h - pad / 2} ${pad / 2},${h / 2}`}
          fill={fill}
          stroke={strokeVal}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function LineSvg({ el }: { el: CanvasElement }) {
  // el.width / el.height may be negative; getBounds normalized the wrapper box,
  // so recompute local endpoints inside the normalized box.
  const x1 = el.width < 0 ? Math.abs(el.width) : 0
  const y1 = el.height < 0 ? Math.abs(el.height) : 0
  const x2 = el.width < 0 ? 0 : el.width
  const y2 = el.height < 0 ? 0 : el.height
  const w = Math.abs(el.width) || 1
  const h = Math.abs(el.height) || 1
  const markerId = `arrow-${el.id}`
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", display: "block" }}>
      {el.type === "arrow" && (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={el.stroke} />
          </marker>
        </defs>
      )}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        strokeLinecap="round"
        markerEnd={el.type === "arrow" ? `url(#${markerId})` : undefined}
      />
    </svg>
  )
}

function TextView({ el }: { el: CanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useFitHeight(el, ref)
  const fontSize = el.fontSize || 24
  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        // no fixed height — the block hugs the text (see useFitHeight)
        minHeight: Math.round(fontSize * 1.3),
        fontSize,
        lineHeight: 1.3,
        color: el.stroke,
        fontFamily: "var(--font-sans)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontWeight: el.bold ? 700 : 500,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : "none",
        textAlign: el.textAlign || "left",
      }}
    >
      {el.text || ""}
    </div>
  )
}

function CardView({ el }: { el: CanvasElement }) {
  const noStroke = el.stroke === "transparent" || el.strokeWidth === 0
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: el.rounded ? 12 : 2,
        background: el.fill === "transparent" ? "#ffffff" : el.fill,
        border: noStroke ? "none" : `${el.strokeWidth}px solid ${el.stroke}`,
        boxShadow: "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 16px 8px",
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize: 18,
          color: "#000",
        }}
      >
        {el.title || "Card title"}
      </div>
      <div
        style={{
          padding: "0 16px 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "#666",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          flex: 1,
        }}
      >
        {el.text || "Add a description..."}
      </div>
    </div>
  )
}

function WindowDots() {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span key={c} style={{ width: 11, height: 11, borderRadius: 9999, background: c }} />
      ))}
    </div>
  )
}

function CodeView({ el }: { el: CanvasElement }) {
  const theme = getCodeTheme(el.codeTheme)
  const lines = (el.text || "").split("\n")
  const ref = useRef<HTMLDivElement>(null)
  useFitHeight(el, ref)

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        borderRadius: el.rounded ? 10 : 2,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          height: 34,
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        <WindowDots />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: theme.chrome }}>
          {el.title || "untitled"}
        </span>
      </div>
      <div
        style={{
          padding: "10px 0",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: "20px",
          color: theme.colors.plain,
        }}
      >
        {lines.map((ln, i) => (
          <div key={i} style={{ display: "flex", padding: "0 12px" }}>
            <span style={{ width: 22, color: theme.gutter, flexShrink: 0, userSelect: "none" }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {ln.length === 0 ? (
                " "
              ) : (
                tokenizeLine(ln).map((tok, j) => (
                  <span key={j} style={{ color: theme.colors[tok.kind] }}>
                    {tok.text}
                  </span>
                ))
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Gap (world px) kept between the file-tree block and its companion code block.
const COMPANION_GAP = 64

// Gap (world px) kept to the LEFT of the file-tree block for a channel UI block.
// Larger than COMPANION_GAP so the UI clears the channel logo column.
const CHANNEL_UI_GAP = 72

// A node in the rendered file tree: either a folder (has children) or a file.
interface TreeNode {
  name: string // display name (last path segment)
  path: string // full path from the agent root
  file?: AgentFile // present on leaf (file) nodes
  children: TreeNode[]
}

// Turn a flat list of path-carrying files into a nested folder tree, with
// folders sorted before files and everything alphabetized within a level.
function buildFileTree(files: AgentFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] }
  for (const file of files) {
    const parts = file.name.split("/")
    let node = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/")
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path, children: [] }
        node.children.push(child)
      }
      if (i === parts.length - 1) child.file = file
      node = child
    })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const aFolder = a.children.length > 0
      const bFolder = b.children.length > 0
      if (aFolder !== bFolder) return aFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => sort(n.children))
  }
  sort(root.children)
  return root.children
}

// The eve agent "explorer" — an IDE-style file tree. Clicking a file row opens
// its code in a separate companion code block pinned to the side of the tree.
function FileTreeView({ el }: { el: CanvasElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useFitHeight(el, ref)
  const files = el.files ?? []
  const tree = useMemo(() => buildFileTree(files), [files])
  // Folders default to collapsed: we track the set of *expanded* folder paths,
  // so any new folder (e.g. after switching templates) starts collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleFolder = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const openFile = (file: AgentFile) => {
    const store = useWhiteboard.getState()
    const els = store.current().elements
    const tree = els.find((e) => e.id === el.id)
    if (!tree) return
    const tb = getBounds(tree)
    const companion = tree.companionId ? els.find((e) => e.id === tree.companionId) : undefined

    if (companion) {
      // reuse the existing companion: swap in the clicked file's code
      store.update([companion.id], {
        title: file.name,
        text: file.code,
        codeTheme: file.codeTheme ?? "dark",
      })
      store.update([tree.id], { activeFile: file.name })
      store.select([companion.id])
    } else {
      // spawn a fresh, independent code block pinned to the side of the tree
      const code = createElement("code", tb.x + tb.width + COMPANION_GAP, tb.y, {
        stroke: "#000000",
        fill: "transparent",
        strokeWidth: 2,
      })
      code.title = file.name
      code.text = file.code
      code.codeTheme = file.codeTheme ?? "dark"
      code.width = 400
      code.companionOf = tree.id
      store.addElement(code)
      store.update([tree.id], { companionId: code.id, activeFile: file.name })
      store.select([code.id])
    }
  }

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        borderRadius: el.rounded ? 10 : 2,
        background: "#0a0a0a",
        border: "1px solid #2e2e2e",
        overflow: "hidden",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 32,
          background: "#111",
          borderBottom: "1px solid #1f1f1f",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6a6a6a",
          }}
        >
          Explorer
        </span>
      </div>

      <div style={{ padding: "8px 0", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        {/* agent root folder */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", color: "#ededed" }}>
          <ChevronDown size={13} style={{ color: "#8a8a8a", flexShrink: 0 }} />
          <Folder size={14} style={{ color: "#8a8a8a", flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{el.agentName || "eve-agent"}</span>
        </div>

        {/* nested files & folders inside the agent root */}
        {tree.map((node) => (
          <FileTreeRow
            key={node.path}
            node={node}
            depth={1}
            activeFile={el.activeFile}
            onOpen={openFile}
            expanded={expanded}
            onToggle={toggleFolder}
          />
        ))}
      </div>
    </div>
  )
}

// A single row in the explorer. Folders render their children recursively;
// files render as a clickable button that opens the companion code block.
function FileTreeRow({
  node,
  depth,
  activeFile,
  onOpen,
  expanded,
  onToggle,
}: {
  node: TreeNode
  depth: number
  activeFile: string | undefined
  onOpen: (file: AgentFile) => void
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const indent = 12 + depth * 16
  // Every file in a template is new, so we show VS Code's "untracked" (green
  // "U") git decoration and a matching status dot on the folders above it.
  const GIT_GREEN = "#73c991"

  if (!node.file) {
    // folder node — clicking it collapses/expands rather than selecting the tree
    const isOpen = expanded.has(node.path)
    return (
      <>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(node.path)
          }}
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            border: "none",
            background: "transparent",
            padding: "4px 12px",
            paddingLeft: indent,
            color: GIT_GREEN,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {isOpen ? (
            <ChevronDown size={12} style={{ color: "#6a6a6a", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} style={{ color: "#6a6a6a", flexShrink: 0 }} />
          )}
          <Folder size={13} style={{ color: "#6a6a6a", flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{node.name}</span>
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: "50%", background: GIT_GREEN, marginRight: 4, flexShrink: 0 }}
          />
        </button>
        {isOpen &&
          node.children.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              onOpen={onOpen}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
      </>
    )
  }

  const file = node.file
  const active = activeFile === file.name
  const isTs = /\.tsx?$/.test(file.name)
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(file)
      }}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "5px 12px",
        paddingLeft: indent + 18,
        border: "none",
        background: active ? "rgba(0,112,243,0.16)" : "transparent",
        boxShadow: active ? "inset 2px 0 0 #0070f3" : undefined,
        color: GIT_GREEN,
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {isTs ? (
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 15,
            height: 15,
            color: "#3178c6",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          TS
        </span>
      ) : (
        <FileText size={14} style={{ color: "#8a8a8a", flexShrink: 0 }} />
      )}
      <span style={{ flex: 1 }}>{node.name}</span>
      <span style={{ color: GIT_GREEN, fontSize: 12, marginRight: 4, flexShrink: 0 }}>U</span>
    </button>
  )
}

function TerminalView({ el }: { el: CanvasElement }) {
  const theme = getCodeTheme(el.codeTheme)
  const lines = (el.text || "").split("\n")
  const ref = useRef<HTMLDivElement>(null)
  useFitHeight(el, ref)
  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        borderRadius: el.rounded ? 10 : 2,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          height: 34,
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        <WindowDots />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: theme.chrome }}>
          {el.title || "bash"}
        </span>
      </div>
      <div
        style={{
          padding: "12px",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: "20px",
          color: theme.colors.comment,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {lines.map((ln, i) => (
          <div key={i} style={{ color: ln.trim().startsWith("$") ? theme.colors.plain : theme.gutter }}>
            {ln.trim().startsWith("$") ? (
              <>
                <span style={{ color: theme.colors.function }}>$</span>
                {ln.replace(/^\s*\$/, "")}
              </>
            ) : (
              ln || " "
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function prettyDomain(url: string): string {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return url || "example.com"
  }
}

function WebsiteView({ el, phase }: { el: CanvasElement; phase: RunPhase | undefined }) {
  const api = useApiContext(el)
  // The connected code block drives which shell we render; only when there is
  // no code in the flow (or smart connect is off) do we use the static field.
  const inferred = useConnectedWebsiteTemplate(el)
  const template: WebsiteTemplate = inferred ?? el.websiteTemplate ?? "marketing"
  // The address bar reflects the upstream route when connected, otherwise a
  // simulated deployment URL — we never surface localhost.
  const url = api ? api.url : el.url || DEMO_ORIGIN
  const domain = prettyDomain(url)
  const loading = phase === "running"
  // A page only shows real, populated content once the workflow has actually
  // run (phase "done"). Until then it renders the empty shell so you can see
  // the fetch happen when you press Run.
  const hasRun = phase === "done"
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: el.rounded ? 12 : 2,
        background: "#ffffff",
        border: "1px solid #eaeaea",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      {/* browser chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          height: 40,
          background: "#f7f7f7",
          borderBottom: "1px solid #eaeaea",
          flexShrink: 0,
        }}
      >
        <WindowDots />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 24,
            padding: "0 10px",
            borderRadius: 9999,
            background: "#ffffff",
            border: "1px solid #eaeaea",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "#666",
            minWidth: 0,
          }}
        >
          <Lock size={11} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
        </div>
        <RotateCw size={13} color={loading ? "#0070f3" : "#999"} className={loading ? "animate-spin" : undefined} />
      </div>

      {/* loading bar */}
      <div style={{ height: 2, background: "transparent", flexShrink: 0, overflow: "hidden" }}>
        {loading && <div style={{ height: "100%", width: "40%", background: "#0070f3", animation: "wb-load 1s linear infinite" }} />}
      </div>

      {template === "api" ? (
        api && hasRun ? (
          <ApiPage api={api} loading={loading} />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#aaa",
              textAlign: "center",
              opacity: loading ? 0.35 : 1,
            }}
          >
            {api ? "Run the workflow to fetch a response…" : "Waiting for an upstream endpoint…"}
          </div>
        )
      ) : (
        <WebsitePage template={template} api={api} domain={domain} loading={loading} hasRun={hasRun} />
      )}
    </div>
  )
}

/** Raw API response view — what a browser shows when you hit a JSON endpoint. */
function ApiPage({ api, loading }: { api: ApiContext; loading: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, opacity: loading ? 0.35 : 1, transition: "opacity 0.25s ease" }}>
      {/* status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "1px solid #f0f0f0",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: METHOD_COLORS[api.method] ?? "#666",
            border: `1px solid ${METHOD_COLORS[api.method] ?? "#ccc"}`,
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          {api.method}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#333" }}>{api.path}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#28c840" }}>200 OK</span>
      </div>
      {/* upstream chain trail */}
      {api.chain.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            padding: "6px 14px",
            borderBottom: "1px solid #f4f4f4",
            background: "#fafafa",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#888",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#aaa" }}>source</span>
          {api.chain.map((label, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#555" }}>{label}</span>
              {i < api.chain.length - 1 && <span style={{ color: "#ccc" }}>{"→"}</span>}
            </span>
          ))}
        </div>
      )}
      {/* json body */}
      <pre
        style={{
          margin: 0,
          flex: 1,
          overflow: "hidden",
          padding: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: "18px",
          color: "#1a1a1a",
          background: "#fbfbfb",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {api.json}
      </pre>
    </div>
  )
}

/**
 * A single 1U server sled — kept intentionally minimal: a thin bar with one
 * activity LED and a couple of subtle vent lines. The LED lights (and pulses)
 * in the request's accent color while the call is live, so the physical stack
 * is what visualizes the server call.
 */
function RackUnit({
  accent,
  active,
  pulse,
}: {
  accent: string
  active: boolean
  pulse: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 26,
        padding: "0 10px",
        borderRadius: 4,
        background: "#141414",
        border: "1px solid #232323",
      }}
    >
      {/* activity LED */}
      <span
        className={pulse ? "animate-pulse" : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          flexShrink: 0,
          background: active ? accent : "#333333",
          boxShadow: active ? `0 0 6px ${accent}` : "none",
        }}
      />

      <span style={{ flex: 1 }} />

      {/* vent lines */}
      <div style={{ display: "flex", gap: 3 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ width: 1.5, height: 10, borderRadius: 9999, background: "#2a2a2a" }} />
        ))}
      </div>
    </div>
  )
}

function ServerView({ el, phase }: { el: CanvasElement; phase: RunPhase | undefined }) {
  const api = useApiContext(el)
  const update = useWhiteboard((s) => s.update)
  const contentRef = useRef<HTMLDivElement>(null)
  // If a code API route feeds into this server, mirror its method/endpoint and
  // return its response body; otherwise fall back to the node's own config.
  const method = api?.method || el.method || "GET"
  const endpoint = api?.path || el.endpoint || "/api/hello"
  const methodColor = METHOD_COLORS
  const status = phase === "running" ? "processing" : phase === "done" ? "done" : "idle"
  const live = status !== "idle"
  // Rack accent reflects the request lifecycle: blue idle, amber in-flight, green done.
  const accent = status === "processing" ? "#febc2e" : status === "done" ? "#28c840" : "#3f7fff"

  // Auto-size the node to exactly fit its content so nothing is ever clipped —
  // the server's height always equals the height of what's inside it.
  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return
    let raf = 0
    const measure = () => {
      const h = Math.ceil(node.scrollHeight) + 2 // account for the 1px borders
      if (Math.abs(h - el.height) > 1) update([el.id], { height: h })
    }
    measure()
    // Defer to the next frame so we don't mutate layout synchronously inside the
    // observer callback (avoids the ResizeObserver loop notification error).
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(node)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [el.id, el.height, el.width, status, endpoint, method, update])

  const mono = { fontFamily: "var(--font-mono)", fontSize: 12 } as const

  return (
    <div
      ref={contentRef}
      style={{
        width: "100%",
        borderRadius: el.rounded ? 10 : 2,
        background: "#0a0a0a",
        border: "1px solid #2e2e2e",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* header: server identity, the endpoint being called, and live status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 38,
          background: "#141414",
          borderBottom: "1px solid #1f1f1f",
          flexShrink: 0,
        }}
      >
        <Server size={14} color="#ededed" strokeWidth={2} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#ededed" }}>Server</span>
        <span style={{ flex: 1 }} />
        <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, color: methodColor[method] }}>{method}</span>
        <span style={{ ...mono, fontSize: 11, color: "#8a8a8a" }}>{endpoint}</span>
      </div>

      {/* server rack — the hero: a physical stack of sleds handling the request */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <RackUnit key={i} accent={accent} active={live} pulse={status === "processing"} />
        ))}
      </div>

      {/* footer: compact call result, no terminal noise */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 34,
          borderTop: "1px solid #1f1f1f",
          background: "#0d0d0d",
          flexShrink: 0,
          ...mono,
          fontSize: 11,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 9999,
            background: live ? accent : "#3a3a3a",
            boxShadow: live ? `0 0 6px ${accent}` : "none",
            flexShrink: 0,
          }}
        />
        <span style={{ color: "#8a8a8a" }}>
          {status === "idle" ? "ready" : status === "processing" ? "handling request…" : "200 OK · 42ms"}
        </span>
      </div>
    </div>
  )
}

function useIllustrativeSpend(start: number, ratePerSecond: number, activity: boolean | number = true, scope?: string) {
  const [spend, setSpend] = useState(start)
  const lastTick = useRef(Date.now())
  const activeInstances = typeof activity === "number" ? activity : activity ? 1 : 0

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const elapsed = (now - lastTick.current) / 1000
      lastTick.current = now
      if (activeInstances > 0) setSpend((current) => current + elapsed * ratePerSecond * activeInstances)
    }
    const reset = (event: Event) => {
      if (scope && (event as CustomEvent<DemoReset>).detail.scope !== scope) return
      lastTick.current = Date.now()
      setSpend(0)
    }
    const timer = window.setInterval(tick, 80)
    window.addEventListener(RESET_REQUEST_EVENT, reset)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(RESET_REQUEST_EVENT, reset)
    }
  }, [activeInstances, ratePerSecond, scope])

  return { spend, active: activeInstances > 0 }
}

const computeToken = {
  surface: "var(--card)",
  surfaceRaised: "var(--muted)",
  border: "var(--border)",
  borderStrong: "var(--ring)",
  text: "var(--card-foreground)",
  textSecondary: "var(--foreground)",
  textMuted: "var(--muted-foreground)",
  green: "oklch(0.62 0.19 145)",
  greenBg: "oklch(0.96 0.04 145)",
} as const

function SpendDisplay({ amount, rateLabel }: { amount: number; rateLabel: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 112 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: 24, lineHeight: 1, fontWeight: 600, color: computeToken.text, letterSpacing: "-0.04em" }}>
        ${amount.toFixed(2)}
      </span>
      <span style={{ fontSize: 9, color: computeToken.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>
        {rateLabel}
      </span>
    </div>
  )
}

type DemoRequest = { id: number; color: string; startedAt: number; duration: number; scope: string }
type DemoReset = { scope: string }
const REQUEST_EVENT = "v0-compute-demo-request"
const RESET_REQUEST_EVENT = "v0-compute-demo-reset"
const REQUEST_COLORS = ["#d946ef", "#14b8a6", "#2563eb", "#f59e0b"]
const FLUID_WORK_COLORS = ["#5b102b", "#18544d", "#173d78", "#71470b"]
let requestSequence = 0

function useDemoRequests(scope: string) {
  const [requests, setRequests] = useState<DemoRequest[]>([])
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<DemoRequest>).detail
      if (request.scope !== scope) return
      setRequests((current) => [...current.slice(-7), request])
    }
    const reset = (event: Event) => {
      if ((event as CustomEvent<DemoReset>).detail.scope === scope) setRequests([])
    }
    window.addEventListener(REQUEST_EVENT, receive)
    window.addEventListener(RESET_REQUEST_EVENT, reset)
    const cleanup = window.setInterval(() => setRequests((current) => current.filter((request) => Date.now() - request.startedAt < request.duration)), 120)
    return () => {
      window.removeEventListener(REQUEST_EVENT, receive)
      window.removeEventListener(RESET_REQUEST_EVENT, reset)
      window.clearInterval(cleanup)
    }
  }, [scope])
  return requests
}

function dispatchDemoRequest(scope: string) {
  const id = ++requestSequence
  const request: DemoRequest = { id, color: REQUEST_COLORS[(id - 1) % REQUEST_COLORS.length], startedAt: Date.now(), duration: 4600, scope }
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: request }))
}

const requestControlStyle: React.CSSProperties = { pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", height: 30, borderRadius: 9999, border: "1px solid rgba(255,255,255,0.14)", background: "#000000", color: "#ffffff", fontFamily: "var(--font-sans)", cursor: "pointer", boxShadow: "none" }

function RunRequestButton({ scope }: { scope: string }) {
  return <button type="button" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); dispatchDemoRequest(scope) }} style={{ ...requestControlStyle, gap: 6, padding: "0 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}><Play size={13} fill="currentColor" />Run request</button>
}

function ComputeCardShell({ el, children }: { el: CanvasElement; children: React.ReactNode }) {
  const showControl = el.showRequestButton !== false
  return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: showControl ? 10 : 0 }}>{<div style={{ width: "100%", minHeight: 0, flex: 1 }}>{children}</div>}{showControl && <RunRequestButton scope={el.requestScope ?? el.id} />}</div>
}

function RequestDemoView({ el }: { el: CanvasElement }) {
  const [sent, setSent] = useState(0)
  const scope = el.requestScope ?? el.id
  const run = (event: React.MouseEvent) => {
    event.stopPropagation()
    dispatchDemoRequest(scope)
    setSent((count) => count + 1)
  }
  const reset = (event: React.MouseEvent) => {
    event.stopPropagation()
    requestSequence = 0
    setSent(0)
    window.dispatchEvent(new CustomEvent<DemoReset>(RESET_REQUEST_EVENT, { detail: { scope } }))
  }
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: "var(--font-sans)" }}>
      <div style={{ width: "100%", flex: 1, border: `1px solid ${computeToken.borderStrong}`, borderRadius: el.rounded ? 12 : 2, background: computeToken.surface, color: computeToken.text, padding: "12px 15px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, border: `1px solid ${computeToken.border}`, borderRadius: 8, background: computeToken.surfaceRaised, display: "flex", alignItems: "center", justifyContent: "center" }}><Send size={15} /></div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}><strong style={{ fontSize: 13 }}>Request traffic</strong><span style={{ color: computeToken.textMuted, fontSize: 10 }}>Each click sends the same request to both systems.</span></div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: computeToken.textMuted }}>{sent} sent</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={run} style={{ ...requestControlStyle, gap: 6, padding: "0 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}><Play size={13} fill="currentColor" />Run request</button>
        {sent > 0 && <button type="button" title="Reset requests" aria-label="Reset requests" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={reset} style={{ ...requestControlStyle, width: 30 }}><RotateCw size={14} /></button>}
      </div>
    </div>
  )
}

function RequestTimeline({ requests, now, overloaded = false, compact = false }: { requests: DemoRequest[]; now: number; overloaded?: boolean; compact?: boolean }) {
  return (
  <div style={{ position: "relative", height: compact ? 28 : Math.max(46, requests.length * 8 + 12), border: `1px solid ${overloaded ? "#ef2b2d" : "#252525"}`, borderRadius: 8, background: "#111", overflow: "hidden" }}>
      {requests.length === 0 && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#555", fontFamily: "var(--font-mono)", fontSize: 8.5 }}>idle capacity</span>}
      {requests.map((request, index) => {
        const progress = Math.min(Math.max((now - request.startedAt) / request.duration, 0), 1)
        const traceLeft = 100 - progress * 216
        return (
          <span key={request.id} style={{ position: "absolute", top: 7 + index * 8, left: `${traceLeft}%`, width: "116%", height: 5, display: "flex", transition: "left 80ms linear" }}>
            <i style={{ width: "12.5%", height: "100%", flexShrink: 0, borderRadius: "99px 0 0 99px", background: request.color }} />
            <i style={{ width: "75%", height: "100%", flexShrink: 0, background: request.color, opacity: 0.3 }} />
            <i style={{ width: "12.5%", height: "100%", flexShrink: 0, borderRadius: "0 99px 99px 0", background: request.color }} />
          </span>
        )
      })}
      {overloaded && <span style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg, transparent 0 20px, rgba(239,43,45,.32) 20px 40px)", pointerEvents: "none" }} />}
    </div>
  )
}

function Ec2View({ el }: { el: CanvasElement }) {
  const scope = el.requestScope ?? el.id
  const { spend } = useIllustrativeSpend(el.spendStart ?? 12.4, el.spendRatePerSecond ?? 0.45, true, scope)
  const requests = useDemoRequests(scope)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent<DemoReset>).detail.scope !== scope) return
      const tick = Date.now(); setStartedAt(tick); setNow(tick)
    }
    window.addEventListener(RESET_REQUEST_EVENT, reset)
    return () => window.removeEventListener(RESET_REQUEST_EVENT, reset)
  }, [scope])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 80); return () => window.clearInterval(timer) }, [])
  const usage = (now - startedAt) / 1000
  const overloaded = requests.length > 3
  return (
    <ComputeCardShell el={el}>
    <div style={{ width: "100%", height: "100%", border: `1px solid ${computeToken.borderStrong}`, borderRadius: el.rounded ? 12 : 2, background: "#050505", color: "#ededed", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <header style={{ flexShrink: 0, minHeight: 66, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #202020" }}><div style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>Server</strong><span style={{ fontSize: 9.5, color: "#777" }}>Amazon EC2 · always on</span></div><span style={{ color: "#8b8b95", fontFamily: "var(--font-mono)", fontSize: 10 }}>Usage: <b style={{ color: "#ededed", fontWeight: 500 }}>{usage.toFixed(1)}s</b></span></header>
      <div style={{ minHeight: 0, flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {el.showServerTowers !== false && <div aria-label="Two provisioned server towers" style={{ display: "flex", gap: 8 }}>
          {[0, 1].map((tower) => (
            <div key={tower} style={{ flex: 1, padding: 6, border: "1px solid #252525", borderRadius: 7, background: "#0a0a0a", display: "flex", flexDirection: "column", gap: 4 }}>
              {[0, 1].map((unit) => <RackUnit key={unit} accent={overloaded ? "#ef2b2d" : "#3f7fff"} active={requests.length > 0} pulse={requests.length > 0} />)}
            </div>
          ))}
        </div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: overloaded ? "#ef2b2d" : "#8b8b95", fontSize: 10 }}><span style={{ fontFamily: "var(--font-mono)" }}>vps</span><span style={{ display: "flex", alignItems: "center", gap: 9 }}><span>{overloaded ? "CPU Slow Down" : "CPU Ready"}</span><FluidGlyph count={requests.length} overloaded={overloaded} /><span>{overloaded ? "Overloaded" : "Always on"}</span></span></div>
        <RequestTimeline requests={requests} now={now} overloaded={overloaded} />
        <p style={{ margin: "auto 0 0", color: overloaded ? "#ef2b2d" : "#666", fontSize: 9.5, textAlign: "center" }}>{overloaded ? "Capacity exceeded — requests are slowing down." : "One provisioned server handles up to three concurrent requests."}</p>
      </div>
      {el.showPricing !== false && <footer style={{ flexShrink: 0, padding: "11px 16px 13px", borderTop: "1px solid #202020", display: "flex", justifyContent: "center" }}><SpendDisplay amount={spend} rateLabel="one always-on server" /></footer>}
    </div>
    </ComputeCardShell>
  )
}

type FluidTrace = DemoRequest & { instance: number }

function FluidGlyph({ count, overloaded = false }: { count: number; overloaded?: boolean }) {
  const visibleCount = Math.min(count, 4)
  return (
    <span aria-label={`${count} active request${count === 1 ? "" : "s"}`} style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {Array.from({ length: 4 }, (_, bar) => <i key={bar} style={{ width: 2, height: 12, borderRadius: 99, background: bar < visibleCount ? (overloaded ? "#ef2b2d" : "#ededed") : "#444" }} />)}
    </span>
  )
}

const FLUID_BILLING_FRACTION = 116 / 216

function FluidComputeView({ el }: { el: CanvasElement }) {
  const scope = el.requestScope ?? el.id
  const [traces, setTraces] = useState<FluidTrace[]>([])
  const [now, setNow] = useState(() => Date.now())
  const activeInstanceCount = new Set(
    traces
      .filter((trace) => now - trace.startedAt < trace.duration * FLUID_BILLING_FRACTION)
      .map((trace) => trace.instance),
  ).size
  const { spend } = useIllustrativeSpend(el.spendStart ?? 3.1, el.spendRatePerSecond ?? 0.14, activeInstanceCount, scope)
  const [usage, setUsage] = useState(0)
  const lastTick = useRef(Date.now())
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<DemoRequest>).detail
      if (request.scope !== scope) return
      setTraces((current) => {
        const activeByInstance = new Map<number, number>()
        current.filter((trace) => request.startedAt - trace.startedAt < trace.duration).forEach((trace) => activeByInstance.set(trace.instance, (activeByInstance.get(trace.instance) ?? 0) + 1))
        let instance = 0
        while ((activeByInstance.get(instance) ?? 0) >= 3) instance += 1
        return [...current.slice(-11), { ...request, instance }]
      })
    }
    const reset = (event: Event) => {
      if ((event as CustomEvent<DemoReset>).detail.scope !== scope) return
      setTraces([])
      setUsage(0)
      const tick = Date.now()
      setNow(tick)
      lastTick.current = tick
    }
    window.addEventListener(REQUEST_EVENT, receive)
    window.addEventListener(RESET_REQUEST_EVENT, reset)
    return () => {
      window.removeEventListener(REQUEST_EVENT, receive)
      window.removeEventListener(RESET_REQUEST_EVENT, reset)
    }
  }, [scope])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now()
      const elapsed = (tick - lastTick.current) / 1000
      lastTick.current = tick
      setNow(tick)
      const activeInstances = new Set(
        traces
          .filter((trace) => tick - trace.startedAt < trace.duration * FLUID_BILLING_FRACTION)
          .map((trace) => trace.instance),
      ).size
      if (activeInstances > 0) setUsage((current) => current + elapsed * activeInstances)
      setTraces((current) => current.filter((trace) => tick - trace.startedAt < trace.duration + 500))
    }, 80)
    return () => window.clearInterval(timer)
  }, [traces])
  const instanceIds = Array.from(new Set(traces.map((trace) => trace.instance))).sort((a, b) => a - b).slice(-3)
  const anyActive = activeInstanceCount > 0
  return (
    <ComputeCardShell el={el}>
    <div style={{ width: "100%", height: "100%", border: `1px solid ${computeToken.borderStrong}`, borderRadius: el.rounded ? 12 : 2, background: "#050505", color: "#ededed", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <header style={{ flexShrink: 0, minHeight: 66, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #202020" }}><div style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>Fluid</strong><span style={{ color: "#777", fontSize: 9.5 }}>Vercel Functions</span></div><span style={{ fontFamily: "var(--font-mono)", color: "#888", fontSize: 10 }}>Usage: <b style={{ color: "#ddd", fontWeight: 500 }}>{usage.toFixed(1)}s</b></span></header>
      <div style={{ minHeight: 0, flex: 1, overflow: "hidden", padding: "12px 0", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12 }}>
        {instanceIds.length === 0 ? <div style={{ margin: "auto", color: "#555", fontFamily: "var(--font-mono)", fontSize: 9 }}>Waiting for requests</div> : <div key={traces.at(-1)?.id} className="wb-compute-stack-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>{instanceIds.map((instance) => {
          const row = traces.filter((trace) => trace.instance === instance)
          const latestEnd = Math.max(...row.map((trace) => trace.startedAt + trace.duration))
          const latestBillingEnd = Math.max(...row.map((trace) => trace.startedAt + trace.duration * FLUID_BILLING_FRACTION))
          const earliestStart = Math.min(...row.map((trace) => trace.startedAt))
          const rowUsage = Math.min(Math.max(now - earliestStart, 0), latestBillingEnd - earliestStart) / 1000
          const openingProgress = Math.min(Math.max((now - earliestStart) / 350, 0), 1)
          const closingProgress = Math.min(Math.max((now - latestEnd) / 500, 0), 1)
          const lifecycleOpacity = Math.min(openingProgress, 1 - closingProgress)
          return (
            <div key={instance} style={{ flexShrink: 0, padding: "0 14px", display: "flex", flexDirection: "column", gap: 7, opacity: lifecycleOpacity, transform: `translateY(${(1 - openingProgress) * 4 - closingProgress * 4}px)`, transition: "opacity 80ms linear, transform 80ms linear" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: "#7d7d86", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>fluid-instance-{instance + 1}</span><span style={{ display: "flex", alignItems: "center", gap: 8 }}><FluidGlyph count={row.filter((trace) => now < trace.startedAt + trace.duration * FLUID_BILLING_FRACTION).length} /><span style={{ width: 32, color: "#8b8b95", fontFamily: "var(--font-mono)", fontSize: 10 }}>{rowUsage.toFixed(1)}s</span></span></div>
              <RequestTimeline requests={row} now={now} />
            </div>
          )
        })}</div>}
      </div>
      {el.showPricing !== false && <footer style={{ flexShrink: 0, padding: "11px 16px 13px", borderTop: "1px solid #202020", display: "flex", justifyContent: "center" }}><SpendDisplay amount={spend} rateLabel={anyActive ? "active compute spend" : "spend paused"} /></footer>}
    </div>
    </ComputeCardShell>
  )
}

function ServerlessComputeView({ el }: { el: CanvasElement }) {
  const scope = el.requestScope ?? el.id
  const [traces, setTraces] = useState<FluidTrace[]>([])
  const [now, setNow] = useState(() => Date.now())
  const activeInstanceCount = traces.filter(
    (trace) => now - trace.startedAt < trace.duration * FLUID_BILLING_FRACTION,
  ).length
  const { spend } = useIllustrativeSpend(el.spendStart ?? 0, el.spendRatePerSecond ?? 0.14, activeInstanceCount, scope)
  const [usage, setUsage] = useState(0)
  const lastTick = useRef(Date.now())
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<DemoRequest>).detail
      if (request.scope !== scope) return
      setTraces((current) => [...current.slice(-11), { ...request, instance: request.id }])
    }
    const reset = (event: Event) => {
      if ((event as CustomEvent<DemoReset>).detail.scope !== scope) return
      setTraces([])
      setUsage(0)
      const tick = Date.now()
      setNow(tick)
      lastTick.current = tick
    }
    window.addEventListener(REQUEST_EVENT, receive)
    window.addEventListener(RESET_REQUEST_EVENT, reset)
    return () => {
      window.removeEventListener(REQUEST_EVENT, receive)
      window.removeEventListener(RESET_REQUEST_EVENT, reset)
    }
  }, [scope])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now()
      const elapsed = (tick - lastTick.current) / 1000
      lastTick.current = tick
      setNow(tick)
      const activeInstances = traces.filter(
        (trace) => tick - trace.startedAt < trace.duration * FLUID_BILLING_FRACTION,
      ).length
      if (activeInstances > 0) setUsage((current) => current + elapsed * activeInstances)
      setTraces((current) => current.filter((trace) => tick - trace.startedAt < trace.duration * FLUID_BILLING_FRACTION + 500))
    }, 80)
    return () => window.clearInterval(timer)
  }, [traces])
  const visibleTraces = traces.slice(-5)
  return (
    <ComputeCardShell el={el}>
    <div style={{ width: "100%", height: "100%", border: `1px solid ${computeToken.borderStrong}`, borderRadius: el.rounded ? 12 : 2, background: "#050505", color: "#ededed", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <header style={{ flexShrink: 0, minHeight: 58, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #202020" }}><div style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>Serverless</strong><span style={{ color: "#777", fontSize: 9.5 }}>One request per instance</span></div><span style={{ fontFamily: "var(--font-mono)", color: "#888", fontSize: 10 }}>Usage: <b style={{ color: "#ddd", fontWeight: 500 }}>{usage.toFixed(1)}s</b></span></header>
      <div style={{ minHeight: 0, flex: 1, overflow: "hidden", padding: "8px 0", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 7 }}>
        {visibleTraces.length === 0 ? <div style={{ margin: "auto", color: "#555", fontFamily: "var(--font-mono)", fontSize: 9 }}>Waiting for requests</div> : <div key={visibleTraces.at(-1)?.id} className="wb-compute-stack-in" style={{ display: "flex", flexDirection: "column", gap: 7 }}>{visibleTraces.map((trace) => {
          const billingEnd = trace.startedAt + trace.duration * FLUID_BILLING_FRACTION
          const latestEnd = billingEnd
          const rowUsage = Math.min(Math.max(now - trace.startedAt, 0), billingEnd - trace.startedAt) / 1000
          const openingProgress = Math.min(Math.max((now - trace.startedAt) / 350, 0), 1)
          const closingProgress = Math.min(Math.max((now - latestEnd) / 500, 0), 1)
          const lifecycleOpacity = Math.min(openingProgress, 1 - closingProgress)
          const active = now < billingEnd
          return (
            <div key={trace.id} style={{ flexShrink: 0, padding: "0 14px", display: "flex", flexDirection: "column", gap: 4, opacity: lifecycleOpacity, transform: `translateY(${(1 - openingProgress) * 4 - closingProgress * 4}px)`, transition: "opacity 80ms linear, transform 80ms linear" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: "#7d7d86", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>serverless-instance-{trace.instance}</span><span style={{ display: "flex", alignItems: "center", gap: 8 }}><FluidGlyph count={active ? 1 : 0} /><span style={{ width: 32, color: "#8b8b95", fontFamily: "var(--font-mono)", fontSize: 10 }}>{rowUsage.toFixed(1)}s</span></span></div>
              <RequestTimeline requests={[trace]} now={now} compact />
            </div>
          )
        })}</div>}
      </div>
      {el.showPricing !== false && <footer style={{ flexShrink: 0, padding: "11px 16px 13px", borderTop: "1px solid #202020", display: "flex", justifyContent: "center" }}><SpendDisplay amount={spend} rateLabel={activeInstanceCount > 0 ? "active compute spend" : "spend paused"} /></footer>}
    </div>
    </ComputeCardShell>
  )
}

type ComparisonKind = "fluid" | "serverless" | "server"

const comparisonKinds: ComparisonKind[] = ["fluid", "serverless", "server"]

function ComputeComparisonView({ el }: { el: CanvasElement }) {
  const update = useWhiteboard((state) => state.update)
  const scope = el.requestScope ?? el.id
  const [enabled, setEnabled] = useState<Record<ComparisonKind, boolean>>({ fluid: true, serverless: true, server: true })
  useLayoutEffect(() => {
    if (el.width < 560 || el.height < 980) {
      update([el.id], { width: Math.max(560, el.width), height: Math.max(980, el.height) })
    }
  }, [el.height, el.id, el.width, update])
  const scopes: Record<ComparisonKind, string> = {
    fluid: `${scope}:fluid`,
    serverless: `${scope}:serverless`,
    server: `${scope}:server`,
  }
  const sectionElements: Record<ComparisonKind, CanvasElement> = {
    fluid: { ...el, id: `${el.id}:fluid`, type: "fluidcompute", requestScope: scopes.fluid, showRequestButton: false, showPricing: false, rounded: false },
    serverless: { ...el, id: `${el.id}:serverless`, type: "serverlesscompute", requestScope: scopes.serverless, showRequestButton: false, showPricing: false, rounded: false },
    server: { ...el, id: `${el.id}:server`, type: "ec2", requestScope: scopes.server, showRequestButton: false, showPricing: false, showServerTowers: false, rounded: false },
  }
  const sendRequest = (event: React.MouseEvent) => {
    event.stopPropagation()
    comparisonKinds.forEach((kind) => {
      if (enabled[kind]) dispatchDemoRequest(scopes[kind])
    })
  }
  const toggle = (kind: ComparisonKind) => (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation()
    setEnabled((current) => ({ ...current, [kind]: event.target.checked }))
  }
  return (
    <div style={{ width: "100%", height: "100%", border: `1px solid ${computeToken.borderStrong}`, borderRadius: el.rounded ? 12 : 2, background: "#050505", color: "#ededed", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      <header style={{ flexShrink: 0, minHeight: 58, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #202020", background: "#080808" }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          {comparisonKinds.map((kind) => <label key={kind} onPointerDown={(event) => event.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11.5, whiteSpace: "nowrap" }}><input type="checkbox" checked={enabled[kind]} onChange={toggle(kind)} style={{ width: 14, height: 14, accentColor: "#ededed" }} />{kind === "fluid" ? "Fluid" : kind === "serverless" ? "Serverless" : "Server"}</label>)}
        </div>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={sendRequest} style={{ ...requestControlStyle, flexShrink: 0, height: 32, gap: 7, padding: "0 14px", background: "#ededed", color: "#111", fontSize: 11.5, fontWeight: 500 }}><Zap size={14} />Send Request</button>
      </header>
      <div style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column" }}>
        {enabled.fluid && <div style={{ minHeight: 220, flex: 1, overflow: "hidden" }}><FluidComputeView el={sectionElements.fluid} /></div>}
        {enabled.serverless && <div style={{ minHeight: 220, flex: 1, overflow: "hidden" }}><ServerlessComputeView el={sectionElements.serverless} /></div>}
        {enabled.server && <div style={{ minHeight: 220, flex: 1, overflow: "hidden" }}><Ec2View el={sectionElements.server} /></div>}
      </div>
    </div>
  )
}

/**
 * AI Gateway showcase block. Demonstrates the product's core pitch: one API key,
 * hundreds of models, and swapping between them is a single line of code. Picking
 * a model pill rewrites only the `model:` line in the snippet and flashes it.
 */
function AiGatewayView({ el }: { el: CanvasElement }) {
  const update = useWhiteboard((s) => s.update)
  const contentRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState(false)

  const modelId = el.gatewayModel || DEFAULT_GATEWAY_MODEL
  const model = gatewayModelById(modelId) ?? GATEWAY_MODELS[0]
  const [creator, ...rest] = model.id.split("/")
  const modelName = rest.join("/")

  const mono = { fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: "20px" } as const

  // Auto-size the block to exactly fit its content (same approach as ServerView).
  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return
    let raf = 0
    const measure = () => {
      const h = Math.ceil(node.scrollHeight) + 2
      if (Math.abs(h - el.height) > 1) update([el.id], { height: h })
    }
    measure()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(node)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [el.id, el.height, el.width, modelId, update])

  const pickModel = (id: string) => {
    if (id === modelId) return
    update([el.id], { gatewayModel: id })
    setFlash(true)
    window.setTimeout(() => setFlash(false), 700)
  }

  // GitHub-dark token palette to match the other dark code/terminal blocks.
  const kw = "#ff7b72"
  const fn = "#79c0ff"
  const str = "#a5d6ff"
  const plain = "#c9d1d9"
  const muted = "#8b949e"

  return (
    <div
      ref={contentRef}
      style={{
        width: "100%",
        borderRadius: el.rounded ? 10 : 2,
        background: "#0a0a0a",
        border: "1px solid #2e2e2e",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          height: 38,
          background: "#141414",
          borderBottom: "1px solid #1f1f1f",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 9999, background: "#ff5f57" }} />
          <span style={{ width: 9, height: 9, borderRadius: 9999, background: "#febc2e" }} />
          <span style={{ width: 9, height: 9, borderRadius: 9999, background: "#28c840" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 4 }}>
          <Waypoints size={14} color="#ededed" strokeWidth={2} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#ededed" }}>AI Gateway</span>
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#8a8a8a",
            border: "1px solid #2a2a2a",
            borderRadius: 9999,
            padding: "2px 8px",
            whiteSpace: "nowrap",
          }}
        >
          1 key · 100+ models
        </span>
      </div>

      {/* code snippet */}
      <div style={{ padding: "14px 16px", ...mono, color: plain }}>
        <div>
          <span style={{ color: kw }}>import</span> {"{ "}
          <span style={{ color: fn }}>generateText</span>
          {" }"} <span style={{ color: kw }}>from</span> <span style={{ color: str }}>{"'ai'"}</span>
        </div>
        <div style={{ height: 12 }} />
        <div>
          <span style={{ color: kw }}>const</span> {"{ text } ="} <span style={{ color: kw }}>await</span>{" "}
          <span style={{ color: fn }}>generateText</span>
          {"({"}
        </div>

        {/* the one line that changes */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "1px -8px",
            padding: "1px 8px 1px 4px",
            borderLeft: `3px solid ${flash ? "#28c840" : model.accent}`,
            background: flash ? "rgba(40,200,64,0.14)" : "rgba(255,255,255,0.04)",
            borderRadius: 4,
            transition: "background 0.5s ease, border-color 0.5s ease",
          }}
        >
          <span style={{ paddingLeft: 16 }}>
            <span style={{ color: plain }}>model:</span>{" "}
            <span style={{ color: str }}>{"'"}</span>
            <span style={{ color: model.accent, fontWeight: 600 }}>{creator}</span>
            <span style={{ color: str }}>/{modelName}{"'"}</span>
            <span style={{ color: plain }}>,</span>
          </span>
        </div>

        <div style={{ paddingLeft: 16 }}>
          <span style={{ color: plain }}>prompt:</span> <span style={{ color: str }}>{"'Explain quantum computing'"}</span>
          <span style={{ color: plain }}>,</span>
        </div>
        <div>{"})"}</div>
      </div>

      {/* model picker */}
      <div style={{ borderTop: "1px solid #1f1f1f", padding: "12px 16px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#ededed" }}>Swap models</span>
          <span style={{ fontSize: 11, color: muted }}>— change one line</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {GATEWAY_MODELS.map((m) => {
            const activePill = m.id === model.id
            return (
              <button
                key={m.id}
                type="button"
                title={m.id}
                aria-pressed={activePill}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  pickModel(m.id)
                }}
                style={{
                  pointerEvents: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: `1px solid ${activePill ? m.accent : "#2a2a2a"}`,
                  background: activePill ? "rgba(255,255,255,0.06)" : "#111",
                  color: activePill ? "#ededed" : "#b4b4b4",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: activePill ? 600 : 500,
                  transition: "border-color 0.15s ease, background 0.15s ease, color 0.15s ease",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: m.accent,
                    flexShrink: 0,
                  }}
                />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ImageView({ el, b }: { el: CanvasElement; b: { width: number; height: number } }) {
  if (!el.src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={el.src || "/placeholder.svg"}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "fill",
        borderRadius: el.rounded ? 8 : 0,
        display: "block",
        userSelect: "none",
      }}
    />
  )
}
