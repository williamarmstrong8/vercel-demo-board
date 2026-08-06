"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, X, ArrowUp, Loader2, SquareArrowOutUpRight, Plus, Check } from "lucide-react"
import { GATEWAY_MODELS } from "@/lib/whiteboard/ai-gateway-models"
import { cn } from "@/lib/utils"

interface BuilderModel {
  id: string
  name: string
  provider: string
}

interface BuiltBoard {
  id: string
  name: string
  blocks: number
  url: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  board?: BuiltBoard
  error?: boolean
  // The session cookie is a plain ID token with no refresh, so it can quietly
  // expire while this page is left open — the homepage itself still looks
  // signed in until the next hard navigation. Surface a real way out instead
  // of a dead-end error bubble.
  needsSignIn?: boolean
}

// A page/document the AI should read while building. Notion for now.
interface Source {
  type: "notion"
  url: string
}

interface NotionState {
  connected: boolean
  name?: string
  checked: boolean
}

// Notion's compact glyph, used on the source chip and connect row.
function NotionMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4.6 3.6 15 2.8c1.3-.1 1.6 0 2.4.6l2.4 1.7c.5.4.7.5.7 1v13.3c0 .8-.3 1.3-1.3 1.3l-11 .7c-.8 0-1.2-.1-1.6-.7l-2-2.6c-.4-.6-.6-1-.6-1.6V4.9c0-.7.3-1.2 1.2-1.3Zm10.7 2-9.8.7c-.2 0-.2.1-.1.2l.9.7c.2.1.4.2.8.2l9.3-.6c.2 0 .3-.1.1-.3l-.8-.7c-.2-.2-.4-.2-.8-.2ZM6.4 9v9.5c0 .3.1.4.4.4l10.2-.6c.3 0 .3-.2.3-.4V8.5c0-.2-.1-.3-.4-.3l-10.3.6c-.3 0-.4.1-.4.4Zm9 .8c0 .2 0 .4-.3.4l-.5.1v7c-.4.2-.8.3-1.1.3-.5 0-.6-.2-1-.6l-2.9-4.6v4.4l1 .2s0 .6-.8.6l-2.2.1c0-.2 0-.4.3-.5l.5-.1v-6.3l-.8-.1c0-.2.1-.5.5-.5l2.4-.2 3 4.6v-4l-.8-.1c0-.3.2-.5.6-.5Z" />
    </svg>
  )
}

// Stable per-browser id so Vercel Connect can hold this visitor's Notion grant.
// The app is sign-in-free, so there's no server-side user to key on — each
// browser is its own Connect subject.
function getAnonUserId(): string {
  if (typeof window === "undefined") return "anonymous"
  const KEY = "canvas:user-id"
  let id = window.localStorage.getItem(KEY)
  if (!id) {
    id = `usr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
    window.localStorage.setItem(KEY, id)
  }
  return id
}

// Accept links pasted with or without a protocol, and notion:// desktop links,
// so a bare "notion.so/…" paste still validates.
function normalizeNotionUrl(raw: string): string {
  let t = raw.trim()
  if (!t) return t
  t = t.replace(/^notion:\/\//i, "https://")
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`
  return t
}

// Notion serves pages across a few domains — notion.so, notion.site (published
// sites), and the newer notion.com (e.g. app.notion.com share links).
const NOTION_HOSTS = ["notion.so", "notion.site", "notion.com"]

function isNotionUrl(url: string): boolean {
  try {
    const h = new URL(normalizeNotionUrl(url)).hostname.toLowerCase()
    return NOTION_HOSTS.some((base) => h === base || h.endsWith(`.${base}`))
  } catch {
    return false
  }
}

function notionPageLabel(url: string): string {
  // Notion page URLs end with "…Some-Title-<hex id>". Pull a readable title.
  try {
    const slug = new URL(normalizeNotionUrl(url)).pathname.split("/").pop() ?? ""
    const words = slug.replace(/-?[0-9a-f]{16,}$/i, "").replace(/-/g, " ").trim()
    return words || "Notion page"
  } catch {
    return "Notion page"
  }
}

// Fallback so the picker is never empty if the Gateway catalog can't be reached.
const FALLBACK_MODELS: BuilderModel[] = GATEWAY_MODELS.map((m) => ({
  id: m.id,
  name: m.label,
  provider: m.provider,
}))

// Preferred default, matched loosely against whatever the Gateway returns.
const PREFERRED_DEFAULTS = ["anthropic/claude-sonnet", "openai/gpt-5", "openai/gpt", "google/gemini"]

const EXAMPLE_PROMPTS = [
  "A three-tier web app: client, API server, and Postgres database",
  "The request flow for an AI chatbot using the Vercel AI Gateway",
  "A CI/CD pipeline from git push to production deploy",
]

function pickDefaultModel(models: BuilderModel[]): string {
  for (const pref of PREFERRED_DEFAULTS) {
    const hit = models.find((m) => m.id.startsWith(pref))
    if (hit) return hit.id
  }
  return models[0]?.id ?? ""
}

export function AiBoardBuilder() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Build a board with AI"
          className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="size-6" />
        </button>
      )}
      {open && <BuilderModal onClose={() => setOpen(false)} />}
    </>
  )
}

function BuilderModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [models, setModels] = useState<BuilderModel[]>(FALLBACK_MODELS)
  const [model, setModel] = useState<string>(() => pickDefaultModel(FALLBACK_MODELS))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [boardId, setBoardId] = useState<string | null>(null)

  const [sources, setSources] = useState<Source[]>([])
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [notionUrl, setNotionUrl] = useState("")
  const [notion, setNotion] = useState<NotionState>({ connected: false, checked: false })

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const userIdRef = useRef<string>("")

  // Load the real, currently-available Gateway models for the picker.
  useEffect(() => {
    let active = true
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((data: { models?: BuilderModel[] }) => {
        if (!active || !data.models?.length) return
        setModels(data.models)
        setModel((current) =>
          data.models!.some((m) => m.id === current) ? current : pickDefaultModel(data.models!),
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Anonymous per-browser id + Notion connection status. The consent popup
  // (app/connections/callback) posts back here when authorization completes.
  useEffect(() => {
    userIdRef.current = getAnonUserId()
    const check = () => {
      fetch(`/api/connections/notion?userId=${encodeURIComponent(userIdRef.current)}`)
        .then((r) => r.json())
        .then((d: { connected?: boolean; name?: string }) =>
          setNotion({ connected: !!d.connected, name: d.name, checked: true }),
        )
        .catch(() => setNotion((n) => ({ ...n, checked: true })))
    }
    check()
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "vercel-connect") check()
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Focus the composer on open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  function openAuthPopup(url: string) {
    window.open(url, "vercel-connect-notion", "width=520,height=720,menubar=no,toolbar=no")
  }

  async function connectNotion() {
    try {
      const res = await fetch("/api/connections/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: userIdRef.current }),
      })
      const data = await res.json()
      if (data.url) openAuthPopup(data.url)
    } catch {
      // A failure here shows up as an unchanged "not connected" state.
    }
  }

  function addNotionSource() {
    if (!isNotionUrl(notionUrl)) return
    const url = normalizeNotionUrl(notionUrl)
    setSources((s) => (s.some((x) => x.url === url) ? s : [...s, { type: "notion", url }]))
    setNotionUrl("")
    setSourcesOpen(false)
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }]
    setMessages(nextMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai/build-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          boardId,
          sources,
          userId: userIdRef.current,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      })
      const data = await res.json()

      if (data.needsAuth === "notion") {
        if (data.authorizeUrl) openAuthPopup(data.authorizeUrl)
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Connect your Notion account in the popup that just opened, then send your message again to build from those pages.",
            error: true,
          },
        ])
      } else if (res.status === 401) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Your session expired. Sign in again to keep building.",
            error: true,
            needsSignIn: true,
          },
        ])
      } else if (!res.ok || data.error) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.error || "Something went wrong building the board. Please try again.",
            error: true,
          },
        ])
      } else {
        if (data.board?.id) setBoardId(data.board.id)
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.reply, board: data.board ?? undefined },
        ])
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Network error — please try again.", error: true },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const grouped = groupByProvider(models)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Build a board with AI"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative flex h-[70vh] max-h-[640px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">Build a board</p>
            <p className="truncate text-xs text-muted-foreground">Describe it — AI drafts the canvas</p>
          </div>
          <label className="sr-only" htmlFor="ai-model">
            Model
          </label>
          <select
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-[9.5rem] rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {grouped.map(([provider, list]) => (
              <optgroup key={provider} label={provider}>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <EmptyState onPick={(p) => send(p)} disabled={loading} />
          ) : (
            messages.map((m, i) => (
              <MessageRow key={i} message={m} onOpen={(url) => router.push(url)} />
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Building…
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3">
          {/* Attached source chips */}
          {sources.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <span
                  key={s.url}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card py-1 pl-2 pr-1 text-xs text-foreground"
                >
                  <NotionMark className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{notionPageLabel(s.url)}</span>
                  <button
                    type="button"
                    aria-label="Remove source"
                    onClick={() => setSources((cur) => cur.filter((x) => x.url !== s.url))}
                    className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative flex items-end gap-2 rounded-xl border border-border bg-background px-2 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            {/* Add-source ("+") button */}
            <button
              type="button"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-label="Add a source"
              aria-expanded={sourcesOpen}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
            >
              <Plus className="size-4" />
            </button>

            {sourcesOpen && (
              <SourcesPopover
                notion={notion}
                notionUrl={notionUrl}
                setNotionUrl={setNotionUrl}
                onAdd={addNotionSource}
                onConnect={connectNotion}
                onClose={() => setSourcesOpen(false)}
              />
            )}

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              placeholder={
                boardId ? "Ask for changes or more blocks…" : "Describe the board you want to build…"
              }
              className="max-h-32 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SourcesPopover({
  notion,
  notionUrl,
  setNotionUrl,
  onAdd,
  onConnect,
  onClose,
}: {
  notion: NotionState
  notionUrl: string
  setNotionUrl: (v: string) => void
  onAdd: () => void
  onConnect: () => void
  onClose: () => void
}) {
  const valid = isNotionUrl(notionUrl.trim())
  return (
    <>
      {/* click-away layer */}
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Add a source</p>
          {notion.connected ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Check className="size-3 shrink-0 text-foreground" />
              <span className="truncate">{notion.name ? notion.name : "Notion connected"}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <NotionMark className="size-3" /> Connect Notion
            </button>
          )}
        </div>
        <label className="mb-1 block text-[11px] text-muted-foreground">Notion page link</label>
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            value={notionUrl}
            onChange={(e) => setNotionUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onAdd()
              }
            }}
            placeholder="https://notion.so/…"
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!valid}
            className="flex h-8 shrink-0 items-center rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {notion.connected
            ? "The AI will read this page and build from its content."
            : "Connect Notion so the AI can read the page — you’ll be prompted when you build if it isn’t connected."}
        </p>
      </div>
    </>
  )
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
        <Sparkles className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Describe a board to build</p>
        <p className="mx-auto max-w-xs text-pretty text-xs leading-relaxed text-muted-foreground">
          Architecture diagrams, request flows, demos — described in plain language, drawn on the
          canvas.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageRow({
  message,
  onOpen,
}: {
  message: ChatMessage
  onOpen: (url: string) => void
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm",
          message.error ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
        )}
      >
        {message.content}
      </div>
      {message.needsSignIn && (
        <button
          type="button"
          onClick={() => {
            const next = window.location.pathname + window.location.search
            window.location.href = `/api/auth/authorize?next=${encodeURIComponent(next)}`
          }}
          className="self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      )}
      {message.board && (
        <button
          type="button"
          onClick={() => onOpen(message.board!.url)}
          className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-foreground/30"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{message.board.name}</p>
            <p className="text-xs text-muted-foreground">
              {message.board.blocks} block{message.board.blocks === 1 ? "" : "s"} · Open board
            </p>
          </div>
          <SquareArrowOutUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      )}
    </div>
  )
}

function groupByProvider(models: BuilderModel[]): [string, BuilderModel[]][] {
  const map = new Map<string, BuilderModel[]>()
  for (const m of models) {
    const list = map.get(m.provider) ?? []
    list.push(m)
    map.set(m.provider, list)
  }
  return [...map.entries()]
}
