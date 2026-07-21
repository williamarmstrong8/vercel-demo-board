"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Plus, Check, Trash2, Pencil } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { cn } from "@/lib/utils"

function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" className={className} aria-hidden="true">
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  )
}

export function ProjectsMenu() {
  const projects = useWhiteboard((s) => s.projects)
  const currentId = useWhiteboard((s) => s.currentId)
  const switchProject = useWhiteboard((s) => s.switchProject)
  const newProject = useWhiteboard((s) => s.newProject)
  const renameProject = useWhiteboard((s) => s.renameProject)
  const deleteProject = useWhiteboard((s) => s.deleteProject)

  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const current = projects.find((p) => p.id === currentId) ?? projects[0]

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setRenaming(null)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const startRename = (id: string, name: string) => {
    setRenaming(id)
    setDraft(name)
  }
  const commitRename = () => {
    if (renaming && draft.trim()) renameProject(renaming, draft.trim())
    setRenaming(null)
  }

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 py-2 pl-3 pr-2.5 text-sm text-white shadow-md transition-colors hover:bg-neutral-800"
      >
        <VercelMark className="size-3.5" />
        <span className="max-w-[160px] truncate font-medium">{current?.name}</span>
        <ChevronDown className={cn("size-4 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="max-h-72 overflow-y-auto p-1.5">
            {projects.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                  p.id === currentId ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {renaming === p.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename()
                      if (e.key === "Escape") setRenaming(null)
                    }}
                    className="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-sm outline-none focus:border-foreground"
                  />
                ) : (
                  <button className="flex flex-1 items-center gap-2 text-left" onClick={() => { switchProject(p.id); setOpen(false) }}>
                    <span className="flex size-4 items-center justify-center">
                      {p.id === currentId && <Check className="size-4" />}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                )}
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => startRename(p.id, p.name)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Rename"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive"
                    title="Delete board"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => { newProject(); setOpen(false) }}
            className="flex w-full items-center gap-2 border-t border-border px-3.5 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Plus className="size-4" />
            New board
          </button>
        </div>
      )}
    </div>
  )
}
