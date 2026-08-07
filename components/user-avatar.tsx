"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// First + last initial from a display name ("Ada Lovelace" -> "AL"). Names
// without a space (a bare username or email local-part) fall back to the
// first two characters so the avatar is never left with just one letter.
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// A person's picture, with their initials as the fallback. `src` is absent for
// anyone whose Vercel account has no avatar, and for boards created before the
// avatar was recorded — and it can still 404 later, which is what onError
// covers. Size and type scale come from the caller's className.
export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground font-semibold leading-none text-background",
        className,
      )}
      aria-hidden="true"
    >
      {src && !failed ? (
        // A plain img: these are remote avatars on hosts next/image would need
        // configuring for, and they're already the exact size we render.
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </span>
  )
}
