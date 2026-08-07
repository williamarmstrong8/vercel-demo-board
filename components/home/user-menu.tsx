"use client"

import { useEffect, useRef, useState } from "react"
import { LogOut } from "lucide-react"
import { UserAvatar } from "@/components/user-avatar"

export function UserMenu({
  displayName,
  email,
  picture,
}: {
  displayName: string
  email: string | null
  picture: string | null
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
        className="flex rounded-full transition-opacity hover:opacity-90 data-[open=true]:opacity-90"
      >
        <UserAvatar name={displayName} src={picture} className="size-8 text-xs" />
      </button>

      {open && (
        <div className="dark absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <UserAvatar name={displayName} src={picture} className="size-8 text-xs" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{displayName}</div>
              {email && email !== displayName && (
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              )}
            </div>
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
