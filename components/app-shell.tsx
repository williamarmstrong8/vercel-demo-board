"use client"

import { SiteThemeProvider } from "@/components/site-theme"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserMenu } from "@/components/home/user-menu"
import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

// The chrome shared by every signed-in page — the dashboard, the People
// directory, and profiles — so each one gets the same collapsible sidebar and
// top bar instead of rebuilding it. The board *editor* deliberately doesn't use
// this: it's a full-bleed canvas with its own permanently-dark tool chrome (see
// components/site-theme.tsx), not a page in this navigation.
//
// `actions` is the page-specific cluster in the top bar (e.g. the dashboard's
// "New board"); the theme toggle and account menu are common to all pages and
// live here. Wrapping in SiteThemeProvider keeps the light/dark preference — and
// the sidebar's own theming — consistent with the rest of the app.
export function AppShell({
  user,
  title,
  actions,
  children,
}: {
  user: { displayName: string; email: string | null }
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <SiteThemeProvider>
      {/* Collapsed to the icon rail by default, per the brief — the dashboard is
          the star, and the sidebar is there when you reach for it. */}
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="bg-background text-foreground">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              {title && (
                <>
                  <span aria-hidden className="text-border">
                    /
                  </span>
                  <div className="min-w-0 truncate text-sm font-semibold tracking-tight">
                    {title}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <ThemeToggle />
              <UserMenu displayName={user.displayName} email={user.email} />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SiteThemeProvider>
  )
}
