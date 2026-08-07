"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "canvas-home-theme"

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)

export function useSiteTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useSiteTheme must be used within SiteThemeProvider")
  return ctx
}

// useLayoutEffect is a no-op (with a console warning) during SSR, since there's
// no DOM to measure or mutate yet — fall back to useEffect there. This is the
// standard "isomorphic layout effect" shim (the same one Redux and next-themes
// use) for effects that must run on the client but are declared in code that
// also renders on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

// Dark mode is scoped to wherever this wraps — the home page's board gallery,
// and the board editor's own chrome (Component Library, properties panel,
// zoom controls, canvas) — rather than the whole app: the sign-in screen is a
// fixed black splash, and the editor's toolbar/top bar are permanently dark
// tool chrome, like Figma's, not meant to flip. Both places share the same
// localStorage key, so the preference carries over between them, but each
// mounts its own provider around its own root element instead of one global
// <html>-level toggle (see app/layout.tsx's hardcoded `dark` class).
export function SiteThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")

  // A layout effect (rather than a plain effect) applies a saved preference
  // before the browser paints the hydrated frame, so there's no visible flash
  // of light before it flips to dark. React 19 won't run a raw <script> tag
  // for this (it warns and never executes it on the client), so this is the
  // supported way to beat first paint without reaching for next-themes.
  useIsomorphicLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === "light" || stored === "dark") {
        setTheme(stored)
        return
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark")
    } catch {
      // localStorage can throw in locked-down environments — default stands.
    }
  }, [])

  // The board preview thumbnails on the home page are same-origin <iframe>s,
  // each mounting their own provider instance — so toggling the theme in the
  // parent page writes localStorage, but that iframe's own React state never
  // hears about it on its own. The "storage" event is the browser's built-in
  // fix for exactly this: it fires on every OTHER same-origin document (other
  // tabs, other frames) whenever localStorage changes, just never on the
  // document that made the write — which is also why the home page's own
  // toggle (in the same document as the write) still just uses local state.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      if (event.newValue === "light" || event.newValue === "dark") setTheme(event.newValue)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const toggleTheme = () => {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light"
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore — the toggle still works for this session
      }
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {/* `contents` keeps this element out of layout entirely — it exists only
          to put the "light"/"dark" class somewhere CSS variables can cascade
          from, so callers' own root element (their <main>, sized and
          backgrounded however they like) can sit right underneath it.
          suppressHydrationWarning: the layout effect above can flip the class
          to "dark" before the hydrated frame paints, which would otherwise
          mismatch the server-rendered "light" className. */}
      <div suppressHydrationWarning className={`contents ${theme}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
