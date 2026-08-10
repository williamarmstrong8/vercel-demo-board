import { cn } from "@/lib/utils"

// First + last initial from a display name ("Ada Lovelace" -> "AL"); a
// single-word name (a bare username or email local-part) falls back to its
// first two characters so an avatar is never left with a lone letter. Mirrors
// the account menu's own initials (components/home/user-menu.tsx).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// A person's avatar: their Vercel picture when we have one, otherwise their
// initials on a solid chip. A plain <img> rather than next/image — avatars come
// from arbitrary Vercel URLs, and wiring remote patterns into next.config for a
// 40px thumbnail isn't worth it. No "use client": this renders fine in both the
// server-rendered profile header and the client-side directory.
export function PersonAvatar({
  name,
  picture,
  className,
}: {
  name: string
  picture: string | null
  className?: string
}) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background",
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
