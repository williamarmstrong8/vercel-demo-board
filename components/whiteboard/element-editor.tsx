"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useWhiteboard } from "@/lib/whiteboard/store"
import { getBounds } from "@/lib/whiteboard/geometry"
import { getCodeTheme } from "@/lib/whiteboard/code-themes"
import { CARD } from "@/lib/whiteboard/board-design"
import { fontStack } from "@/lib/whiteboard/fonts"
import { themeFilterFor } from "@/lib/whiteboard/theme-filter"
import { useSiteTheme } from "@/components/site-theme"

export function ElementEditor({ id }: { id: string }) {
  const el = useWhiteboard((s) =>
    (s.projects.find((p) => p.id === s.currentId) ?? s.projects[0]).elements.find((e) => e.id === id),
  )
  const update = useWhiteboard((s) => s.update)
  const setEditing = useWhiteboard((s) => s.setEditing)
  // Same recolour the canvas view applies (see CanvasElementView). Without it
  // the text would jump from white to black the instant editing starts.
  const { theme } = useSiteTheme()
  const settled = useRef(false)

  const textRef = useRef<HTMLTextAreaElement>(null)
  // The card body textarea, so Enter in the title can jump straight to it.
  const bodyRef = useRef<HTMLTextAreaElement>(null)

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

  // Grow the textarea to fit its content synchronously, in the same paint as
  // the keystroke. The box otherwise relied on the hidden static TextView's
  // ResizeObserver (canvas-element.tsx's useFitHeight) to notice the new line
  // and write the height back a frame later — while that round trip was in
  // flight, the fixed-height + overflow:hidden textarea would scroll its
  // caret into view and clip the lines above it, reading as text vanishing.
  useLayoutEffect(() => {
    if (!el || el.type !== "text") return
    const t = textRef.current
    if (!t) return
    t.style.height = "auto"
    const minH = Math.round((el.fontSize || 24) * 1.3)
    const next = Math.max(minH, Math.ceil(t.scrollHeight))
    t.style.height = `${next}px`
    if (Math.abs(next - el.height) > 1) {
      update([id], { height: next })
    }
  }, [el, id, update])

  // Grow the card's title + description textareas to fit their content (each at
  // least one line, so an empty card still shows the placeholder line and a long
  // title wraps). The card editor then hugs its content with no extra padding.
  useLayoutEffect(() => {
    if (!el || el.type !== "card") return
    const grow = (t: HTMLTextAreaElement | null, minH: number) => {
      if (!t) return
      t.style.height = "auto"
      t.style.height = `${Math.max(minH, Math.ceil(t.scrollHeight))}px`
    }
    // title: one line at its font size + top/bottom padding (12 + 8)
    grow(textRef.current, Math.round((el.fontSize ?? CARD.titleSize) * 1.34) + 20)
    // description: one line at the body size + bottom padding (14)
    grow(bodyRef.current, Math.round((el.bodyFontSize ?? CARD.bodySize) * 1.5) + 14)
  }, [el, id])

  if (!el) return null
  const b = getBounds(el)

  // Deleting an empty text block lives in the store's setEditing itself (see
  // store.ts) so every way of leaving edit mode — blurring this editor,
  // Escape, clicking empty canvas, starting a new block — gets the same
  // cleanup instead of only the path that happens to call commit().
  const commit = () => setEditing(null)

  if (el.type === "text") {
    return (
      <textarea
        ref={textRef}
        value={el.text || ""}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => update([id], { text: e.target.value })}
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
          fontFamily: fontStack(el.fontFamily),
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
          filter: themeFilterFor("text", theme),
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
          boxShadow: "none",
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
          className="wb-scroll-native"
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
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: b.x,
        top: b.y,
        width: b.width,
        // Hug the content: title + a description field that's one line when
        // empty and grows as you type (see the auto-grow effect above).
        height: "auto",
        borderRadius: el.rounded ? 12 : 2,
        background: el.fill === "transparent" ? "#ffffff" : el.fill,
        // Draw the focus ring with an inset shadow (not a border) so it doesn't
        // inset the content — a border would shift the text 2px when editing.
        boxShadow: "inset 0 0 0 2px #0070f3",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pointerEvents: "auto",
        filter: themeFilterFor("card", theme),
      }}
    >
      <textarea
        ref={textRef}
        className="wb-scroll-native"
        value={el.title || ""}
        rows={1}
        onChange={(e) => update([id], { title: e.target.value })}
        onKeyDown={(e) => {
          // Enter moves focus to the description (no newline in the title), so
          // you can type it right after naming the card.
          if (e.key === "Enter") {
            e.preventDefault()
            bodyRef.current?.focus()
          }
          e.stopPropagation()
        }}
        placeholder="Card title"
        style={{
          // A textarea (not input) so a long title wraps to multiple lines just
          // like CardView's static title div, instead of scrolling sideways.
          overflow: "hidden",
          resize: "none",
          border: "none",
          outline: "none",
          // padding + font + line-height + wrapping match CardView's title div
          // exactly — any mismatch reads as the text jumping when edit starts
          padding: "12px 16px 8px",
          fontFamily: fontStack(el.fontFamily),
          fontWeight: 600,
          fontSize: el.fontSize ?? CARD.titleSize,
          lineHeight: 1.34,
          color: "#000",
          background: "transparent",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      />
      <textarea
        ref={bodyRef}
        className="wb-scroll-native"
        value={el.text || ""}
        onChange={(e) => update([id], { text: e.target.value })}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") commit()
          e.stopPropagation()
        }}
        placeholder="Add a description..."
        style={{
          // Height is driven by the auto-grow effect so the box hugs the text.
          overflow: "hidden",
          border: "none",
          outline: "none",
          resize: "none",
          padding: "0 16px 14px",
          fontFamily: fontStack(el.fontFamily),
          // Must match CardView's body size exactly — this textarea sits directly
          // on top of the view it replaces, so any disagreement shows up as the
          // text jumping the moment you start or stop typing, and as a wrong
          // auto-height, since the card measures whichever one is mounted.
          fontSize: el.bodyFontSize ?? CARD.bodySize,
          lineHeight: 1.5,
          color: "#444",
          background: "transparent",
        }}
      />
    </div>
  )
}
