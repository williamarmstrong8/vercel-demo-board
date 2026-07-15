import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/current-user"

// The deployment is gated by Vercel Passport at the edge, so an unauthenticated
// visitor is stopped by Vercel's own sign-in screen before ever reaching this
// page. This page is the in-app affordance: if a request somehow arrives
// without an identity, we show a "Sign in with Vercel" action that re-enters
// the app root and re-triggers the edge Passport flow.
export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect("/")

  return (
    <main className="grid min-h-dvh grid-cols-1 bg-background text-foreground md:grid-cols-2">
      <section className="flex flex-col justify-between gap-12 border-b border-border p-8 md:border-b-0 md:border-r md:p-12">
        <div className="flex items-center gap-2">
          <VercelMark className="size-6" />
          <span className="text-lg font-semibold tracking-tight">Demo Board</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-pretty text-3xl font-semibold tracking-tight md:text-4xl">
            A collaborative whiteboard for the team
          </h1>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Sketch ideas, map systems, and keep every board in one place. Access is
            restricted to your Vercel team.
          </p>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Gated by Vercel Passport. Signing in adds your in-app identity so your
          boards stay tied to your account.
        </p>
      </section>

      <section className="flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Continue with your Vercel account to access your boards.
          </p>
          <a
            href="/"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <VercelMark className="size-4" />
            Sign in with Vercel
          </a>
        </div>
      </section>
    </main>
  )
}

function VercelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 76 65" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M37.59.25l36.95 64H.64l36.95-64z" />
    </svg>
  )
}
