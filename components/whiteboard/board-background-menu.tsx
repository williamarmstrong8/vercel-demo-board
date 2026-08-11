"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Menu, Moon, Sun } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { useSiteTheme, type Theme } from "@/components/site-theme"
import type { BackgroundStyle } from "@/lib/whiteboard/types"

const OPTIONS: Array<{ id: BackgroundStyle; label: string }> = [
  { id: "plain", label: "Plain" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
]

const THEME_OPTIONS: Array<{ id: Theme; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
]

// Small static swatch previewing each pattern at a glance, so the menu reads
// visually instead of asking the user to picture "dots" vs "grid" from text
// alone. Independent of the live canvas's theme/zoom — just a fixed preview.
function BackgroundSwatch({ style }: { style: BackgroundStyle }) {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-neutral-800"
      style={
        style === "dots"
          ? {
              backgroundImage: "radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)",
              backgroundSize: "6px 6px",
            }
          : style === "grid"
            ? {
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.28) 1px, transparent 1px)",
                backgroundSize: "6px 6px",
              }
            : undefined
      }
    />
  )
}

export function BoardBackgroundMenu({ canEdit = true }: { canEdit?: boolean }) {
  const backgroundStyle = useWhiteboard(
    (s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).backgroundStyle ?? "plain",
  )
  const setBackgroundStyle = useWhiteboard((s) => s.setBackgroundStyle)
  const { theme, toggleTheme } = useSiteTheme()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <div ref={menuRef} className="dark relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-neutral-900 text-neutral-300 shadow-sm transition-colors hover:bg-neutral-800 hover:text-white"
        aria-label="Board settings"
        aria-expanded={open}
        title="Board settings"
      >
        <Menu className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-popover py-1.5 text-popover-foreground shadow-xl">
          {canEdit && (
            <>
              <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">Background</p>
              {OPTIONS.map((option) => {
                const active = backgroundStyle === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      setBackgroundStyle(option.id)
                      setOpen(false)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <BackgroundSwatch style={option.id} />
                    <span className="flex-1 text-left">{option.label}</span>
                    {active && <Check className="size-4 shrink-0 text-foreground" />}
                  </button>
                )
              })}
              <div className="my-1.5 h-px bg-border" />
            </>
          )}

          {/* The only place this preference lives now — see board-editor.tsx,
              which no longer has its own bottom-left toggle. Available to
              every viewer, editor or not — it's a personal preference, not a
              board-editing decision. */}
          <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">Theme</p>
          {THEME_OPTIONS.map((option) => {
            const active = theme === option.id
            const Icon = option.icon
            return (
              <button
                key={option.id}
                onClick={() => {
                  if (theme !== option.id) toggleTheme()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-neutral-800">
                  <Icon className="size-3.5" />
                </span>
                <span className="flex-1 text-left">{option.label}</span>
                {active && <Check className="size-4 shrink-0 text-foreground" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
