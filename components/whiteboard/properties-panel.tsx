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
import type { CanvasElement, CodeThemeId, Sloppiness } from "@/lib/whiteboard/types"
import { CODE_THEMES } from "@/lib/whiteboard/code-themes"
import { CODE_PRESETS } from "@/lib/whiteboard/code-presets"
import { AGENT_STRUCTURES, EVE_ADD_CATEGORIES, EVE_CHANNELS, type EveStructureTemplate } from "@/lib/whiteboard/eve-templates"
import { DB_ENGINES, DEFAULT_DB_ENGINE } from "@/lib/whiteboard/db-engines"
import { cn } from "@/lib/utils"

// 3 shades per hue: dark -> mid -> light (rendered column-major, so each
// column reads dark at the top down to light at the bottom)
const STROKE_COLORS = [
  ["#171717", "#525252", "#ffffff"], // neutral
  ["#0049b0", "#0070f3", "#66b2ff"], // blue
  ["#b42318", "#e5484d", "#f7a4a4"], // red
  ["#0a7d3f", "#17c964", "#6ee7b7"], // green
  ["#c2610c", "#f5a623", "#fcd34d"], // amber
  ["#4c1d95", "#8b5cf6", "#c4b5fd"], // purple
]

const FILL_COLORS = [
  ["#a1a1aa", "#d4d4d8", "#ffffff"], // neutral
  ["#7cb8ff", "#bcdcff", "#e6f0ff"], // blue
  ["#ff9a9a", "#ffc7c7", "#ffe5e5"], // red
  ["#86efac", "#bbf7d0", "#dcfce7"], // green
  ["#fcd34d", "#fde68a", "#fef3c7"], // amber
  ["#c4b5fd", "#ddd6fe", "#ede9fe"], // purple
]

const NO_STROKE = "transparent"
const DEFAULT_STROKE_WIDTH = 2
const DEFAULT_STROKE_COLOR = "#171717"

const STROKE_PRESET_SET = new Set(STROKE_COLORS.flat())
const FILL_PRESET_SET = new Set(FILL_COLORS.flat())

