"use client"

import { useState } from "react"
import {
  Trash2,
  Copy,
  BringToFront,
  SendToBack,
  Minus,
  Plus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import type { CanvasElement, CodeThemeId } from "@/lib/whiteboard/types"
import { CODE_THEMES } from "@/lib/whiteboard/code-themes"
import { CODE_PRESETS } from "@/lib/whiteboard/code-presets"
import { AGENT_STRUCTURES, EVE_ADD_CATEGORIES, EVE_CHANNELS, type EveStructureTemplate } from "@/lib/whiteboard/eve-templates"
import { WEBSITE_TEMPLATES } from "@/components/whiteboard/website-templates"
import { cn } from "@/lib/utils"

// 3 shades per hue: light -> mid -> dark
const STROKE_COLORS = [
  ["#a3a3a3", "#525252", "#171717"], // neutral
  ["#66b2ff", "#0070f3", "#0049b0"], // blue
  ["#f7a4a4", "#e5484d", "#b42318"], // red
  ["#6ee7b7", "#17c964", "#0a7d3f"], // green
  ["#fcd34d", "#f5a623", "#c2610c"], // amber
]

const FILL_COLORS = [
  ["#f4f4f5", "#d4d4d8", "#a1a1aa"], // neutral
  ["#e6f0ff", "#bcdcff", "#7cb8ff"], // blue
  ["#ffe5e5", "#ffc7c7", "#ff9a9a"], // red
  ["#dcfce7", "#bbf7d0", "#86efac"], // green
  ["#fef3c7", "#fde68a", "#fcd34d"], // amber
]

const NO_STROKE = "transparent"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border/60 px-4 py-3.5 last:border-b-0">
      <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useWhiteboard((s) => s.selectedIds)
  const editingId = useWhiteboard((s) => s.editingId)
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const update = useWhiteboard((s) => s.update)
  const updateWithHistory = useWhiteboard((s) => s.updateWithHistory)
  const beginInteraction = useWhiteboard((s) => s.beginInteraction)
  const del = useWhiteboard((s) => s.deleteSelected)
  const select = useWhiteboard((s) => s.select)
  const dup = useWhiteboard((s) => s.duplicateSelected)
  const front = useWhiteboard((s) => s.bringToFront)
  const back = useWhiteboard((s) => s.sendToBack)
  // For a custom agent the menu shows the "add capabilities" view; this lets the
  // user pop back to the template picker without leaving the custom structure.
  const [browsingTemplates, setBrowsingTemplates] = useState(false)

  const selected = elements.filter((e) => selectedIds.includes(e.id))
  if (selected.length === 0 || editingId) return null

  const first = selected[0]
  const ids = selected.map((e) => e.id)

  // Companion code blocks and channel UI blocks (both spawned by a file-tree)
  // have no edit menu — they're driven entirely by their file-tree block.
  if (selected.length === 1 && (first.companionOf || first.channelParent)) return null

  // Reset a file-tree block to a whole-structure template (agent name + files).
  // If a companion code block is open, refresh it to show the equivalent file
  // from the new template (keeping the same file if it exists, else agent.ts).
  const applyStructure = (tree: CanvasElement, s: EveStructureTemplate) => {
    const files = s.files.map((f) => ({ ...f }))
    const companion = tree.companionId ? elements.find((e) => e.id === tree.companionId) : undefined

    // Close any open channel UI (and its pinned sandbox, via the cascade delete)
    // whose backing channel file is not part of the newly selected template.
    const newFileNames = new Set(files.map((f) => f.name))
    const orphanUiIds = elements
      .filter((e) => e.type === "channelui" && e.channelParent === tree.id)
      .filter((e) => {
        const channel = EVE_CHANNELS.find((c) => c.id === e.channel)
        return !channel || !newFileNames.has(channel.file)
      })
      .map((e) => e.id)
    if (orphanUiIds.length) {
      select(orphanUiIds)
      del()
    }

    let activeFile: string | undefined = undefined
    if (companion) {
      const next = files.find((f) => f.name === tree.activeFile) ?? files.find((f) => f.name === "agent.ts") ?? files[0]
      if (next) {
        activeFile = next.name
        update([companion.id], { title: next.name, text: next.code, codeTheme: next.codeTheme ?? "dark" })
      }
    }
    updateWithHistory([tree.id], { agentName: s.agentName, agentTemplate: s.id, files, activeFile })
    // Re-select the tree so its edit menu stays open after any UI cleanup.
    select([tree.id])
    // Picking "Custom" swaps the menu to the add-capabilities view; any other
    // template keeps the template picker on screen.
    setBrowsingTemplates(s.id !== "custom")
  }

  // Toggle a capability file on a custom agent's tree: add it if absent, remove
  // it if it's already present. Removing a channel also closes its open message
  // UI, and removing the currently-open file resets the companion code block.
  const toggleCapabilityFile = (tree: CanvasElement, file: string, code: string, exclusive = false) => {
    const existing = tree.files ?? []
    const current = existing.find((f) => f.name === file)
    const present = current !== undefined

    if (!present) {
      updateWithHistory([tree.id], { files: [...existing, { name: file, code, codeTheme: "dark" }] })
      return
    }

    // Exclusive category (e.g. sandbox): clicking a different option swaps the
    // active one in place rather than removing it — an agent keeps exactly one.
    if (exclusive && current.code !== code) {
      const files = existing.map((f) => (f.name === file ? { ...f, code } : f))
      if (tree.activeFile === file) {
        const companion = elements.find((e) => e.id === tree.companionId)
        if (companion) update([companion.id], { text: code, codeTheme: "dark" })
      }
      updateWithHistory([tree.id], { files })
      select([tree.id])
      return
    }

    // --- removal ---
    // If this file backs a channel, close any open message UI for that channel.
    const channel = EVE_CHANNELS.find((c) => c.file === file)
    if (channel) {
      const uiIds = elements
        .filter((e) => e.type === "channelui" && e.channelParent === tree.id && e.channel === channel.id)
        .map((e) => e.id)
      if (uiIds.length) {
        select(uiIds)
        del()
      }
    }

    const files = existing.filter((f) => f.name !== file)
    const patch: Partial<CanvasElement> = { files }
    // If the removed file was the one shown in the companion, fall back to agent.ts.
    if (tree.activeFile === file) {
      const next = files.find((f) => f.name === "agent.ts") ?? files[0]
      patch.activeFile = next?.name
      const companion = elements.find((e) => e.id === tree.companionId)
      if (companion && next) {
        update([companion.id], { title: next.name, text: next.code, codeTheme: next.codeTheme ?? "dark" })
      }
    }
    updateWithHistory([tree.id], patch)
    // Re-select the tree so its edit menu stays open after the UI cleanup.
    select([tree.id])
  }

  // The eve agent (file-tree) block gets its own edit menu with structure templates.
  if (first.type === "filetree" && selected.length === 1) {
    return (
      <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="text-sm font-semibold">{labelFor(first)}</span>
          <div className="flex gap-1">
            <IconBtn title="Duplicate" onClick={dup}>
              <Copy className="size-4" />
            </IconBtn>
            <IconBtn title="Delete" onClick={del}>
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <Section title="Agent name">
            <input
              type="text"
              value={first.agentName ?? ""}
              placeholder="eve-agent"
              onFocus={beginInteraction}
              onChange={(e) => update(ids, { agentName: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
            />
          </Section>

          {first.agentTemplate === "custom" && !browsingTemplates ? (
            <AgentAddMenu tree={first} onToggle={toggleCapabilityFile} onBack={() => setBrowsingTemplates(true)} />
          ) : (
            <Section title="Template">
              <div className="flex flex-col gap-1">
                {AGENT_STRUCTURES.map((s) => {
                  const active =
                    (first.files ?? []).map((f) => f.name).join(",") === s.files.map((f) => f.name).join(",")
                  return (
                    <button
                      key={s.id}
                      onClick={() => applyStructure(first, s)}
                      className={cn(
                        "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        active ? "border-foreground bg-muted" : "border-border hover:border-foreground/40 hover:bg-muted",
                      )}
                    >
                      <span className="text-xs font-medium">{s.label}</span>
                      <span className="text-[10px] text-muted-foreground">{s.description}</span>
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          <Section title="Arrange">
            <div className="flex gap-2">
              <ArrangeBtn onClick={front} icon={<BringToFront className="size-4" />} label="Front" />
              <ArrangeBtn onClick={back} icon={<SendToBack className="size-4" />} label="Back" />
            </div>
          </Section>
        </div>
      </div>
    )
  }

  // Workflow nodes (code / terminal / website / server) get a dedicated menu.
  const isNode = ["code", "terminal", "website", "server"].includes(first.type)
  if (isNode && selected.length === 1) {
    return (
      <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="text-sm font-semibold">{labelFor(first)}</span>
          <div className="flex gap-1">
            <IconBtn title="Duplicate" onClick={dup}>
              <Copy className="size-4" />
            </IconBtn>
            <IconBtn title="Delete" onClick={del}>
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
        {(first.type === "code" || first.type === "terminal") && (
          <Section title={first.type === "code" ? "File name" : "Label"}>
            <input
              type="text"
              value={first.title ?? ""}
              placeholder={first.type === "code" ? "index.tsx" : "bash"}
              onFocus={beginInteraction}
              onChange={(e) => update(ids, { title: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
            />
          </Section>
        )}

        {first.type === "code" && (
          <Section title="Template">
            <div className="flex flex-col gap-1">
              {CODE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => updateWithHistory(ids, preset.fields)}
                  className="flex flex-col items-start rounded-md border border-border px-2.5 py-1.5 text-left transition-colors hover:border-foreground/40 hover:bg-muted"
                >
                  <span className="text-xs font-medium">{preset.label}</span>
                  <span className="text-[10px] text-muted-foreground">{preset.description}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {first.type === "website" && (
          <Section title="Template">
            <div className="flex flex-col gap-1">
              {WEBSITE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateWithHistory(ids, { websiteTemplate: t.id })}
                  className={cn(
                    "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    (first.websiteTemplate ?? "marketing") === t.id
                      ? "border-foreground bg-muted"
                      : "border-border hover:border-foreground/40 hover:bg-muted",
                  )}
                >
                  <span className="text-xs font-medium">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground">{t.description}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {(first.type === "website" || first.type === "server") && (
          <Section title="Smart connect">
            <Toggle
              checked={first.smartConnect !== false}
              onChange={(v) => updateWithHistory(ids, { smartConnect: v })}
              label={first.smartConnect !== false ? "Reflects upstream node" : "Custom block"}
            />
          </Section>
        )}

        {first.type === "website" && first.smartConnect === false && (
          <Section title="URL">
            <input
              type="text"
              value={first.url ?? ""}
              placeholder="https://example.com"
              onFocus={beginInteraction}
              onChange={(e) => update(ids, { url: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
            />
          </Section>
        )}

        {first.type === "server" && first.smartConnect === false && (
          <>
            <Section title="Method">
              <div className="grid grid-cols-4 gap-1.5">
                {(["GET", "POST", "PUT", "DELETE"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateWithHistory(ids, { method: m })}
                    className={cn(
                      "rounded-md border py-1 text-[11px] font-semibold transition-colors",
                      (first.method ?? "GET") === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Endpoint">
              <input
                type="text"
                value={first.endpoint ?? ""}
                placeholder="/api/hello"
                onFocus={beginInteraction}
                onChange={(e) => update(ids, { endpoint: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
              />
            </Section>
          </>
        )}

        {first.type === "code" && (
          <Section title="Theme">
            <div className="flex flex-col gap-1.5">
              {(Object.keys(CODE_THEMES) as CodeThemeId[]).map((id) => (
                <ThemeOption
                  key={id}
                  id={id}
                  active={(first.codeTheme ?? "dark") === id}
                  onClick={() => updateWithHistory(ids, { codeTheme: id })}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Arrange">
          <div className="flex gap-2">
            <ArrangeBtn onClick={front} icon={<BringToFront className="size-4" />} label="Front" />
            <ArrangeBtn onClick={back} icon={<SendToBack className="size-4" />} label="Back" />
          </div>
        </Section>
        </div>
      </div>
    )
  }

  const hasStroke = selected.some((e) => e.type !== "image")
  // text uses "stroke" as its text color but has no stroke-width concept
  const hasStrokeWidth = selected.some((e) => e.type !== "image" && e.type !== "text")
  const hasFill = selected.some((e) => ["rectangle", "ellipse", "diamond", "card"].includes(e.type))
  const hasText = selected.some((e) => e.type === "text")
  const strokeLabel = hasText && !hasStrokeWidth ? "Color" : "Stroke"
  const common = <K extends keyof CanvasElement>(key: K): CanvasElement[K] | undefined =>
    selected.every((e) => e[key] === first[key]) ? first[key] : undefined

  const currentStroke = common("stroke") as string | undefined
  const currentFill = common("fill") as string | undefined
  const fontSize = (common("fontSize") as number) ?? 24

  return (
    <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="text-sm font-semibold">
          {selected.length > 1 ? `${selected.length} selected` : labelFor(first)}
        </span>
        <div className="flex gap-1">
          <IconBtn title="Duplicate" onClick={dup}>
            <Copy className="size-4" />
          </IconBtn>
          <IconBtn title="Delete" onClick={del}>
            <Trash2 className="size-4" />
          </IconBtn>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
      {hasStroke && (
        <Section title={strokeLabel}>
          <div className="flex items-start gap-2">
            {/* no-stroke option (only meaningful for shapes with a width) */}
            {hasStrokeWidth && (
              <NoStrokeSwatch active={currentStroke === NO_STROKE} onClick={() => updateWithHistory(ids, { stroke: NO_STROKE })} />
            )}
            <div className="grid grid-cols-5 gap-1.5">
              {STROKE_COLORS.map((shades) =>
                shades.map((c) => (
                  <Swatch key={c} color={c} active={currentStroke === c} onClick={() => updateWithHistory(ids, { stroke: c })} />
                )),
              )}
            </div>
            <ColorInput
              value={currentStroke && currentStroke.startsWith("#") ? currentStroke : "#171717"}
              onChange={(v) => update(ids, { stroke: v })}
              onStart={beginInteraction}
            />
          </div>
        </Section>
      )}

      {hasFill && (
        <Section title="Fill">
          <div className="flex items-start gap-2">
            <NoStrokeSwatch active={currentFill === "transparent"} onClick={() => updateWithHistory(ids, { fill: "transparent" })} />
            <div className="grid grid-cols-5 gap-1.5">
              {FILL_COLORS.map((shades) =>
                shades.map((c) => (
                  <Swatch key={c} color={c} active={currentFill === c} onClick={() => updateWithHistory(ids, { fill: c })} />
                )),
              )}
            </div>
            <ColorInput
              value={currentFill && currentFill.startsWith("#") ? currentFill : "#ffffff"}
              onChange={(v) => update(ids, { fill: v })}
              onStart={beginInteraction}
            />
          </div>
        </Section>
      )}

      <Section title="Style">
        {hasStrokeWidth && (
          <Row label="Stroke width">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              defaultValue={(common("strokeWidth") as number) ?? 2}
              onPointerDown={beginInteraction}
              onChange={(e) => update(ids, { strokeWidth: Number(e.target.value) })}
              className="wb-range"
            />
          </Row>
        )}
        {hasText && (
          <Row label="Font size">
            <NumberInput
              value={fontSize}
              min={6}
              max={400}
              onStart={beginInteraction}
              onChange={(v) => update(ids, { fontSize: v })}
            />
          </Row>
        )}
        <Row label="Opacity">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            defaultValue={(common("opacity") as number) ?? 1}
            onPointerDown={beginInteraction}
            onChange={(e) => update(ids, { opacity: Number(e.target.value) })}
            className="wb-range"
          />
        </Row>
      </Section>

      {hasText && (
        <Section title="Format">
          <div className="flex items-center gap-2">
            {/* alignment group */}
            <div className="flex overflow-hidden rounded-md border border-border">
              {([
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const).map(([val, Icon]) => (
                <FormatBtn
                  key={val}
                  active={(common("textAlign") ?? "left") === val}
                  onClick={() => updateWithHistory(ids, { textAlign: val })}
                  title={`Align ${val}`}
                >
                  <Icon className="size-4" />
                </FormatBtn>
              ))}
            </div>
            {/* style group */}
            <div className="flex overflow-hidden rounded-md border border-border">
              <FormatBtn
                active={!!common("bold")}
                onClick={() => updateWithHistory(ids, { bold: !common("bold") })}
                title="Bold"
              >
                <Bold className="size-4" />
              </FormatBtn>
              <FormatBtn
                active={!!common("italic")}
                onClick={() => updateWithHistory(ids, { italic: !common("italic") })}
                title="Italic"
              >
                <Italic className="size-4" />
              </FormatBtn>
              <FormatBtn
                active={!!common("underline")}
                onClick={() => updateWithHistory(ids, { underline: !common("underline") })}
                title="Underline"
              >
                <Underline className="size-4" />
              </FormatBtn>
            </div>
          </div>
        </Section>
      )}

      <Section title="Arrange">
        <div className="flex gap-2">
          <ArrangeBtn onClick={front} icon={<BringToFront className="size-4" />} label="Front" />
          <ArrangeBtn onClick={back} icon={<SendToBack className="size-4" />} label="Back" />
        </div>
      </Section>
      </div>
    </div>
  )
}

// The "Add" flow for a custom agent: a root list of capability categories that
// drills into a sub-list of options (e.g. Channels → Web / Slack / …). Picking
// an option appends its file to the agent's file-tree.
function AgentAddMenu({
  tree,
  onToggle,
  onBack,
}: {
  tree: CanvasElement
  onToggle: (tree: CanvasElement, file: string, code: string, exclusive?: boolean) => void
  onBack: () => void
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const category = EVE_ADD_CATEGORIES.find((c) => c.id === categoryId) ?? null
  const treeFiles = tree.files ?? []
  const existing = new Set(treeFiles.map((f) => f.name))

  if (!category) {
    return (
      <Section title="Add capability">
        <button
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Templates
        </button>
        <div className="flex flex-col gap-1">
          {EVE_ADD_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left transition-colors hover:border-foreground/40 hover:bg-muted"
            >
              <div className="flex flex-1 flex-col">
                <span className="text-xs font-medium">{c.label}</span>
                <span className="text-[10px] text-muted-foreground">{c.description}</span>
              </div>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </Section>
    )
  }

  return (
    <Section title={category.label}>
      <button
        onClick={() => setCategoryId(null)}
        className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        All capabilities
      </button>
      <div className="flex flex-col gap-1">
        {category.options.map((opt) => {
          // In an exclusive category the active option is the one whose code
          // currently backs the shared file, so only that variant shows checked.
          const added = category.exclusive
            ? treeFiles.some((f) => f.name === opt.file && f.code === opt.code)
            : existing.has(opt.file)
          return (
            <button
              key={opt.id}
              onClick={() => onToggle(tree, opt.file, opt.code, category.exclusive)}
              title={added ? "Click to remove" : "Click to add"}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                added ? "border-foreground bg-muted" : "border-border hover:border-foreground/40 hover:bg-muted",
              )}
            >
              <div className="flex flex-1 flex-col">
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[10px] text-muted-foreground">{opt.description}</span>
              </div>
              {added ? (
                <Check className="size-3.5 text-muted-foreground" />
              ) : (
                <Plus className="size-3.5 text-muted-foreground" />
              )}
            </button>
          )
        })}
      </div>
    </Section>
  )
}

function labelFor(el: CanvasElement) {
  const map: Record<string, string> = {
    rectangle: "Rectangle",
    ellipse: "Ellipse",
    diamond: "Diamond",
    arrow: "Arrow",
    line: "Line",
    text: "Text",
    card: "Card",
    code: "Code block",
    terminal: "Terminal",
    image: "Image",
    filetree: "eve agent",
  }
  return map[el.type] ?? "Element"
}

function ThemeOption({ id, active, onClick }: { id: CodeThemeId; active: boolean; onClick: () => void }) {
  const theme = CODE_THEMES[id]
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border p-1.5 transition-colors",
        active ? "border-foreground/60 bg-muted" : "border-border hover:border-foreground/30",
      )}
    >
      {/* mini preview swatch */}
      <span
        className="flex h-8 w-10 shrink-0 flex-col justify-center gap-1 overflow-hidden rounded-md px-1.5"
        style={{ background: theme.bg, border: `1px solid ${theme.border}` }}
      >
        <span className="h-1 w-4/5 rounded-full" style={{ background: theme.colors.keyword }} />
        <span className="h-1 w-3/5 rounded-full" style={{ background: theme.colors.string }} />
        <span className="h-1 w-2/3 rounded-full" style={{ background: theme.colors.function }} />
      </span>
      <span className="text-xs font-medium">{theme.label}</span>
      {active && <span className="ml-auto mr-1 size-1.5 rounded-full bg-foreground" />}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-transparent bg-blue-500" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  )
}

function FormatBtn({
  children,
  active,
  title,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center border-r border-border transition-colors last:border-r-0",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "size-6 rounded-md border transition-transform hover:scale-110",
        active ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : "border-border",
      )}
      style={{ background: color }}
      title={color}
    />
  )
}

function NoStrokeSwatch({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="None"
      className={cn(
        "relative size-6 shrink-0 overflow-hidden rounded-md border bg-background transition-transform hover:scale-110",
        active ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : "border-border",
      )}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 size-full">
        <line x1="3" y1="21" x2="21" y2="3" stroke="#e5484d" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function ColorInput({
  value,
  onChange,
  onStart,
}: {
  value: string
  onChange: (v: string) => void
  onStart: () => void
}) {
  return (
    <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
      <span className="flex size-full items-center justify-center text-[9px] font-bold text-muted-foreground">+</span>
      <input
        type="color"
        value={value}
        onPointerDown={onStart}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange,
  onStart,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  onStart: () => void
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const step = (delta: number) => {
    onStart()
    onChange(clamp(Math.round(value) + delta))
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => step(-1)}
        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        title="Decrease"
      >
        <Minus className="size-3" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={Math.round(value)}
        onFocus={onStart}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
        className="h-6 w-12 rounded-md border border-border bg-background text-center text-xs tabular-nums outline-none focus:border-foreground/40"
      />
      <button
        onClick={() => step(1)}
        className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        title="Increase"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 last:mb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex max-w-[130px] flex-1 justify-end">{children}</div>
    </div>
  )
}

function ArrangeBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      {icon}
      {label}
    </button>
  )
}
