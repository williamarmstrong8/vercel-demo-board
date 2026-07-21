"use client"

import { create } from "zustand"
import type { CanvasElement, Camera, Project, Tool, Connection, RunPhase } from "./types"

const STORAGE_KEY = "vercel-canvas:v1"

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const DEFAULT_STYLE = {
  stroke: "#000000",
  fill: "transparent",
  strokeWidth: 2,
  opacity: 1,
  rounded: true,
}

function emptyProject(name = "Untitled board"): Project {
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    elements: [],
    connections: [],
    camera: { x: 0, y: 0, zoom: 1 },
  }
}

interface PersistShape {
  projects: Project[]
  currentId: string
}

function load(): PersistShape | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistShape
    if (!parsed.projects?.length) return null
    // migrate: ensure every project has a connections array
    parsed.projects = parsed.projects.map((p) => ({ ...p, connections: p.connections ?? [] }))
    return parsed
  } catch {
    return null
  }
}

// --- Persistence adapter --------------------------------------------------
// Guest mode: the whole multi-project store is mirrored to localStorage.
//
// Cloud editing mode (/board/[id]): every change is first mirrored to a
// lightweight per-board localStorage recovery draft. Substantive edits then
// notify the editor, which debounces and serializes cloud autosaves. Camera-only
// movement stays local so panning and zooming do not create database writes.
let cloudBoardId: string | null = null
let cloudChangeListener: ((project: Project) => void) | null = null

const DRAFT_PREFIX = "canvas:board-draft:"
const draftKey = (id: string) => `${DRAFT_PREFIX}${id}`

export function enableCloudDraft(boardId: string, onChange: (project: Project) => void) {
  cloudBoardId = boardId
  cloudChangeListener = onChange
}

export function disableCloudDraft() {
  cloudBoardId = null
  cloudChangeListener = null
  if (cloudChangeTimer) clearTimeout(cloudChangeTimer)
  cloudChangeTimer = null
}

// The locally-saved working copy for a board, if the user has unsaved edits.
export function readBoardDraft(id: string): Project | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(draftKey(id))
    if (!raw) return null
    const p = JSON.parse(raw) as Project
    return { ...p, connections: p.connections ?? [] }
  } catch {
    return null
  }
}

