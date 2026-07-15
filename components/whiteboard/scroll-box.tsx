"use client"

import type React from "react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * A scroll container with ALWAYS-VISIBLE, custom-drawn scrollbars.
 *
 * Why this exists: native scrollbars are unreliable across platforms. On macOS
 * (and Linux/ChromeOS Chromium) the OS uses *overlay* scrollbars that take zero
 * layout space and auto-hide, and those browsers frequently ignore
 * `::-webkit-scrollbar` styling entirely — so a `overflow:auto` code viewer
 * scrolls (spacebar/wheel work) but shows no visible bar. This component hides
 * the native scrollbar and renders its own thumbs positioned from the live
 * scroll metrics, so the affordance is guaranteed to show and is draggable.
 */
export function ScrollBox({
  children,
  className,
  style,
  thumbColor = "#4a4a4a",
  thumbHoverColor = "#6a6a6a",
  viewportRef: externalViewportRef,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  thumbColor?: string
  thumbHoverColor?: string
  /** Exposes the inner scroll viewport so callers can drive it (e.g. auto-scroll to bottom). */
  viewportRef?: React.RefObject<HTMLDivElement | null>
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // Keep an optional caller-provided ref in sync with the real viewport node.
  const setViewportNode = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node
      if (externalViewportRef) externalViewportRef.current = node
    },
    [externalViewportRef],
  )
  const [m, setM] = useState({ st: 0, sl: 0, sh: 0, sw: 0, ch: 0, cw: 0 })
  const [hover, setHover] = useState(false)

  const measure = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    setM({
      st: el.scrollTop,
      sl: el.scrollLeft,
      sh: el.scrollHeight,
      sw: el.scrollWidth,
      ch: el.clientHeight,
      cw: el.clientWidth,
    })
  }, [])

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    // Observe children too, so streaming content updates the thumb sizes.
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [measure, children])

  const vTrack = 12 // gutter reserved for the vertical thumb
  const hTrack = 12
  const vScrollable = m.sh > m.ch + 1
  const hScrollable = m.sw > m.cw + 1

  // Vertical thumb geometry (in viewport px).
  const vThumbH = vScrollable ? Math.max(24, (m.ch / m.sh) * m.ch) : 0
  const vThumbTop = vScrollable ? (m.st / (m.sh - m.ch)) * (m.ch - vThumbH) : 0
  // Horizontal thumb geometry.
  const hThumbW = hScrollable ? Math.max(24, (m.cw / m.sw) * m.cw) : 0
  const hThumbLeft = hScrollable ? (m.sl / (m.sw - m.cw)) * (m.cw - hThumbW) : 0

  // Dragging.
  const drag = useRef<{ axis: "v" | "h"; startPos: number; startScroll: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = viewportRef.current
      const d = drag.current
      if (!el || !d) return
      if (d.axis === "v") {
        const trackRange = m.ch - vThumbH
        const scrollRange = m.sh - m.ch
        if (trackRange > 0) el.scrollTop = d.startScroll + ((e.clientY - d.startPos) / trackRange) * scrollRange
      } else {
        const trackRange = m.cw - hThumbW
        const scrollRange = m.sw - m.cw
        if (trackRange > 0) el.scrollLeft = d.startScroll + ((e.clientX - d.startPos) / trackRange) * scrollRange
      }
    }
    const onUp = () => {
      drag.current = null
      document.body.style.userSelect = ""
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [m, vThumbH, hThumbW])

  const startDrag = (axis: "v" | "h") => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const el = viewportRef.current
    if (!el) return
    drag.current = {
      axis,
      startPos: axis === "v" ? e.clientY : e.clientX,
      startScroll: axis === "v" ? el.scrollTop : el.scrollLeft,
    }
    document.body.style.userSelect = "none"
  }

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={setViewportNode}
        className="wb-scroll-native"
        onScroll={measure}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: "100%", height: "100%", overflow: "auto" }}
      >
        {children}
      </div>

      {vScrollable && (
        <div
          onPointerDown={startDrag("v")}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: vTrack - 4,
            height: vThumbH,
            transform: `translateY(${vThumbTop}px)`,
            borderRadius: 999,
            background: hover ? thumbHoverColor : thumbColor,
            cursor: "pointer",
            transition: "background 120ms",
          }}
        />
      )}
      {hScrollable && (
        <div
          onPointerDown={startDrag("h")}
          style={{
            position: "absolute",
            left: 2,
            bottom: 2,
            height: hTrack - 4,
            width: hThumbW,
            transform: `translateX(${hThumbLeft}px)`,
            borderRadius: 999,
            background: hover ? thumbHoverColor : thumbColor,
            cursor: "pointer",
            transition: "background 120ms",
          }}
        />
      )}
    </div>
  )
}
