"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { House, Users } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { VercelMark } from "@/components/vercel-mark"

type NavItem = {
  title: string
  href: string
  icon: typeof House
  // Match nested routes too (e.g. /u/:handle lives under the People section) so
  // the group stays highlighted while you're inside a profile.
  match: (pathname: string) => boolean
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Boards",
        href: "/",
        icon: House,
        match: (p) => p === "/",
      },
    ],
  },
  {
    label: "Discover",
    items: [
      {
        title: "People",
        href: "/people",
        icon: Users,
        match: (p) => p === "/people" || p.startsWith("/u/"),
      },
    ],
  },
]

// The app's primary navigation. Collapses to an icon rail (see AppShell's
// defaultOpen={false}); each button carries a tooltip so the labels are still
// reachable once collapsed.
export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <VercelMark className="size-4 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Canvas
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={item.match(pathname)}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