// Called only after the newest revision reaches the cloud successfully.
export function clearBoardDraft(id: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(draftKey(id))
  } catch {
    // ignore
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let cloudChangeTimer: ReturnType<typeof setTimeout> | null = null
// `silent` keeps camera pan/zoom in the local recovery draft without scheduling
// a cloud write.
function persist(state: WhiteboardState, silent = false) {
  if (typeof window === "undefined") return
  if (saveTimer) clearTimeout(saveTimer)

  // Cloud editing: always refresh the local recovery draft. Substantive edits
  // also emit the newest board snapshot to the editor's cloud autosave queue.
  if (cloudBoardId) {
    const id = cloudBoardId
    saveTimer = setTimeout(() => {
      const board = state.projects.find((p) => p.id === id) ?? state.projects[0]
      if (!board) return
      try {
        window.localStorage.setItem(draftKey(id), JSON.stringify(board))
      } catch {
        // ignore quota errors
      }
    }, 300)

    if (!silent) {
      if (cloudChangeTimer) clearTimeout(cloudChangeTimer)
      cloudChangeTimer = setTimeout(() => {
        const board = state.projects.find((p) => p.id === id) ?? state.projects[0]
        if (board && cloudBoardId === id) cloudChangeListener?.(board)
      }, 300)
    }
    return
  }

  // Guest mode: mirror the whole store.
  saveTimer = setTimeout(() => {
    try {
      const shape: PersistShape = { projects: state.projects, currentId: state.currentId }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
    } catch {
      // ignore quota errors
    }
  }, 400)
}

interface WhiteboardState {
  projects: Project[]
  currentId: string
  tool: Tool
  selectedIds: string[]
  editingId: string | null
  clipboard: CanvasElement[]
  // per-project history (session only)
  past: CanvasElement[][]
  future: CanvasElement[][]
  hydrated: boolean

  // workflow: transient (not persisted)
  connectingFrom: string | null
  connectPos: { x: number; y: number } | null
  runStates: Record<string, RunPhase>
  // page mode: "build" shows all node handles; "prod" hides them unless connected
  mode: "build" | "prod"

  // selectors
  current: () => Project

  // lifecycle
  hydrate: () => void
  loadBoard: (project: Project) => void

  // projects
  newProject: (name?: string) => void
  newProjectFromTemplate: (name: string, elements: CanvasElement[], connections: Connection[]) => void
  switchProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void

  // tool + camera
  setTool: (tool: Tool) => void
  setCamera: (camera: Camera) => void

  // history
  beginInteraction: () => void
  undo: () => void
  redo: () => void

  // elements
  addElement: (el: CanvasElement) => void
  addElements: (els: CanvasElement[]) => void
  addTemplate: (elements: CanvasElement[], connections: Connection[]) => void
  removeElements: (ids: string[]) => void
  update: (ids: string[], patch: Partial<CanvasElement>) => void
  updateWithHistory: (ids: string[], patch: Partial<CanvasElement>) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  bringToFront: () => void
  sendToBack: () => void
  bringForward: () => void
  sendBackward: () => void

  // selection
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
  setEditing: (id: string | null) => void

  // clipboard
  copy: () => void
  paste: (at?: { x: number; y: number }) => void

  // workflow connections
  addConnection: (from: string, to: string) => void
  removeConnection: (id: string) => void
  startConnect: (fromId: string) => void
  updateConnectDrag: (pos: { x: number; y: number }) => void
  finishConnect: (toId: string | null) => void

  // workflow run
  runFrom: (id: string) => void
  clearRun: () => void

  // page mode
  setMode: (mode: "build" | "prod") => void
}

function writeElements(state: WhiteboardState, elements: CanvasElement[]): Partial<WhiteboardState> {
  const projects = state.projects.map((p) =>
    p.id === state.currentId ? { ...p, elements, updatedAt: Date.now() } : p,
  )
  return { projects }
}

function writeConnections(state: WhiteboardState, connections: Connection[]): Partial<WhiteboardState> {
  const projects = state.projects.map((p) =>
    p.id === state.currentId ? { ...p, connections, updatedAt: Date.now() } : p,
  )
  return { projects }
}

/**
 * Expands a set of element ids to include every dependent element, so deleting
 * an eve agent's main file-tree also removes the blocks it spawned. The chain
 * is: file-tree → channel UIs (channelParent) → pinned sandbox (sandboxParent).
 * Runs to a fixed point so multi-level chains are fully collected.
 */
function collectDependents(elements: CanvasElement[], seedIds: string[]): Set<string> {
  const removed = new Set(seedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const el of elements) {
      if (removed.has(el.id)) continue
      const parent =
        (el.type === "channelui" && el.channelParent) ||
        (el.type === "sandbox" && el.sandboxParent) ||
        undefined
      if (parent && removed.has(parent)) {
        removed.add(el.id)
        changed = true
      }
    }
  }
  return removed
}

