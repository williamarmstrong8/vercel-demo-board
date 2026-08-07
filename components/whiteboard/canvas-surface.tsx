"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon } from "lucide-react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { createElement } from "@/lib/whiteboard/factory"
import { dragHasImage, imageSourcesFromDataTransfer, insertImages } from "@/lib/whiteboard/insert-image"
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

// Exact unit vectors for each 45° octant. Deriving these from cos/sin of a
// computed angle (e.g. Math.cos(Math.PI / 2)) leaves tiny floating-point
// residue instead of a clean 0 on axis-aligned directions — which then slips
// past the `|| 1` zero-guard in LineSvg's viewBox math and renders a
// degenerate (near-zero-width) SVG that the browser draws as invisible. A
// lookup table sidesteps trig error entirely so horizontal/vertical drags
// land on an exact 0 component.
const OCTANT_UNIT_VECTORS: Array<[number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

function snapVectorTo45(x: number, y: number) {
  const length = Math.hypot(x, y)
  if (length === 0) return { x: 0, y: 0 }
  const increment = Math.PI / 4
  const octant = (Math.round(Math.atan2(y, x) / increment) + 8) % 8
  const [ux, uy] = OCTANT_UNIT_VECTORS[octant]
  const norm = Math.hypot(ux, uy) || 1
  return { x: (ux / norm) * length, y: (uy / norm) * length }
}

// Screen-space gap (in CSS pixels) kept between a snapped arrow endpoint and
// the shape it's attaching to, so the arrow visibly points at the shape
// instead of touching/overlapping its stroke. Divided by zoom at each call
// site to convert to world units, so the gap looks the same size on screen
// at any zoom level.
const SNAP_GAP_SCREEN_PX = 10

// Point just outside the OUTLINE of a bounding box, near the nearest edge to
// an arbitrary point — used so an arrow/line dragged near a shape snaps its
// endpoint just off that shape's border (by `padding`) rather than exactly on
// it or wherever the cursor happens to be. Outside the box, the nearest edge
// point is pushed further out along the cursor's direction from the box;
// inside, we project to whichever edge is closest and push out along that
// edge's normal.
function nearestPerimeterPoint(
  b: { x: number; y: number; width: number; height: number },
  px: number,
  py: number,
  padding = 0,
) {
  const left = b.x
  const right = b.x + b.width
  const top = b.y
  const bottom = b.y + b.height
  const inside = px > left && px < right && py > top && py < bottom
  if (!inside) {
    const cx = Math.min(Math.max(px, left), right)
    const cy = Math.min(Math.max(py, top), bottom)
    const dx = px - cx
    const dy = py - cy
    const dist = Math.hypot(dx, dy)
    if (dist > 1e-3) {
      return { x: cx + (dx / dist) * padding, y: cy + (dy / dist) * padding }
    }
    px = cx
    py = cy
  }
  const dLeft = px - left
  const dRight = right - px
  const dTop = py - top
  const dBottom = bottom - py
  const closest = Math.min(dLeft, dRight, dTop, dBottom)
  if (closest === dLeft) return { x: left - padding, y: py }
  if (closest === dRight) return { x: right + padding, y: py }
  if (closest === dTop) return { x: px, y: top - padding }
  return { x: px, y: bottom + padding }
}

// Shape/block under the cursor that an in-progress arrow or line can snap to.
// Other arrows/lines never act as snap targets, and the element currently
// being drawn is excluded so it can't snap to itself mid-drag.
function snapHitTest(wx: number, wy: number, els: CanvasElement[], excludeId?: string): CanvasElement | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i]
    if (el.id === excludeId) continue
    if (el.type === "arrow" || el.type === "line") continue
    const b = getBounds(el)
    if (wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) return el
  }
  return null
}

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
  const pendingTemplate = useWhiteboard((s) => s.pendingTemplate)

  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const dragDepth = useRef(0)

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

  // ---- drag & drop images ----
  // Bound to the window rather than the canvas element: the toolbar and the
  // properties panel sit above the canvas, and a file dropped on one of those
  // would otherwise fall through to the browser, which navigates away from the
  // board to open the image. Listening globally means every drop lands on the
  // board at the cursor, wherever the chrome happens to be.
  useEffect(() => {
    const accepts = (e: DragEvent) =>
      !useWhiteboard.getState().readOnly && !!e.dataTransfer && dragHasImage(e.dataTransfer)

    // dragenter/dragleave also fire for every element the cursor crosses on the
    // way in, so a plain boolean flickers the overlay off mid-drag. Counting
    // enters against leaves keeps it up until the cursor really leaves.
    const onDragEnter = (e: DragEvent) => {
      if (!accepts(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDropActive(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!accepts(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    const onDragLeave = () => {
      if (dragDepth.current === 0) return
      dragDepth.current -= 1
      if (dragDepth.current === 0) setDropActive(false)
    }
    const onDrop = (e: DragEvent) => {
      const accepted = accepts(e)
      dragDepth.current = 0
      setDropActive(false)
      if (!accepted || !e.dataTransfer) return
      e.preventDefault()
      // dataTransfer is emptied the moment this handler returns, so the
      // sources have to come out of it before anything is awaited.
      const sources = imageSourcesFromDataTransfer(e.dataTransfer)
      if (sources.length === 0) return
      const screen = toScreen(e)
      const cam = useWhiteboard.getState().current().camera
      void insertImages(sources, screenToWorld(screen.x, screen.y, cam))
    }

    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [toScreen])

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
        // Paste centered on the viewport, not wherever the copied elements
        // originally lived on the board — matches user expectation when
        // they've panned/zoomed away from the copy source.
        const cam = store.current().camera
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        store.paste({ x: (cx - cam.x) / cam.zoom, y: (cy - cam.y) / cam.zoom })
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
        store.setPendingTemplate(null)
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
      const g = gesture.current
      const cam = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).camera
      const els = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).elements
      const screen = toScreen(e)
      const world = screenToWorld(screen.x, screen.y, cam)

      // Arrow/line snap-target highlight: whatever shape is under the cursor
      // lights up so it's clear the endpoint will snap to its outline. Runs
      // while drawing a new arrow/line (idle + create) and while dragging an
      // existing arrow/line's start or end handle to reattach it.
      const draggingLineEndpoint =
        g.mode === "resize" &&
        (g.handle === "start" || g.handle === "end") &&
        g.origEls.length === 1 &&
        (g.origEls[0].type === "arrow" || g.origEls[0].type === "line")
      if ((store.tool === "arrow" || store.tool === "line") && (g.mode === "idle" || g.mode === "create")) {
        const hit = snapHitTest(world.x, world.y, els, g.mode === "create" ? g.id : undefined)
        if (store.snapTargetId !== (hit?.id ?? null)) store.setSnapTarget(hit?.id ?? null)
      } else if (draggingLineEndpoint) {
        const hit = snapHitTest(world.x, world.y, els, g.origEls[0].id)
        if (store.snapTargetId !== (hit?.id ?? null)) store.setSnapTarget(hit?.id ?? null)
      } else if (store.snapTargetId) {
        store.setSnapTarget(null)
      }

      if (g.mode === "idle") return
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
        const creating = els.find((el) => el.id === g.id)
        const isLinear = creating?.type === "arrow" || creating?.type === "line"
        if (e.shiftKey) {
          if (isLinear) {
            const snapped = snapVectorTo45(w, h)
            w = snapped.x
            h = snapped.y
          } else {
            const size = Math.max(Math.abs(w), Math.abs(h))
            w = Math.sign(w || 1) * size
            h = Math.sign(h || 1) * size
          }
        } else if (isLinear && store.snapTargetId) {
          // endpoint hovering a shape: snap it to that shape's outline instead
          // of the raw cursor position
          const target = els.find((el) => el.id === store.snapTargetId)
          if (target) {
            const tb = getBounds(target)
            const snapped = nearestPerimeterPoint(tb, world.x, world.y, SNAP_GAP_SCREEN_PX / cam.zoom)
            w = snapped.x - g.start.x
            h = snapped.y - g.start.y
          }
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
        handleResize(g, world, store, thr, e.shiftKey, cam.zoom)
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
      store.setSnapTarget(null)
      gesture.current = { mode: "idle" }
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [toScreen])

  const handleResize = (
    g: Extract<Gesture, { mode: "resize" }>,
    world: { x: number; y: number },
    store: ReturnType<typeof useWhiteboard.getState>,
    thr: number,
    lockAngle: boolean,
    zoom: number,
  ) => {
    // line endpoints
    if ((g.handle === "start" || g.handle === "end") && g.origEls.length === 1) {
      const el = g.origEls[0]
      const isLinear = el.type === "arrow" || el.type === "line"
      const snapTarget =
        isLinear && !lockAngle && store.snapTargetId
          ? store.current().elements.find((e) => e.id === store.snapTargetId)
          : null
      let px: number
      let py: number
      if (snapTarget) {
        // reattaching to a highlighted shape: land just off its outline
        // instead of exactly on it or the raw cursor position
        const snapped = nearestPerimeterPoint(getBounds(snapTarget), world.x, world.y, SNAP_GAP_SCREEN_PX / zoom)
        px = snapped.x
        py = snapped.y
      } else {
        const gx = snapToGrid(world.x, GRID_SIZE)
        const gy = snapToGrid(world.y, GRID_SIZE)
        px = Math.abs(gx - world.x) < SNAP_THRESHOLD ? gx : world.x
        py = Math.abs(gy - world.y) < SNAP_THRESHOLD ? gy : world.y
      }
      if (lockAngle && (el.type === "arrow" || el.type === "line")) {
        const anchorX = g.handle === "start" ? el.x + el.width : el.x
        const anchorY = g.handle === "start" ? el.y + el.height : el.y
        const snapped = snapVectorTo45(px - anchorX, py - anchorY)
        px = anchorX + snapped.x
        py = anchorY + snapped.y
      }
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

    // Shift-dragging a corner preserves the original selection aspect ratio.
    // The opposite corner stays fixed, matching standard design-tool behavior.
    const isCorner = (h.includes("w") || h.includes("e")) && (h.includes("n") || h.includes("s"))
    if (lockAngle && isCorner && ob.width > 0 && ob.height > 0) {
      const width = Math.abs(right - left)
      const height = Math.abs(bottom - top)
      const widthScale = width / ob.width
      const heightScale = height / ob.height
      const scale = Math.max(widthScale, heightScale)
      const lockedWidth = Math.max(10, ob.width * scale)
      const lockedHeight = Math.max(10, ob.height * scale)
      if (h.includes("w")) left = right - lockedWidth
      else right = left + lockedWidth
      if (h.includes("n")) top = bottom - lockedHeight
      else bottom = top + lockedHeight
      newGuides.length = 0
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

    if (store.pendingTemplate) {
      const { elements: templateElements } = store.pendingTemplate
      if (templateElements.length > 0) {
        const minX = Math.min(...templateElements.map((element) => element.x))
        const minY = Math.min(...templateElements.map((element) => element.y))
        const placed = templateElements.map((element) => ({
          ...element,
          x: element.x + world.x - minX,
          y: element.y + world.y - minY,
        }))
        store.addTemplate(placed)
        e.preventDefault()
      }
      return
    }

    // creation tools
    if (["rectangle", "ellipse", "diamond", "arrow", "line", "text", "card", "code", "terminal", "server", "filetree", "aigateway", "ec2", "fluidcompute", "serverlesscompute", "computecomparison", "requestdemo"].includes(tool)) {
      // starting an arrow/line on a highlighted shape snaps the start point
      // just off that shape's outline rather than the raw click position
      let startX = world.x
      let startY = world.y
      if ((tool === "arrow" || tool === "line") && store.snapTargetId) {
        const target = elements.find((el) => el.id === store.snapTargetId)
        if (target) {
          const snapped = nearestPerimeterPoint(getBounds(target), world.x, world.y, SNAP_GAP_SCREEN_PX / camera.zoom)
          startX = snapped.x
          startY = snapped.y
        }
      }
      const el = createElement(tool, startX, startY, {
        stroke: "#000000",
        fill: tool === "card" ? "#ffffff" : "transparent",
        strokeWidth: tool === "card" ? 1 : 2,
      })
      const fixedSize =
        tool === "text" ||
        tool === "card" ||
        tool === "code" ||
        tool === "terminal" ||
        tool === "server" ||
        tool === "filetree" ||
        tool === "aigateway" ||
        tool === "ec2" ||
        tool === "fluidcompute" ||
        tool === "serverlesscompute" ||
        tool === "computecomparison" ||
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
        gesture.current = { mode: "create", id: el.id, start: { x: startX, y: startY } }
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
      : pendingTemplate
        ? "crosshair"
        : tool === "select"
          ? "default"
          : "crosshair"

  // The dot grid stays a fixed screen-space pattern — it pans with the camera
  // but its spacing and dot size never scale with zoom. Only the content layer
  // below is transformed by camera.zoom.
  const gridPx = GRID_SIZE
  const dotRadius = 1

  // The pattern repeats every gridPx, so only the offset within a single tile
  // matters — wrapping it keeps background-position in [0, gridPx) instead of
  // handing the browser an origin thousands of pixels off-screen, which is
  // where it stops tiling and leaves the canvas blank white. Pan far enough
  // from the origin (a long pasted text block does it easily) and the raw
  // camera offset gets there.
  const gridOffsetX = ((camera.x % gridPx) + gridPx) % gridPx
  const gridOffsetY = ((camera.y % gridPx) + gridPx) % gridPx

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
          backgroundPosition: `${gridOffsetX}px ${gridOffsetY}px`,
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
        {elements.map((el) => (
          <CanvasElementView key={el.id} el={el} />
        ))}
        {editingId && <ElementEditor id={editingId} />}
      </div>

      <SelectionOverlay
        camera={camera}
        selected={editingId ? [] : selectedEls}
        guides={guides}
        marquee={marquee}
        onHandleDown={onHandleDown}
      />

      {/* Drop affordance. pointer-events-none matters: an overlay that takes
          hits would swallow the drag events the container is counting. */}
      {dropActive && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgba(0,112,243,0.06)", boxShadow: "inset 0 0 0 2px #0070f3" }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 px-4 py-2.5 text-sm text-white">
            <ImageIcon className="size-4" />
            Drop to add to the board
          </div>
        </div>
      )}
    </div>
  )
}
