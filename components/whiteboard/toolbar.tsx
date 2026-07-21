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
import { useWhiteboard, uid } from "@/lib/whiteboard/store"
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const imgEl = new window.Image()
      imgEl.onload = () => {
        const store = useWhiteboard.getState()
        const cam = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
        const vw = window.innerWidth / 2
        const vh = window.innerHeight / 2
        const cx = (vw - cam.x) / cam.zoom
        const cy = (vh - cam.y) / cam.zoom
        const maxW = 360
        const scale = Math.min(1, maxW / imgEl.width)
        const w = imgEl.width * scale
        const h = imgEl.height * scale
        store.addElement({
          id: uid(),
          type: "image",
          x: cx - w / 2,
          y: cy - h / 2,
          width: w,
          height: h,
          rotation: 0,
          stroke: "transparent",
          fill: "transparent",
          strokeWidth: 0,
          opacity: 1,
          rounded: true,
          src,
          z: 0,
        })
        store.setTool("select")
        store.select([])
      }
      imgEl.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-md">
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
      <div className="mx-1 h-6 w-px bg-white/10" />
      <button
        onClick={() => fileRef.current?.click()}
        title="Insert image"
        className="flex size-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ImageIcon className="size-[18px]" />
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <ComponentLibrary />
    </div>
  )
}