export const useWhiteboard = create<WhiteboardState>((set, get) => ({
  projects: [emptyProject()],
  currentId: "",
  tool: "select",
  selectedIds: [],
  editingId: null,
  clipboard: [],
  past: [],
  future: [],
  hydrated: false,
  connectingFrom: null,
  connectPos: null,
  runStates: {},
  mode: "build",

  current: () => {
    const s = get()
    return s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]
  },

  hydrate: () => {
    if (get().hydrated) return
    const loaded = load()
    if (loaded) {
      set({
        projects: loaded.projects,
        currentId: loaded.currentId && loaded.projects.some((p) => p.id === loaded.currentId)
          ? loaded.currentId
          : loaded.projects[0].id,
        hydrated: true,
      })
    } else {
      const p = get().projects[0]
      set({ currentId: p.id, hydrated: true })
      persist(get())
    }
  },

  // Load a single board fetched from the cloud, replacing any in-memory state.
  // Used by the /board/[id] editor; does not touch localStorage.
  loadBoard: (project) => {
    set({
      projects: [{ ...project, connections: project.connections ?? [] }],
      currentId: project.id,
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
      tool: "select",
      hydrated: true,
      runStates: {},
      connectingFrom: null,
      connectPos: null,
    })
  },

  newProject: (name) => {
    const p = emptyProject(name || `Board ${get().projects.length + 1}`)
    set((s) => ({
      projects: [...s.projects, p],
      currentId: p.id,
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
      tool: "select",
    }))
    persist(get())
  },

  newProjectFromTemplate: (name, elements, connections) => {
    const p: Project = { ...emptyProject(name), elements, connections }
    set((s) => ({
      projects: [...s.projects, p],
      currentId: p.id,
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
      tool: "select",
    }))
    persist(get())
  },

  switchProject: (id) => {
    set({ currentId: id, selectedIds: [], editingId: null, past: [], future: [], tool: "select" })
    persist(get())
  },

  renameProject: (id, name) => {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) }))
    persist(get())
  },

  deleteProject: (id) => {
    set((s) => {
      let projects = s.projects.filter((p) => p.id !== id)
      if (projects.length === 0) projects = [emptyProject()]
      const currentId = s.currentId === id ? projects[0].id : s.currentId
      return { projects, currentId, selectedIds: [], editingId: null, past: [], future: [] }
    })
    persist(get())
  },

  setTool: (tool) => set({ tool }),

  setCamera: (camera) => {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === s.currentId ? { ...p, camera } : p)),
    }))
    persist(get(), true)
  },

  beginInteraction: () => {
    const els = get().current().elements
    set((s) => ({ past: [...s.past, els.map((e) => ({ ...e }))].slice(-100), future: [] }))
  },

  undo: () => {
    const s = get()
    if (s.past.length === 0) return
    const prev = s.past[s.past.length - 1]
    const currentEls = s.current().elements
    set({
      past: s.past.slice(0, -1),
      future: [...s.future, currentEls.map((e) => ({ ...e }))],
    })
    set((st) => writeElements(st, prev) as WhiteboardState)
    set((st) => ({ selectedIds: st.selectedIds.filter((id) => prev.some((e) => e.id === id)) }))
    persist(get())
  },

  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const next = s.future[s.future.length - 1]
    const currentEls = s.current().elements
    set({
      future: s.future.slice(0, -1),
      past: [...s.past, currentEls.map((e) => ({ ...e }))],
    })
    set((st) => writeElements(st, next) as WhiteboardState)
    persist(get())
  },

  addElement: (el) => {
    get().beginInteraction()
    set((s) => writeElements(s, [...s.current().elements, el]) as WhiteboardState)
    persist(get())
  },

  addElements: (els) => {
    get().beginInteraction()
    set((s) => writeElements(s, [...s.current().elements, ...els]) as WhiteboardState)
    persist(get())
  },

  // Drop a pre-wired template (its blocks + connections) into the CURRENT board
  // as a sequence, rather than creating a whole new board. The incoming block is
  // offset to sit just below any existing content so it never overlaps, and the
  // newly added blocks are left selected so the user can immediately reposition
  // them as a group.
  addTemplate: (elements, connections) => {
    if (elements.length === 0) return
    const existing = get().current().elements
    let dx = 0
    let dy = 0
    if (existing.length > 0) {
      const exMaxY = Math.max(...existing.map((e) => e.y + (e.height ?? 0)))
      const exMinX = Math.min(...existing.map((e) => e.x))
      const tplMinY = Math.min(...elements.map((e) => e.y))
      const tplMinX = Math.min(...elements.map((e) => e.x))
      dx = exMinX - tplMinX
      dy = exMaxY + 120 - tplMinY
    }
    const placed = elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }))
    get().beginInteraction()
    set((s) => writeElements(s, [...s.current().elements, ...placed]) as WhiteboardState)
    set((s) => writeConnections(s, [...s.current().connections, ...connections]) as WhiteboardState)
    set({ selectedIds: placed.map((e) => e.id) })
    persist(get())
  },

  // Remove elements by id without touching the current selection. Used for
  // auto-managed blocks (e.g. the sandbox terminal pinned to a channel UI).
  removeElements: (ids) => {
    if (ids.length === 0) return
    const remove = new Set(ids)
    set((st) => {
      const elements = st.current().elements.filter((e) => !remove.has(e.id))
      const connections = st.current().connections.filter((c) => !remove.has(c.from) && !remove.has(c.to))
      const projects = st.projects.map((p) =>
        p.id === st.currentId ? { ...p, elements, connections, updatedAt: Date.now() } : p,
      )
      return { projects, selectedIds: st.selectedIds.filter((id) => !remove.has(id)) }
    })
    persist(get())
  },

  update: (ids, patch) => {
    set((s) => {
      const elements = s.current().elements.map((e) =>
        ids.includes(e.id) ? { ...e, ...patch } : e,
      )
      return writeElements(s, elements) as WhiteboardState
    })
    persist(get())
  },

  updateWithHistory: (ids, patch) => {
    get().beginInteraction()
    get().update(ids, patch)
  },

  deleteSelected: () => {
    const s = get()
    if (s.selectedIds.length === 0) return
    s.beginInteraction()
    set((st) => {
      const removed = collectDependents(st.current().elements, st.selectedIds)
      const elements = st.current().elements.filter((e) => !removed.has(e.id))
      const connections = st.current().connections.filter((c) => !removed.has(c.from) && !removed.has(c.to))
      const projects = st.projects.map((p) =>
        p.id === st.currentId ? { ...p, elements, connections, updatedAt: Date.now() } : p,
      )
      return { projects, selectedIds: [], editingId: null }
    })
    persist(get())
  },

  duplicateSelected: () => {
    const s = get()
    if (s.selectedIds.length === 0) return
    s.beginInteraction()
    const originals = s.current().elements.filter((e) => s.selectedIds.includes(e.id))
    const copies = originals.map((e) => ({ ...e, id: uid(), x: e.x + 24, y: e.y + 24 }))
    set((st) => writeElements(st, [...st.current().elements, ...copies]) as WhiteboardState)
    set({ selectedIds: copies.map((c) => c.id) })
    persist(get())
  },

  bringToFront: () => {
    const s = get()
    s.beginInteraction()
    set((st) => {
      const sel = st.current().elements.filter((e) => st.selectedIds.includes(e.id))
      const rest = st.current().elements.filter((e) => !st.selectedIds.includes(e.id))
      return writeElements(st, [...rest, ...sel]) as WhiteboardState
    })
    persist(get())
  },

  sendToBack: () => {
    const s = get()
    s.beginInteraction()
    set((st) => {
      const sel = st.current().elements.filter((e) => st.selectedIds.includes(e.id))
      const rest = st.current().elements.filter((e) => !st.selectedIds.includes(e.id))
      return writeElements(st, [...sel, ...rest]) as WhiteboardState
    })
    persist(get())
  },

  // Move the selection one step toward the front (later in the array). Iterate
  // from the top so multiple selected items keep their relative order.
  bringForward: () => {
    const s = get()
    s.beginInteraction()
    set((st) => {
      const els = [...st.current().elements]
      for (let i = els.length - 2; i >= 0; i--) {
        if (st.selectedIds.includes(els[i].id) && !st.selectedIds.includes(els[i + 1].id)) {
          ;[els[i], els[i + 1]] = [els[i + 1], els[i]]
        }
      }
      return writeElements(st, els) as WhiteboardState
    })
    persist(get())
  },

  // Move the selection one step toward the back (earlier in the array).
  sendBackward: () => {
    const s = get()
    s.beginInteraction()
    set((st) => {
      const els = [...st.current().elements]
      for (let i = 1; i < els.length; i++) {
        if (st.selectedIds.includes(els[i].id) && !st.selectedIds.includes(els[i - 1].id)) {
          ;[els[i], els[i - 1]] = [els[i - 1], els[i]]
        }
      }
      return writeElements(st, els) as WhiteboardState
    })
    persist(get())
  },

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [], editingId: null }),
  selectAll: () => set((s) => ({ selectedIds: s.current().elements.map((e) => e.id) })),
  setEditing: (id) => set({ editingId: id }),

  copy: () => {
    const s = get()
    const els = s.current().elements.filter((e) => s.selectedIds.includes(e.id))
    set({ clipboard: els.map((e) => ({ ...e })) })
  },

  paste: (at) => {
    const s = get()
    if (s.clipboard.length === 0) return
    s.beginInteraction()
    const offset = at ? { x: at.x, y: at.y } : { x: 24, y: 24 }
    // anchor to first element for positioning relative to cursor
    const base = s.clipboard[0]
    const copies = s.clipboard.map((e) => ({
      ...e,
      id: uid(),
      x: at ? offset.x + (e.x - base.x) : e.x + 24,
      y: at ? offset.y + (e.y - base.y) : e.y + 24,
    }))
    set((st) => writeElements(st, [...st.current().elements, ...copies]) as WhiteboardState)
    set({ selectedIds: copies.map((c) => c.id) })
    persist(get())
  },

  addConnection: (from, to) => {
    if (from === to) return
    const s = get()
    const existing = s.current().connections
    // no duplicates in either direction
    if (existing.some((c) => (c.from === from && c.to === to) || (c.from === to && c.to === from))) return
    const conn: Connection = { id: uid(), from, to }
    set((st) => writeConnections(st, [...st.current().connections, conn]) as WhiteboardState)
    persist(get())
  },

  removeConnection: (id) => {
    set((st) => writeConnections(st, st.current().connections.filter((c) => c.id !== id)) as WhiteboardState)
    persist(get())
  },

  startConnect: (fromId) => set({ connectingFrom: fromId, connectPos: null }),
  updateConnectDrag: (pos) => set({ connectPos: pos }),
  finishConnect: (toId) => {
    const s = get()
    const from = s.connectingFrom
    set({ connectingFrom: null, connectPos: null })
    if (from && toId) s.addConnection(from, toId)
  },

  runFrom: (id) => {
    const s = get()
    const conns = s.current().connections
    // Breadth-first ordering of nodes reachable from the trigger (outgoing edges).
    const order: string[] = []
    const seen = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift() as string
      if (seen.has(cur)) continue
      seen.add(cur)
      order.push(cur)
      for (const c of conns) {
        if (c.from === cur && !seen.has(c.to)) queue.push(c.to)
      }
    }

    // Reset then animate each node in sequence: running -> done.
    set({ runStates: {} })
    const STEP = 900
    order.forEach((nodeId, i) => {
      window.setTimeout(() => {
        set((st) => ({ runStates: { ...st.runStates, [nodeId]: "running" } }))
      }, i * STEP)
      window.setTimeout(() => {
        set((st) => ({ runStates: { ...st.runStates, [nodeId]: "done" } }))
      }, i * STEP + STEP - 150)
    })
    // Finished runs stay on screen — the user resets manually via the reset
    // control next to the Run button.
  },

  clearRun: () => set({ runStates: {} }),

  setMode: (mode) => set({ mode, connectingFrom: null, connectPos: null }),
}))

export { uid }
