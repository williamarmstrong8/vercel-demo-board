"use client"

import { useEffect } from "react"

// Where Vercel Connect returns the user after they grant Notion access. This
// runs inside the popup the builder opened: it notifies the opener so the chat
// can re-check its connection status, then closes itself.
export default function ConnectionCallbackPage() {
  useEffect(() => {
    try {
      window.opener?.postMessage({ type: "vercel-connect", provider: "notion" }, window.location.origin)
    } catch {
      // opener may be gone or cross-origin — the manual "you can close this" copy covers it.
    }
    const t = setTimeout(() => window.close(), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <main className="light flex min-h-dvh items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm font-medium">Notion connected</p>
        <p className="text-xs text-muted-foreground">You can close this window.</p>
      </div>
    </main>
  )
}
