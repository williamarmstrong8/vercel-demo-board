import { redirect } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { PeopleDirectory } from "@/components/people/people-directory"
import { getCurrentUser } from "@/lib/auth"
import { listPeople, upsertUser } from "@/lib/users/service"

export default async function PeoplePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/signin")

  // Same as the dashboard: keep the viewer's own directory entry current on the
  // way in, so they can always find themselves here. Best-effort.
  await upsertUser(user).catch((error) => {
    console.error("Failed to sync user profile", error)
  })

  const people = await listPeople()

  return (
    <AppShell user={{ displayName: user.displayName, email: user.email }} title="People">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <section className="mb-8">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">People</h1>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Everyone on Canvas, sorted by how many boards they've shared. Open a profile to browse
            the boards they've made public.
          </p>
        </section>

        <PeopleDirectory people={people} />
      </div>
    </AppShell>
  )
}
