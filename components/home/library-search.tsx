"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"

export function LibrarySearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(initialQuery)
  const [pending, startTransition] = useTransition()
  const firstRender = useRef(true)

  // Debounce navigation so the library re-queries as the user types without a
  // request per keystroke.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (value.trim()) params.set("q", value.trim())
      const qs = params.toString()
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      })
    }, 300)
    return () => clearTimeout(t)
  }, [value, pathname, router])

  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the library…"
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none transition-colors focus:border-foreground"
        aria-label="Search public boards"
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          onClick={() => setValue("")}
          className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
