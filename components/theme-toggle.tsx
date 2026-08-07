"use client"

import { cn } from "@/lib/utils"
import { useSiteTheme } from "@/components/site-theme"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useSiteTheme()
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode"

  return (
    <AnimatedThemeToggler
      theme={theme}
      onThemeChange={() => toggleTheme()}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
        className,
      )}
    />
  )
}
