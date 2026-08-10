"use client"

import { useWhiteboard, uid } from "@/lib/whiteboard/store"
import type { CanvasElement } from "@/lib/whiteboard/types"

// Widest an inserted image is allowed to be in world units, so a phone photo
// lands as a picture on the board rather than a wall covering everything
// already on it. Aspect ratio is preserved; the user can resize from there.
const MAX_INSERT_WIDTH = 360

// Images from a single multi-file drop cascade by this much so they arrive as
// a readable stack instead of one opaque pile.
const STACK_OFFSET = 24

// Fallback box for an image that loads but reports no intrinsic size — some
// SVGs have no width/height or viewBox. Matches the image factory default.
const FALLBACK_SIZE = { width: 240, height: 160 }

// Either raw bytes (a file from the OS) or a URL (a drag from another tab).
export type ImageSource = File | string

/**
 * Whether an in-progress drag looks like it carries an image. Called from
 * dragover, where the payload itself is unreadable for security — only item
 * metadata and the type list are exposed, so this is as specific as the check
 * can get. The drop handler does the real filtering.
 */
export function dragHasImage(dt: DataTransfer): boolean {
  const fileItems = Array.from(dt.items).filter((item) => item.kind === "file")
  if (fileItems.length > 0) {
    // Safari leaves `type` empty until drop, so an unknown type counts as a
    // maybe rather than a no.
    return fileItems.some((item) => item.type === "" || item.type.startsWith("image/"))
  }
  return Array.from(dt.types).includes("text/uri-list")
}

/**
 * Pulls the droppable images out of a drop payload. Must be called
 * synchronously inside the drop handler — `dataTransfer` is emptied once it
 * returns.
 */
export function imageSourcesFromDataTransfer(dt: DataTransfer): ImageSource[] {
  const files = Array.from(dt.files).filter((file) => file.type.startsWith("image/"))
  if (files.length > 0) return files

  // text/uri-list is newline-separated and allows '#' comment lines.
  const list = dt.getData("text/uri-list") || dt.getData("text/plain")
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .filter((line) => /^(https?:|data:image\/)/i.test(line))
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/**
 * Turns a dragged-in URL into a data URL so the board stays self-contained and
 * keeps rendering after the source page takes the image down. Most origins
 * refuse the cross-origin read, and in that case the plain URL still displays
 * fine — so fall back to it rather than dropping the image entirely.
 */
async function inlineRemoteUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url
  try {
    const res = await fetch(url, { mode: "cors" })
    if (!res.ok) return url
    const blob = await res.blob()
    if (!blob.type.startsWith("image/")) return url
    const inlined = await readFileAsDataUrl(new File([blob], "image", { type: blob.type }))
    return inlined ?? url
  } catch {
    return url
  }
}

// Resolves to null when the source isn't a loadable image, which is the only
// signal we get that a dragged URL pointed at something else.
function measure(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height
      resolve(width > 0 && height > 0 ? { width, height } : FALLBACK_SIZE)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Adds images to the current board centered on a world-space point. Sources
 * that fail to read or aren't really images are skipped; the rest go in as a
 * single batch so a multi-file drop is one undo step and one autosave.
 *
 * Returns how many images were actually inserted.
 */
export async function insertImages(
  sources: ImageSource[],
  center: { x: number; y: number },
): Promise<number> {
  if (sources.length === 0) return 0
  if (useWhiteboard.getState().readOnly) return 0

  const resolved = await Promise.all(
    sources.map(async (source) => {
      const src = typeof source === "string" ? await inlineRemoteUrl(source) : await readFileAsDataUrl(source)
      if (!src) return null
      const size = await measure(src)
      return size ? { src, size } : null
    }),
  )

  const elements: CanvasElement[] = []
  for (const item of resolved) {
    if (!item) continue
    const scale = Math.min(1, MAX_INSERT_WIDTH / item.size.width)
    const width = item.size.width * scale
    const height = item.size.height * scale
    const offset = elements.length * STACK_OFFSET
    elements.push({
      id: uid(),
      type: "image",
      x: center.x - width / 2 + offset,
      y: center.y - height / 2 + offset,
      width,
      height,
      rotation: 0,
      stroke: "transparent",
      fill: "transparent",
      strokeWidth: 0,
      opacity: 1,
      rounded: true,
      src: item.src,
      z: 0,
    })
  }

  if (elements.length === 0) return 0

  // Re-read the store rather than reusing the snapshot above: reading and
  // decoding the files was async, and the board may have moved on since.
  const store = useWhiteboard.getState()
  store.addElements(elements)
  store.setTool("select")
  store.select(elements.map((el) => el.id))
  return elements.length
}
