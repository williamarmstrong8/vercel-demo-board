"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { createElement } from "@/lib/whiteboard/factory"
import {
  getBounds,
  getSelectionBounds,
  screenToWorld,
  computeSnap,
  snapEdgeToTargets,
  snapToGrid,
  type SnapGuide,
} from "@/lib/whiteboard/geometry"
import { GRID_SIZE, SNAP_THRESHOLD, type CanvasElement } from "@/lib/whiteboard/types"
import { CanvasElementView } from "./canvas-element"
import { SelectionOverlay, type HandleId } from "./selection-overlay"
import { ElementEditor } from "./element-editor"
import { ConnectionCurves, ConnectionHandles } from "./workflow-connections"

type Gesture =
  | { mode: "idle" }
  | { mode: "pan"; startScreen: { x: number; y: number }; startCam: { x: number; y: number } }
  | { mode: "create"; id: string; start: { x: number; y: number } }
  | {
      mode: "move"
      startWorld: { x: number; y: number }
      origins: Record<string, { x: number; y: number }>
      moved: boolean
    }
  | {
      mode: "resize"
      handle: HandleId
      startWorld: { x: number; y: number }
      origBounds: { x: number; y: number; width: number; height: number }
      origEls: CanvasElement[]
    }
  | { mode: "marquee"; startScreen: { x: number; y: number }; additive: boolean }

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function CanvasSurface() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture>({ mode: "idle" })
  const spaceDown = useRef(false)

  const camera = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).camera)
  const elements = useWhiteboard((s) => (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements)
  const selectedIds = useWhiteboard((s) => s.selectedIds)
  const editingId = useWhiteboard((s) => s.editingId)
  const tool = useWhiteboard((s) => s.tool)

  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  const rect = () => containerRef.current?.getBoundingClientRect()

  const toScreen = useCallback((e: { clientX: number; clientY: number }) => {
    const r = rect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }, [])

  const hitTest = useCallback((wx: number, wy: number, els: CanvasElement[]): CanvasElement | null => {
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]
      if (el.type === "arrow" || el.type === "line") {
        const d = distToSegment(wx, wy, el.x, el.y, el.x + el.width, el.y + el.height)
        if (d <= 8 + el.strokeWidth) return el
      } else {
        const b = getBounds(el)
        if (wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) return el
      }
    }
    return null
  }, [])

  // ---- wheel: pan + zoom ----
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const store = useWhiteboard.getState()
      const cam = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
      if (e.ctrlKey || e.metaKey) {
        const r = node.getBoundingClientRect()
        const sx = e.clientX - r.left
        const sy = e.clientY - r.top
        const factor = Math.exp(-e.deltaY * 0.01)
        const newZoom = Math.min(4, Math.max(0.1, cam.zoom * factor))
        const wx = (sx - cam.x) / cam.zoom
        const wy = (sy - cam.y) / cam.zoom
        store.setCamera({ zoom: newZoom, x: sx - wx * newZoom, y: sy - wy * newZoom })
      } else {
        store.setCamera({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY })
      }
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [])

  // ---- keyboard shortcuts ----
  useEffect(() => {
    // Zoom toward the viewport center, mirroring the ZoomControls behavior.
    const zoomAtCenter = (factor: number) => {
      const store = useWhiteboard.getState()
      const cam = store.current().camera
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const next = Math.min(4, Math.max(0.1, cam.zoom * factor))
      const worldX = (cx - cam.x) / cam.zoom
      const worldY = (cy - cam.y) / cam.zoom
      store.setCamera({ zoom: next, x: cx - worldX * next, y: cy - worldY * next })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const store = useWhiteboard.getState()
      const target = e.target as HTMLElement
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      if (e.key === " " && !typing) {
        spaceDown.current = true
      }
      // never let single-key tool shortcuts fire while typing or editing an
      // element — otherwise letters silently switch tools ("reverts to mouse")
      if (typing || store.editingId) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault()
        store.redo()
      } else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault()
        store.selectAll()
      } else if (meta && e.key.toLowerCase() === "c") {
        store.copy()
      } else if (meta && e.key.toLowerCase() === "v") {
        store.paste()
      } else if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault()
        store.duplicateSelected()
      } else if (meta && e.key === "]") {
        // move selection one layer toward the front
        e.preventDefault()
        store.bringForward()
      } else if (meta && e.key === "[") {
        // move selection one layer toward the back
        e.preventDefault()
        store.sendBackward()
      } else if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault()
        zoomAtCenter(1.2)
      } else if (meta && (e.key === "-" || e.key === "_")) {
        e.preventDefault()
        zoomAtCenter(1 / 1.2)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        store.deleteSelected()
      } else if (e.key === "Escape") {
        store.setEditing(null)
        store.clearSelection()
      } else if (e.key === "v" || e.key === "1") store.setTool("select")
      else if (e.key === "h") store.setTool("hand")
      else if (e.key === "r" || e.key === "2") store.setTool("rectangle")
      else if (e.key === "o" || e.key === "3") store.setTool("ellipse")
      else if (e.key === "d") store.setTool("diamond")
      else if (e.key === "a" || e.key === "4") store.setTool("arrow")
      else if (e.key === "l") store.setTool("line")
      else if (e.key === "t" || e.key === "5") store.setTool("text")
      else if (e.key === "c" || e.key === "6") store.setTool("card")
      else if (e.key === "k") store.setTool("code")
      else if (e.key === "e") store.setTool("terminal")
      else if (e.key === "w") store.setTool("website")
      else if (e.key === "s") store.setTool("server")
      else if (e.key === "g") store.setTool("filetree")
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown.current = false
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  // ---- global pointer move/up while gesturing ----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const store = useWhiteboard.getState()
      // dragging a new workflow connection
      if (store.connectingFrom) {
        const cam0 = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
        const s0 = toScreen(e)
        store.updateConnectDrag(screenToWorld(s0.x, s0.y, cam0))
        return
      }
      const g = gesture.current
      if (g.mode === "idle") return
      const cam = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
      const els = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).elements
      const screen = toScreen(e)
      const world = screenToWorld(screen.x, screen.y, cam)
      const thr = SNAP_THRESHOLD / cam.zoom

      if (g.mode === "pan") {
        store.setCamera({
          ...cam,
          x: g.startCam.x + (screen.x - g.startScreen.x),
          y: g.startCam.y + (screen.y - g.startScreen.y),
        })
      } else if (g.mode === "create") {
        let w = world.x - g.start.x
        let h = world.y - g.start.y
        // shift locks width/height equal (constrains to a square / 45° line)
        if (e.shiftKey) {
          const size = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * size
          h = Math.sign(h || 1) * size
        }
        store.update([g.id], { width: w, height: h })
      } else if (g.mode === "move") {
        g.moved = true
        let dx = world.x - g.startWorld.x
        let dy = world.y - g.startWorld.y
        const selEls = els.filter((el) => g.origins[el.id])
        // moving bounds from origins
        const movingEls = selEls.map((el) => ({
          ...el,
          x: g.origins[el.id].x + dx,
          y: g.origins[el.id].y + dy,
        }))
        const mb = getSelectionBounds(movingEls)
        if (mb) {
          const others = els.filter((el) => !g.origins[el.id])
          const snap = computeSnap(mb, others, thr)
          dx += snap.dx
          dy += snap.dy
          const newGuides = [...snap.guides]
          // grid fallback per axis
          if (snap.dx === 0) {
            const gx = snapToGrid(mb.x, GRID_SIZE)
            if (Math.abs(gx - mb.x) <= thr) dx += gx - mb.x
          }
          if (snap.dy === 0) {
            const gy = snapToGrid(mb.y, GRID_SIZE)
            if (Math.abs(gy - mb.y) <= thr) dy += gy - mb.y
          }
          setGuides(newGuides)
        }
        for (const el of selEls) {
          store.update([el.id], { x: g.origins[el.id].x + dx, y: g.origins[el.id].y + dy })
        }
      } else if (g.mode === "resize") {
        handleResize(g, world, store, thr)
      } else if (g.mode === "marquee") {
        const x = Math.min(g.startScreen.x, screen.x)
        const y = Math.min(g.startScreen.y, screen.y)
        const width = Math.abs(screen.x - g.startScreen.x)
        const height = Math.abs(screen.y - g.startScreen.y)
        setMarquee({ x, y, width, height })
        // live selection
        const w1 = screenToWorld(x, y, cam)
        const w2 = screenToWorld(x + width, y + height, cam)
        const box = { x: w1.x, y: w1.y, width: w2.x - w1.x, height: w2.y - w1.y }
        const hits = els
          .filter((el) => {
            const b = getBounds(el)
            return (
              b.x < box.x + box.width &&
              b.x + b.width > box.x &&
              b.y < box.y + box.height &&
              b.y + b.height > box.y
            )
          })
          .map((el) => el.id)
        store.select(hits)
      }
    }

    const onUp = (e: PointerEvent) => {
      const store = useWhiteboard.getState()
      // finish a workflow connection drag
      if (store.connectingFrom) {
        const cam = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
        const els = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).elements
        const s = toScreen(e)
        const world = screenToWorld(s.x, s.y, cam)
        const target = hitTest(world.x, world.y, els)
        store.finishConnect(target && target.id !== store.connectingFrom ? target.id : null)
        return
      }
      const g = gesture.current
      if (g.mode === "create") {
        const els = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).elements
        const el = els.find((x) => x.id === g.id)
        if (el) {
          const isTiny = Math.abs(el.width) < 4 && Math.abs(el.height) < 4
          if (isTiny && el.type !== "text") {
            // click without drag -> default sized element centered on click
            store.update([el.id], { width: 120, height: 80, x: el.x - 60, y: el.y - 40 })
          }
          if (el.type === "text") {
            store.setEditing(el.id)
          }
        }
        store.setTool("select")
        store.select([g.id])
      }
      if (g.mode === "marquee") setMarquee(null)
      setGuides([])
      gesture.current = { mode: "idle" }
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [toScreen, hitTest])

  const handleResize = (
    g: Extract<Gesture, { mode: "resize" }>,
    world: { x: number; y: number },
    store: ReturnType<typeof useWhiteboard.getState>,
    thr: number,
  ) => {
    // line endpoints
    if ((g.handle === "start" || g.handle === "end") && g.origEls.length === 1) {
      const el = g.origEls[0]
      const gx = snapToGrid(world.x, GRID_SIZE)
      const gy = snapToGrid(world.y, GRID_SIZE)
      const px = Math.abs(gx - world.x) < SNAP_THRESHOLD ? gx : world.x
      const py = Math.abs(gy - world.y) < SNAP_THRESHOLD ? gy : world.y
      if (g.handle === "start") {
        const endX = el.x + el.width
        const endY = el.y + el.height
        store.update([el.id], { x: px, y: py, width: endX - px, height: endY - py })
      } else {
        store.update([el.id], { width: px - el.x, height: py - el.y })
      }
      return
    }

    const ob = g.origBounds
    let left = ob.x
    let top = ob.y
    let right = ob.x + ob.width
    let bottom = ob.y + ob.height
    const h = g.handle

    // Other elements act as magnetic snap targets for the dragged edge, so a
    // resize aligns to a neighbor's edge/center just like a move does.
    const resizingIds = new Set(g.origEls.map((el) => el.id))
    const targets = store.current().elements.filter((el) => !resizingIds.has(el.id))
    const newGuides: SnapGuide[] = []

    // Resolve a dragged edge on one axis: prefer snapping to a nearby element,
    // otherwise fall back to the grid.
    const resolve = (axis: "x" | "y", value: number, perpStart: number, perpEnd: number) => {
      const snap = snapEdgeToTargets(value, axis, targets, thr, perpStart, perpEnd)
      if (snap.guide) {
        newGuides.push(snap.guide)
        return snap.value
      }
      const grid = snapToGrid(value, GRID_SIZE)
      return Math.abs(grid - value) < SNAP_THRESHOLD / 2 ? grid : value
    }

    if (h.includes("w") || h.includes("e")) {
      const vx = resolve("x", world.x, ob.y, ob.y + ob.height)
      if (h.includes("w")) left = vx
      if (h.includes("e")) right = vx
    }
    if (h.includes("n") || h.includes("s")) {
      const vy = resolve("y", world.y, ob.x, ob.x + ob.width)
      if (h.includes("n")) top = vy
      if (h.includes("s")) bottom = vy
    }
    setGuides(newGuides)
    const nb = {
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.max(10, Math.abs(right - left)),
      height: Math.max(10, Math.abs(bottom - top)),
    }
    const scaleX = ob.width === 0 ? 1 : nb.width / ob.width
    const scaleY = ob.height === 0 ? 1 : nb.height / ob.height
    for (const el of g.origEls) {
      const relX = el.x - ob.x
      const relY = el.y - ob.y
      const patch: Partial<CanvasElement> = {
        x: nb.x + relX * scaleX,
        y: nb.y + relY * scaleY,
        width: el.width * scaleX,
        height: el.height * scaleY,
      }
      if (el.type === "text" && el.fontSize) {
        patch.fontSize = Math.max(8, el.fontSize * scaleY)
      }
      store.update([el.id], patch)
    }
  }

  // ---- surface pointer down ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) e.preventDefault()
    const store = useWhiteboard.getState()
    const screen = toScreen(e)
    const world = screenToWorld(screen.x, screen.y, camera)

    // pan: hand tool, space, ctrl-click, or middle mouse
    if (tool === "hand" || spaceDown.current || e.button === 1 || e.ctrlKey) {
      e.preventDefault()
      gesture.current = { mode: "pan", startScreen: screen, startCam: { x: camera.x, y: camera.y } }
      return
    }

    if (e.button !== 0) return

    // creation tools
    if (["rectangle", "ellipse", "diamond", "arrow", "line", "text", "card", "code", "terminal", "website", "server", "filetree", "aigateway", "ec2", "fluidcompute", "requestdemo"].includes(tool)) {
      const el = createElement(tool, world.x, world.y, {
        stroke: "#000000",
        fill: tool === "card" ? "#ffffff" : "transparent",
        strokeWidth: tool === "card" ? 1 : 2,
      })
      const fixedSize =
        tool === "text" ||
        tool === "card" ||
        tool === "code" ||
        tool === "terminal" ||
        tool === "website" ||
        tool === "server" ||
        tool === "filetree" ||
        tool === "aigateway" ||
        tool === "ec2" ||
        tool === "fluidcompute" ||
        tool === "requestdemo"
      if (fixedSize) {
        // place at click; these tools have a fixed default size
        el.x = world.x
        el.y = world.y
      }
      store.addElement(el)
      store.select([el.id])
      if (fixedSize) {
        // fixed default size — no drag-to-size (prevents collapsed/vertical text)
        // preventDefault stops the browser from moving focus off the editor
        // textarea (which would fire an immediate blur and delete the element)
        e.preventDefault()
        store.setTool("select")
        gesture.current = { mode: "idle" }
        if (tool === "text") store.setEditing(el.id)
      } else {
        gesture.current = { mode: "create", id: el.id, start: { x: world.x, y: world.y } }
      }
      return
    }

    // select tool
    const hit = hitTest(world.x, world.y, elements)
    if (hit) {
      const already = store.selectedIds.includes(hit.id)
      if (e.shiftKey) {
        store.toggleSelect(hit.id)
      } else if (!already) {
        store.select([hit.id])
      }
      const ids = e.shiftKey
        ? store.selectedIds
        : already
          ? store.selectedIds
          : [hit.id]
      const origins: Record<string, { x: number; y: number }> = {}
      for (const el of elements) {
        // Companion code blocks and channel UI blocks are pinned to their
        // file-tree — they can't be dragged on their own, only carried when the
        // tree itself moves.
        if (ids.includes(el.id) && !el.companionOf && !el.channelParent) origins[el.id] = { x: el.x, y: el.y }
      }
      // A file-tree keeps its companion code block and any open channel UI block
      // pinned to its side: drag the tree and they move with it (even when not
      // themselves selected).
      for (const el of elements) {
        if (ids.includes(el.id) && el.type === "filetree") {
          if (el.companionId) {
            const comp = elements.find((c) => c.id === el.companionId)
            if (comp && !origins[comp.id]) origins[comp.id] = { x: comp.x, y: comp.y }
          }
          for (const ch of elements) {
            if (ch.type === "channelui" && ch.channelParent === el.id && !origins[ch.id]) {
              origins[ch.id] = { x: ch.x, y: ch.y }
            }
          }
        }
      }
      store.beginInteraction()
      gesture.current = { mode: "move", startWorld: world, origins, moved: false }
    } else {
      if (!e.shiftKey) store.clearSelection()
      gesture.current = { mode: "marquee", startScreen: screen, additive: e.shiftKey }
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const store = useWhiteboard.getState()
    const screen = toScreen(e)
    const world = screenToWorld(screen.x, screen.y, camera)
    const hit = hitTest(world.x, world.y, elements)
    if (hit && (hit.type === "text" || hit.type === "card" || hit.type === "code" || hit.type === "terminal")) {
      store.select([hit.id])
      store.setEditing(hit.id)
    } else if (!hit) {
      // double click empty creates a text element
      const el = createElement("text", world.x, world.y, {
        stroke: "#000000",
        fill: "transparent",
        strokeWidth: 2,
      })
      store.addElement(el)
      store.select([el.id])
      store.setEditing(el.id)
    }
  }

  const onHandleDown = (handle: HandleId, e: React.PointerEvent) => {
    e.stopPropagation()
    const store = useWhiteboard.getState()
    const screen = toScreen(e)
    const world = screenToWorld(screen.x, screen.y, camera)
    const selEls = elements.filter((el) => store.selectedIds.includes(el.id))
    // Companion code, channel UI, and file-tree blocks are locked & auto-sized.
    if (selEls.length === 1 && (selEls[0].companionOf || selEls[0].channelParent || selEls[0].type === "filetree")) return
    const ob = getSelectionBounds(selEls)
    if (!ob) return
    store.beginInteraction()
    gesture.current = {
      mode: "resize",
      handle,
      startWorld: world,
      origBounds: ob,
      origEls: selEls.map((el) => ({ ...el })),
    }
  }

  const selectedEls = elements.filter((el) => selectedIds.includes(el.id))
  const cursor =
    tool === "hand"
      ? "grab"
      : tool === "select"
        ? "default"
        : "crosshair"

  // The dot grid stays a fixed screen-space pattern — it pans with the camera
  // but its spacing and dot size never scale with zoom. Only the content layer
  // below is transformed by camera.zoom.
  const gridPx = GRID_SIZE
  const dotRadius = 1

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ cursor, background: "#ffffff" }}
    >
      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(rgba(0,0,0,0.18) ${dotRadius}px, transparent ${dotRadius}px)`,
          backgroundSize: `${gridPx}px ${gridPx}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          opacity: gridPx < 8 ? 0 : 1,
        }}
      />

      {/* world layer */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <ConnectionCurves />
        {elements.map((el) => (
          <CanvasElementView key={el.id} el={el} />
        ))}
        {editingId && <ElementEditor id={editingId} />}
        <ConnectionHandles />
      </div>

      <SelectionOverlay
        camera={camera}
        selected={editingId ? [] : selectedEls}
        guides={guides}
        marquee={marquee}
        onHandleDown={onHandleDown}
      />
    </div>
  )
}
