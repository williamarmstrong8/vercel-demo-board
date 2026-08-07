"use client"

import { useRef } from "react"
import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  Diamond,
  MoveUpRight,
  Minus,
  Type,
  SquareStack,
  ImageIcon,
} from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { insertImages } from "@/lib/whiteboard/insert-image"
import { screenToWorld } from "@/lib/whiteboard/geometry"
import type { Tool } from "@/lib/whiteboard/types"
import { cn } from "@/lib/utils"
import { ComponentLibrary } from "@/components/whiteboard/component-library"

interface ToolDef {
  id: Tool
  icon: React.ComponentType<{ className?: string }>
  label: string
  key: string
}

const TOOLS: ToolDef[] = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V" },
  { id: "hand", icon: Hand, label: "Pan", key: "H" },
  { id: "rectangle", icon: Square, label: "Rectangle", key: "R" },
  { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
  { id: "diamond", icon: Diamond, label: "Diamond", key: "D" },
  { id: "arrow", icon: MoveUpRight, label: "Arrow", key: "A" },
  { id: "line", icon: Minus, label: "Line", key: "L" },
  { id: "text", icon: Type, label: "Text", key: "T" },
  { id: "card", icon: SquareStack, label: "Card", key: "C" },
]

export function Toolbar() {
  const tool = useWhiteboard((s) => s.tool)
  const setTool = useWhiteboard((s) => s.setTool)
  const fileRef = useRef<HTMLInputElement>(null)

  // Picked images land in the middle of the viewport; dragging one in instead
  // drops it under the cursor. Both go through the same insert.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0) return
    const cam = useWhiteboard.getState().current().camera
    const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, cam)
    void insertImages(files, center)
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-neutral-900 p-1.5">
      {TOOLS.map((t) => {
        const Icon = t.icon
        const active = tool === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
            className={cn(
              "group relative flex size-9 items-center justify-center rounded-lg transition-colors",
              active ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-[18px]" />
          </button>
        )
      })}
      <button
        onClick={() => fileRef.current?.click()}
        title="Insert image"
        className="flex size-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ImageIcon className="size-[18px]" />
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFile} />
      <div className="mx-1 h-6 w-px bg-white/10" />
      <ComponentLibrary />
    </div>
  )
}