const SLOPPINESS_LABELS: Record<Sloppiness, string> = {
  0: "Clean",
  1: "Sketchy",
  2: "Very sketchy",
}

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
      <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card">
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

  // Workflow nodes (code / terminal / server / database) get a dedicated menu.
  const isNode = ["code", "terminal", "server", "database"].includes(first.type)
  if (isNode && selected.length === 1) {
    return (
      <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card">
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

        {first.type === "server" && (
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

        {first.type === "database" && (
          <>
            <Section title="Name">
              <input
                type="text"
                value={first.title ?? ""}
                placeholder="Database"
                onFocus={beginInteraction}
                onChange={(e) => update(ids, { title: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40"
              />
            </Section>
            <Section title="Engine">
              <div className="flex flex-col gap-1">
                {DB_ENGINES.map((eng) => {
                  const active = (first.dbEngine ?? DEFAULT_DB_ENGINE) === eng.id
                  return (
                    <button
                      key={eng.id}
                      onClick={() => updateWithHistory(ids, { dbEngine: eng.id })}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                        active ? "border-foreground bg-muted" : "border-border hover:border-foreground/40 hover:bg-muted",
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: eng.accent }}
                      />
                      <span className="text-xs font-medium">{eng.label}</span>
                    </button>
                  )
                })}
              </div>
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
  // only the drawn shapes are rendered from geometry we can sketch
  const hasSloppiness = selected.some((e) => ["rectangle", "ellipse", "diamond"].includes(e.type))
  // an ellipse has no corners, and a diamond's are always mitred
  const hasEdges = selected.some((e) => ["rectangle", "card"].includes(e.type))
  const strokeLabel = hasText && !hasStrokeWidth ? "Color" : "Stroke"
  const common = <K extends keyof CanvasElement>(key: K): CanvasElement[K] | undefined =>
    selected.every((e) => e[key] === first[key]) ? first[key] : undefined

  const currentStroke = common("stroke") as string | undefined
  const currentFill = common("fill") as string | undefined
  const fontSize = (common("fontSize") as number) ?? 24
  const strokeWidthVal = (common("strokeWidth") as number) ?? 2
  const opacityVal = (common("opacity") as number) ?? 1
  const sloppinessVal = (common("sloppiness") as Sloppiness | undefined) ?? 0
  const roundedVal = common("rounded") as boolean | undefined

  // Picking a real stroke color and having a non-zero stroke width are both
  // required for a stroke to actually render (see canvas-element's `noStroke`
  // check), so each control also nudges the other one on instead of leaving
  // the user to set both before anything becomes visible.
  const setStrokeColor = (color: string, withHistory: boolean) => {
    const patch: Partial<CanvasElement> = { stroke: color }
    if (hasStrokeWidth && strokeWidthVal === 0) patch.strokeWidth = DEFAULT_STROKE_WIDTH
    if (withHistory) updateWithHistory(ids, patch)
    else update(ids, patch)
  }
  const setStrokeWidth = (width: number, withHistory: boolean) => {
    const patch: Partial<CanvasElement> = { strokeWidth: width }
    if (width > 0 && (!currentStroke || currentStroke === NO_STROKE)) patch.stroke = DEFAULT_STROKE_COLOR
    if (withHistory) updateWithHistory(ids, patch)
    else update(ids, patch)
  }

  return (
    <div className="pointer-events-auto flex max-h-full w-60 flex-col overflow-hidden rounded-xl border border-border bg-card">
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
      {hasStroke && (() => {
        const isCustomStroke = !!currentStroke && currentStroke.startsWith("#") && !STROKE_PRESET_SET.has(currentStroke)
        const strokeColorColumn = (
          <div className="flex flex-col gap-1.5">
            {/* no-stroke option (only meaningful for shapes with a width) */}
            {hasStrokeWidth && (
              <NoStrokeSwatch active={currentStroke === NO_STROKE} onClick={() => updateWithHistory(ids, { stroke: NO_STROKE })} />
            )}
            {isCustomStroke && (
              <CustomColorSwatch value={currentStroke!} onChange={(v) => setStrokeColor(v, false)} onStart={beginInteraction} />
            )}
            <ColorInput
              value={currentStroke && currentStroke.startsWith("#") ? currentStroke : DEFAULT_STROKE_COLOR}
              onChange={(v) => setStrokeColor(v, false)}
              onStart={beginInteraction}
            />
          </div>
        )
        return (
          <Section title={strokeLabel}>
            <div className="flex items-start gap-2">
              {hasStrokeWidth && strokeColorColumn}
              <div className="grid grid-cols-6 grid-flow-col grid-rows-3 gap-1.5">
                {STROKE_COLORS.map((shades) =>
                  shades.map((c) => (
                    <Swatch key={c} color={c} active={currentStroke === c} onClick={() => setStrokeColor(c, true)} />
                  )),
                )}
              </div>
              {!hasStrokeWidth && strokeColorColumn}
            </div>
          </Section>
        )
      })()}

      {hasFill && (() => {
        const isCustomFill = !!currentFill && currentFill.startsWith("#") && !FILL_PRESET_SET.has(currentFill)
        return (
          <Section title="Fill">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1.5">
                <NoStrokeSwatch active={currentFill === "transparent"} onClick={() => updateWithHistory(ids, { fill: "transparent" })} />
                {isCustomFill && (
                  <CustomColorSwatch value={currentFill!} onChange={(v) => update(ids, { fill: v })} onStart={beginInteraction} />
                )}
                <ColorInput
                  value={currentFill && currentFill.startsWith("#") ? currentFill : "#ffffff"}
                  onChange={(v) => update(ids, { fill: v })}
                  onStart={beginInteraction}
                />
              </div>
              <div className="grid grid-cols-6 grid-flow-col grid-rows-3 gap-1.5">
                {FILL_COLORS.map((shades) =>
                  shades.map((c) => (
                    <Swatch key={c} color={c} active={currentFill === c} onClick={() => updateWithHistory(ids, { fill: c })} />
                  )),
                )}
              </div>
            </div>
          </Section>
        )
      })()}

      {(hasStrokeWidth || hasText) && (
      <Section title="Style">
        {hasStrokeWidth && (
          <Row label="Stroke width">
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={strokeWidthVal}
                onPointerDown={beginInteraction}
                onChange={(e) => setStrokeWidth(Number(e.target.value), false)}
                className="wb-range"
              />
              <input
                type="number"
                min={0}
                max={12}
                value={Math.round(strokeWidthVal)}
                onFocus={beginInteraction}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isNaN(n)) setStrokeWidth(Math.max(0, Math.min(12, Math.round(n))), false)
                }}
                className="h-6 w-9 shrink-0 rounded-md border border-border bg-background text-center text-[11px] tabular-nums outline-none focus:border-foreground/40"
              />
            </div>
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
      </Section>
      )}

      {hasSloppiness && (
        <Section title="Sloppiness">
          <div className="flex gap-1.5">
            {([0, 1, 2] as Sloppiness[]).map((level) => (
              <OptionBtn
                key={level}
                title={SLOPPINESS_LABELS[level]}
                active={sloppinessVal === level}
                onClick={() => updateWithHistory(ids, { sloppiness: level })}
              >
                <SloppinessIcon level={level} />
              </OptionBtn>
            ))}
          </div>
        </Section>
      )}

      {hasEdges && (
        <Section title="Edges">
          <div className="flex gap-1.5">
            <OptionBtn title="Sharp" active={roundedVal === false} onClick={() => updateWithHistory(ids, { rounded: false })}>
              <EdgeIcon rounded={false} />
            </OptionBtn>
            <OptionBtn title="Round" active={roundedVal === true} onClick={() => updateWithHistory(ids, { rounded: true })}>
              <EdgeIcon rounded />
            </OptionBtn>
          </div>
        </Section>
      )}

      <Section title="Opacity">
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacityVal}
          onPointerDown={beginInteraction}
          onChange={(e) => update(ids, { opacity: Number(e.target.value) })}
          className="wb-range"
        />
        <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>10</span>
          <span className="font-medium text-foreground">{Math.round(opacityVal * 100)}</span>
          <span>100</span>
        </div>
      </Section>

      {selected.length === 1 && ["ec2", "fluidcompute", "serverlesscompute"].includes(first.type) && (
        <Section title="Run button">
          <Toggle
            checked={first.showRequestButton !== false}
            onChange={(value) => updateWithHistory(ids, { showRequestButton: value })}
            label={first.showRequestButton !== false ? "Shown below block" : "Hidden"}
          />
        </Section>
      )}

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
    server: "Server",
    database: "Database",
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

// Equal-width toggle in a row of mutually exclusive choices (sloppiness, edges).
function OptionBtn({
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
        "flex h-8 flex-1 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-foreground bg-muted text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

// A line that gets progressively less steady, matching what each level does to
// a shape's outline.
function SloppinessIcon({ level }: { level: Sloppiness }) {
  const paths: Record<Sloppiness, string[]> = {
    0: ["M2 8.5c3.5-1 8.5-1 12 0"],
    1: ["M2 9.5c2-3 4 2 6-0.5s4 2.5 6-1"],
    2: ["M2 10c1.5-4.5 3.5 3 5.5-1.5s3.5 4 5.5-1", "M2.5 8.5c2 3 4-2.5 6 0.5"],
  }
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
      {paths[level].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

function EdgeIcon({ rounded }: { rounded?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      {rounded ? <path d="M4 13V8a4 4 0 0 1 4-4h5" /> : <path d="M4 13V4h9" />}
      <path d="M4 13h9" strokeDasharray="1.5 2" strokeOpacity={0.4} />
      <path d="M13 13V4" strokeDasharray="1.5 2" strokeOpacity={0.4} />
    </svg>
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

// Shows the currently-applied color when it isn't one of the presets, ring-
// highlighted like a selected swatch. Sits above the "+" button, and still
// opens the native picker so the exact custom color can be fine-tuned.
function CustomColorSwatch({
  value,
  onChange,
  onStart,
}: {
  value: string
  onChange: (v: string) => void
  onStart: () => void
}) {
  return (
    <label
      title={value}
      className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-transparent ring-2 ring-foreground ring-offset-1 ring-offset-card transition-transform hover:scale-110"
      style={{ background: value }}
    >
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
    <label
      title="Custom color"
      className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border transition-transform hover:scale-110"
    >
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
  // While the user is actively typing (e.g. clearing the field to retype a new
  // value) we keep their raw keystrokes locally instead of clamping on every
  // change — clamping an intermediate "" (which parses to 0) would snap the
  // value down to `min` before they finish typing. The clamp only applies once
  // they commit (blur / Enter).
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const step = (delta: number) => {
    onStart()
    onChange(clamp(Math.round(value) + delta))
  }
  const commit = (raw: string) => {
    const n = Number(raw)
    if (raw.trim() !== "" && !Number.isNaN(n)) onChange(clamp(n))
    setDraft(null)
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
        value={draft ?? Math.round(value)}
        onFocus={onStart}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value)
            e.currentTarget.blur()
          }
          e.stopPropagation()
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
