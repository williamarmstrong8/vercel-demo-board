"use client"

import { useEffect, useRef } from "react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getBounds } from "@/lib/whiteboard/geometry"
import { getCodeTheme } from "@/lib/whiteboard/code-themes"

export function ElementEditor({ id }: { id: string }) {
  const el = useWhiteboard((s) =>
    (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements.find((e) => e.id === id),
  )
  const update = useWhiteboard((s) => s.update)
  const setEditing = useWhiteboard((s) => s.setEditing)
  const deleteEmpty = useRef(false)
  const settled = useRef(false)

  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    settled.current = false
    // focus on the next frame so it lands after the click that created the
    // element has fully settled (prevents the browser stealing focus back)
    const raf = requestAnimationFrame(() => {
      const t = textRef.current
      if (t) {
        t.focus()
        t.select()
      }
    })
    // ignore any blur that fires in the first moments after mounting
    const timer = setTimeout(() => {
      settled.current = true
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [id])

  if (!el) return null
  const b = getBounds(el)

  const commit = () => {
    setEditing(null)
    if (el.type === "text" && !(el.text || "").trim()) {
      // remove empty text element
      const store = useWhiteboard.getState()
      const els = (store.projects.find((p) => p.id === store.currentId) ?? store.projects[0]).elements.filter(
        (e) => e.id !== id,
      )
      store.select([])
      // write directly
      useWhiteboard.setState((s) => ({
        projects: s.projects.map((p) => (p.id === s.currentId ? { ...p, elements: els } : p)),
      }))
    }
  }

  if (el.type === "text") {
    return (
      <textarea
        ref={textRef}
        value={el.text || ""}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          // height is driven by the underlying TextView via useFitHeight
          update([id], { text: e.target.value })
        }}
        onBlur={() => {
          if (!settled.current) {
            // spurious early blur right after placement — keep editing
            textRef.current?.focus()
            return
          }
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            commit()
          }
          e.stopPropagation()
        }}
        style={{
          position: "absolute",
          left: b.x,
          top: b.y,
          width: b.width,
          height: b.height,
          fontSize: el.fontSize || 24,
          lineHeight: 1.3,
          color: el.stroke,
          fontFamily: "var(--font-sans)",
          fontWeight: el.bold ? 700 : 500,
          fontStyle: el.italic ? "italic" : "normal",
          textDecoration: el.underline ? "underline" : "none",
          textAlign: el.textAlign || "left",
          border: "none",
          outline: "none",
          borderRadius: 0,
          padding: 0,
          margin: 0,
          background: "transparent",
          resize: "none",
          overflow: "hidden",
          pointerEvents: "auto",
        }}
        placeholder="Type something..."
      />
    )
  }

  if (el.type === "code" || el.type === "terminal") {
    const theme = getCodeTheme(el.codeTheme)
    return (
      <div
        // While editing, keep pointer events inside the overlay so dragging to
        // select text doesn't reach the canvas surface and move the block.
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: b.x,
          top: b.y,
          width: b.width,
          height: b.height,
          borderRadius: 10,
          background: theme.bg,
          border: "2px solid #0070f3",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 12px",
            height: 34,
            background: theme.headerBg,
            borderBottom: `1px solid ${theme.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} style={{ width: 11, height: 11, borderRadius: 9999, background: c }} />
            ))}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: theme.chrome }}>
            {el.title || (el.type === "terminal" ? "bash" : "untitled")}
          </span>
        </div>
        <textarea
          ref={textRef}
          value={el.text || ""}
          spellCheck={false}
          onChange={(e) => update([id], { text: e.target.value })}
          onBlur={() => {
            if (!settled.current) {
              textRef.current?.focus()
              return
            }
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              commit()
            }
            e.stopPropagation()
          }}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            resize: "none",
            padding: "10px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            lineHeight: "20px",
            color: theme.colors.plain,
            background: "transparent",
            whiteSpace: "pre",
            overflow: "auto",
          }}
          placeholder={el.type === "terminal" ? "$ run a command..." : "// write some code..."}
        />
      </div>
    )
  }

  // card editor
  void deleteEmpty
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: b.x,
        top: b.y,
        width: b.width,
        height: b.height,
        borderRadius: el.rounded ? 12 : 2,
        background: el.fill === "transparent" ? "#ffffff" : el.fill,
        border: `2px solid #0070f3`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      <input
        ref={textRef as unknown as React.RefObject<HTMLInputElement>}
        value={el.title || ""}
        onChange={(e) => update([id], { title: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Card title"
        style={{
          border: "none",
          outline: "none",
          padding: "12px 16px 6px",
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize: 18,
          color: "#000",
          background: "transparent",
        }}
      />
      <textarea
        value={el.text || ""}
        onChange={(e) => update([id], { text: e.target.value })}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") commit()
          e.stopPropagation()
        }}
        placeholder="Add a description..."
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          resize: "none",
          padding: "0 16px 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "#444",
          background: "transparent",
        }}
      />
    </div>
  )
}
