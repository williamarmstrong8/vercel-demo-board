"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Sparkles,
  X,
  ArrowUp,
  Loader2,
  SquareArrowOutUpRight,
  Plus,
  Check,
  RotateCcw,
} from "lucide-react"
import { FALLBACK_MODELS, pickDefaultModel, type BuilderModel } from "@/lib/ai/models"
import { STYLE_IDS, STYLE_META, type StyleId } from "@/lib/boards/styles"
import {
  BUILD_STREAM_CONTENT_TYPE,
  type BuildEvent,
  type BuildStepStatus,
  type BuiltBoard,
} from "@/lib/ai/build-events"
import { cn } from "@/lib/utils"

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
  // Sources attached to a user turn, shown with the message so it's clear what
  // the build actually read.
  sources?: Source[]
  // Prompt to re-send when a turn fails for a reason worth another attempt.
  retry?: string
  // Steps this turn ran through, kept in the transcript once it finishes.
  steps?: BuildStep[]
}

interface BuildStep {
  id: string
  label: string
  status: BuildStepStatus
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

const EXAMPLE_PROMPTS = [
  "A three-tier web app: client, API server, and Postgres database",
  "The request flow for an AI chatbot using the Vercel AI Gateway",
  "A CI/CD pipeline from git push to production deploy",
]

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
  // The style is the user's choice, not the model's: it selects the engine's
  // design tokens and layout vocabulary as well as the authoring skill the model
  // is given, so it decides what the board looks like more than the prompt does.
  const [style, setStyle] = useState<StyleId>("visual")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [boardId, setBoardId] = useState<string | null>(null)

