"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Blocks,
  X,
  Search,
  Code2,
  SquareTerminal,
  Globe,
  Server,
  FolderTree,
  ArrowRight,
  Waypoints,
  Square,
  HardDrive,
  FunctionSquare,
} from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import type { ElementType, Tool } from "@/lib/whiteboard/types"
import { cn } from "@/lib/utils"
import {
  WORKFLOW_TEMPLATES,
  instantiateTemplate,
  type WorkflowTemplate,
} from "@/lib/whiteboard/workflow-templates"

interface LibraryItem {
  id: Tool
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  keywords: string[]
}

const ITEMS: LibraryItem[] = [
  {
    id: "code",
    icon: Code2,
    label: "Code block",
    description: "Syntax-highlighted snippet with a file name.",
    keywords: ["code", "snippet", "editor", "file", "typescript", "js"],
  },
  {
    id: "terminal",
    icon: SquareTerminal,
    label: "Terminal",
    description: "Command-line output panel.",
    keywords: ["terminal", "shell", "bash", "cli", "console", "command"],
  },
  {
    id: "website",
    icon: Globe,
    label: "Website",
    description: "Browser window frame with a URL bar.",
    keywords: ["website", "browser", "web", "url", "page", "site"],
  },
  {
    id: "server",
    icon: Server,
    label: "Server",
    description: "API endpoint node with method and response.",
    keywords: ["server", "api", "endpoint", "backend", "request", "http"],
  },
  {
    id: "ec2",
    icon: HardDrive,
    label: "Amazon EC2",
    description: "Always-on server tower with live illustrative spend.",
    keywords: ["aws", "amazon", "ec2", "server", "instance", "compute", "cost", "spend"],
  },
  {
    id: "fluidcompute",
    icon: FunctionSquare,
    label: "Vercel Fluid Compute",
    description: "Pooled functions with active-compute spend.",
    keywords: ["vercel", "functions", "fluid", "compute", "serverless", "cost", "spend", "pool"],
  },
  {
    id: "filetree",
    icon: FolderTree,
    label: "eve agent",
    description: "IDE-style file tree for an eve agent, with editable templates.",
    keywords: ["eve", "agent", "file", "tree", "explorer", "ai", "tool", "folder"],
  },
  {
    id: "aigateway",
    icon: Waypoints,
    label: "AI Gateway",
    description: "Swap between hundreds of models by changing one line of code.",
    keywords: ["ai", "gateway", "model", "models", "provider", "openai", "anthropic", "llm", "switch", "route"],
  },
]

// Icons used to sketch a template's flow inside its thumbnail.
const NODE_ICONS: Partial<Record<ElementType, React.ComponentType<{ className?: string }>>> = {
  website: Globe,
  code: Code2,
  server: Server,
  terminal: SquareTerminal,
  filetree: FolderTree,
  aigateway: Waypoints,
  ec2: HardDrive,
  fluidcompute: FunctionSquare,
}

type Section = "components" | "templates"

/**
 * A miniature "image" of the template's actual flow: the ordered node glyphs
 * (website → code → server → website) connected by arrows, drawn on a subtle
 * dotted mini-canvas so it reads like a shrunken board.
 */
function FlowThumbnail({ template }: { template: WorkflowTemplate }) {
  return (
    <div
      className="flex h-full min-h-[92px] w-full items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-border bg-background px-1.5"
      style={{
        backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
        backgroundSize: "10px 10px",
      }}
    >
      {template.nodes.map((n, i) => {
        const Icon = NODE_ICONS[n.type] ?? Square
        return (
          <span key={n.ref} className="flex items-center gap-0.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground">
              <Icon className="size-3" />
            </span>
            {i < template.nodes.length - 1 && <ArrowRight className="size-2.5 shrink-0 text-muted-foreground/60" />}
          </span>
        )
      })}
    </div>
  )
}

export function ComponentLibrary() {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section>("components")
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const setTool = useWhiteboard((s) => s.setTool)
  const addTemplate = useWhiteboard((s) => s.addTemplate)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setSection("components")
      // focus the search field once the modal is mounted
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const componentResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ITEMS
    return ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        it.keywords.some((k) => k.includes(q)),
    )
  }, [query])

  const templateResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return WORKFLOW_TEMPLATES
    return WORKFLOW_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.preview.some((p) => p.toLowerCase().includes(q)),
    )
  }, [query])

  // A live query searches across BOTH sections at once; the tabs only drive the
  // default (empty-query) view.
  const searching = query.trim().length > 0

  const pickComponent = (item: LibraryItem) => {
    setTool(item.id)
    setOpen(false)
  }

  const useTemplate = (t: WorkflowTemplate) => {
    const { elements, connections } = instantiateTemplate(t)
    addTemplate(elements, connections)
    setOpen(false)
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    if (searching) {
      // Prefer a matching component, otherwise fall back to a matching template.
      if (componentResults.length > 0) pickComponent(componentResults[0])
      else if (templateResults.length > 0) useTemplate(templateResults[0])
    } else if (section === "components" && componentResults.length > 0) {
      pickComponent(componentResults[0])
    } else if (section === "templates" && templateResults.length > 0) {
      useTemplate(templateResults[0])
    }
  }

  const renderComponentRow = (item: LibraryItem) => {
    const Icon = item.icon
    return (
      <button
        key={item.id}
        onClick={() => pickComponent(item)}
        className={cn(
          "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors",
          "hover:border-border hover:bg-muted",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
          <Icon className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{item.label}</span>
          <span className="truncate text-xs text-muted-foreground">{item.description}</span>
        </span>
      </button>
    )
  }

  const renderTemplateRow = (t: WorkflowTemplate) => (
    <button
      key={t.id}
      onClick={() => useTemplate(t)}
      className="group flex items-stretch gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-muted"
    >
      {/* flow "image" card */}
      <span className="w-40 shrink-0">
        <FlowThumbnail template={t} />
      </span>

      {/* details */}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t.name}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">{t.description}</p>
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {t.preview.map((chip, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {chip}
              </span>
              {i < t.preview.length - 1 && <span className="text-muted-foreground/50">{"→"}</span>}
            </span>
          ))}
        </span>
      </span>
    </button>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Components & templates"
        className="flex size-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Blocks className="size-[18px]" />
      </button>

      {open && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Components and templates"
        >
          {/* backdrop */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* modal */}
          <div className="relative z-10 flex max-h-[74vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {/* search */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search components and templates…"
                className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* section filter — only relevant when not searching across both */}
            {!searching && (
              <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
                {(
                  [
                    { id: "components", label: "Components" },
                    { id: "templates", label: "Templates" },
                  ] as { id: Section; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSection(tab.id)}
                    aria-pressed={section === tab.id}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      section === tab.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* body */}
            {searching ? (
              <div className="flex flex-col gap-1 overflow-y-auto p-2">
                {componentResults.length === 0 && templateResults.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No components or templates match {`"${query}"`}
                  </div>
                ) : (
                  <>
                    {componentResults.length > 0 && (
                      <>
                        <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Components
                        </div>
                        {componentResults.map(renderComponentRow)}
                      </>
                    )}
                    {templateResults.length > 0 && (
                      <>
                        <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Templates
                        </div>
                        {templateResults.map(renderTemplateRow)}
                      </>
                    )}
                  </>
                )}
              </div>
            ) : section === "components" ? (
              <div className="flex flex-col gap-1 overflow-y-auto p-2">{ITEMS.map(renderComponentRow)}</div>
            ) : (
              <div className="flex flex-col gap-1 overflow-y-auto p-2">
                {WORKFLOW_TEMPLATES.map(renderTemplateRow)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
