"use client"

import { useEffect, useRef, useState } from "react"
import { LogOut } from "lucide-react"

// First + last initial from a display name ("Ada Lovelace" -> "AL"). Names
// without a space (a bare username or email local-part) fall back to the
// first two characters so the avatar is never left with just one letter.
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function UserMenu({
  displayName,
  email,
}: {
  displayName: string
  email: string | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        data-open={open}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background transition-opacity hover:opacity-90 data-[open=true]:opacity-90"
      >
        {getInitials(displayName)}
      </button>

      {open && (
        <div className="dark absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{displayName}</div>
            {email && email !== displayName && (
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            )}
          </div>
          <div className="h-px bg-border" />
          {/* The only way to end a session now that the header no longer has a
              standalone sign-out button — see /api/auth/signout. */}
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