  // Live progress for the turn currently running.
  const [steps, setSteps] = useState<BuildStep[]>([])
  const [streamedText, setStreamedText] = useState("")

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
  }, [messages, steps, streamedText, loading])

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

  async function send(text: string, opts: { resend?: boolean } = {}) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // A retry re-runs the last user turn, so drop the failed reply instead of
    // repeating the prompt in the transcript.
    const history = [...messages]
    if (opts.resend) {
      while (history.length > 0 && history[history.length - 1].role === "assistant") history.pop()
    } else {
      history.push({
        role: "user",
        content: trimmed,
        sources: sources.length > 0 ? [...sources] : undefined,
      })
    }

    setMessages(history)
    setInput("")
    setSteps([])
    setStreamedText("")
    setLoading(true)

    // Progress accumulates here as well as in state: the final transcript entry
    // keeps the step list, and state updates are too batched to read back from.
    const turnSteps: BuildStep[] = []
    const applyStep = (next: BuildStep) => {
      const i = turnSteps.findIndex((s) => s.id === next.id)
      if (i === -1) turnSteps.push(next)
      else turnSteps[i] = next
      setSteps([...turnSteps])
    }

    const finish = (message: Omit<ChatMessage, "role">) => {
      setMessages((m) => [...m, { role: "assistant", steps: [...turnSteps], ...message }])
    }

    let reply = ""
    let settled = false

    try {
      const res = await fetch("/api/ai/build-board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          style,
          boardId,
          sources,
          userId: userIdRef.current,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      })

      // Request-level rejections (bad input, expired session) answer with plain
      // JSON before the stream ever starts.
      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes(BUILD_STREAM_CONTENT_TYPE)) {
        const data = await res.json().catch(() => ({}) as { error?: string })
        settled = true
        if (res.status === 401) {
          finish({
            content: "Your session expired. Sign in again to keep building.",
            error: true,
            needsSignIn: true,
          })
        } else {
          finish({
            content: data.error || "Something went wrong building the board. Please try again.",
            error: true,
            retry: trimmed,
          })
        }
        return
      }

      if (!res.body) throw new Error("The server sent an empty response.")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const handle = (event: BuildEvent) => {
        switch (event.type) {
          case "step":
            applyStep({ id: event.id, label: event.label, status: event.status })
            break
          case "text":
            reply += event.delta
            setStreamedText(reply)
            break
          case "needs-auth":
            if (event.authorizeUrl) openAuthPopup(event.authorizeUrl)
            settled = true
            finish({
              content:
                "Connect your Notion account in the popup that just opened, then send your message again to build from those pages.",
              error: true,
              retry: trimmed,
            })
            break
          case "error":
            settled = true
            finish({ content: event.message, error: true, retry: trimmed })
            break
          case "done":
            settled = true
            if (event.board?.id) setBoardId(event.board.id)
            finish({ content: event.reply, board: event.board ?? undefined })
            break
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline: number
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (!line) continue
          try {
            handle(JSON.parse(line) as BuildEvent)
          } catch {
            // A partial or malformed line isn't worth failing the whole turn.
          }
        }
      }

      // The stream ended without a terminal event, so the connection was cut
      // rather than the build finishing.
      if (!settled) {
        settled = true
        finish({
          content: reply
            ? `${reply}\n\nThe connection dropped before the build finished.`
            : "The connection dropped before the build finished. Your board may be incomplete.",
          error: true,
          retry: trimmed,
        })
      }
    } catch (err) {
      if (!settled) {
        const detail = err instanceof Error ? err.message : ""
        finish({
          content: `Couldn't reach the build service${detail ? ` (${detail})` : ""}. Check your connection and try again.`,
          error: true,
          retry: trimmed,
        })
      }
    } finally {
      setLoading(false)
      setSteps([])
      setStreamedText("")
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
              <MessageRow
                key={i}
                message={m}
                onOpen={(url) => router.push(url)}
                onRetry={(prompt) => send(prompt, { resend: true })}
                retryDisabled={loading}
              />
            ))
          )}
          {loading && <BuildProgress steps={steps} text={streamedText} />}
        </div>

        {/* Composer — attached sources sit inside the input, above the text, so
            it's clear they're being sent along with the prompt. */}
        <div className="border-t border-border p-3">
          <StylePicker
            value={style}
            onChange={setStyle}
            disabled={loading}
            // Once a board exists, follow-up turns append to it — switching the
            // design system halfway down a board would be the one way left to
            // make it look inconsistent.
            locked={!!boardId}
          />

          <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-background px-2 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-0.5 pt-0.5">
                {sources.map((s) => (
                  <SourceChip
                    key={s.url}
                    source={s}
                    onRemove={() => setSources((cur) => cur.filter((x) => x.url !== s.url))}
                  />
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
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
                  boardId
                    ? "Ask for changes or more blocks…"
                    : "Describe the board you want to build…"
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
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Which of the three design systems the board is built with. A segmented control
 * rather than a dropdown because it is a deliberate up-front choice, not a
 * setting — the style changes the layout vocabulary available to the model, not
 * just the colors.
 */
function StylePicker({
  value,
  onChange,
  disabled,
  locked,
}: {
  value: StyleId
  onChange: (style: StyleId) => void
  disabled: boolean
  locked: boolean
}) {
  const frozen = disabled || locked
  return (
    <div className="mb-2.5">
      <div
        role="radiogroup"
        aria-label="Board style"
        className="flex gap-1 rounded-xl bg-muted p-1"
      >
        {STYLE_IDS.map((id) => {
          const active = id === value
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={frozen}
              onClick={() => onChange(id)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                frozen && "cursor-not-allowed opacity-60 hover:text-muted-foreground",
              )}
            >
              {STYLE_META[id].label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
        {locked
          ? `${STYLE_META[value].label} style — fixed for the rest of this board.`
          : STYLE_META[value].blurb}
      </p>
    </div>
  )
}

function SourceChip({ source, onRemove }: { source: Source; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-card py-1 pl-2 text-xs text-foreground",
        onRemove ? "pr-1" : "pr-2",
      )}
    >
      <NotionMark className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{notionPageLabel(source.url)}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove source"
          onClick={onRemove}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function StepIcon({ status }: { status: BuildStepStatus }) {
  if (status === "active") return <Loader2 className="size-3.5 animate-spin text-foreground" />
  if (status === "error") return <X className="size-3.5 text-destructive" />
  return <Check className="size-3.5 text-muted-foreground" />
}

function StepList({ steps, muted }: { steps: BuildStep[]; muted?: boolean }) {
  if (steps.length === 0) return null
  return (
    <ol
      className={cn(
        "space-y-1.5 rounded-xl border border-border px-3 py-2.5",
        muted ? "bg-transparent" : "bg-card",
      )}
    >
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2 text-xs leading-relaxed">
          <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
            <StepIcon status={s.status} />
          </span>
          <span
            className={cn(
              "min-w-0 break-words",
              s.status === "error"
                ? "text-destructive"
                : s.status === "active" && !muted
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Live narration of the turn in flight: what's running, and the reply forming. */
function BuildProgress({ steps, text }: { steps: BuildStep[]; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {steps.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Starting the build…
        </div>
      ) : (
        <StepList steps={steps} />
      )}
      {text && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground">
          {text}
        </div>
      )}
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
  onRetry,
  retryDisabled,
}: {
  message: ChatMessage
  onOpen: (url: string) => void
  onRetry: (prompt: string) => void
  retryDisabled: boolean
}) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.sources && message.sources.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.sources.map((s) => (
              <SourceChip key={s.url} source={s} />
            ))}
          </div>
        )}
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {message.steps && message.steps.length > 0 && <StepList steps={message.steps} muted />}
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
      {message.retry && (
        <button
          type="button"
          disabled={retryDisabled}
          onClick={() => onRetry(message.retry!)}
          className="inline-flex self-start items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" />
          Try again
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
