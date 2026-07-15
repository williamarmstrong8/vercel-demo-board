"use client"

import { Hammer, Eye } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { id: "build", label: "Build", icon: Hammer },
  { id: "prod", label: "Prod", icon: Eye },
] as const

export function ModeToggle() {
  const mode = useWhiteboard((s) => s.mode)
  const setMode = useWhiteboard((s) => s.setMode)

  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-2xl">
      {OPTIONS.map((o) => {
        const Icon = o.icon
        const active = mode === o.id
        return (
          <button
            key={o.id}
            onClick={() => setMode(o.id)}
            title={o.id === "build" ? "Build mode — edit connections" : "Prod mode — hide connection points"}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-[15px]" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
