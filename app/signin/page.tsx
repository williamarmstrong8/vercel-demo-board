import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { safeReturnTo } from "@/lib/session"
import { VercelMark } from "@/components/vercel-mark"

export const metadata: Metadata = {
  title: "Sign in — Canvas",
}

// Each of these is fixed somewhere different, so name the cause rather than
// sending everyone back through the same failing button.
const AUTH_ERRORS: Record<string, string> = {
  invalid_scope: "This app is not allowed to request one of the sign in scopes.",
  access_denied: "Sign in was cancelled.",
  not_configured: "Sign in is not configured on this deployment.",
  handshake_expired: "Sign in took too long. Please try again.",
  token_exchange_failed: "Vercel rejected this app's credentials.",
  missing_id_token: "Vercel did not return an identity token.",
  sign_in_failed: "Sign in did not complete. Please try again.",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string; next?: string }>
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams])

  // Nothing to do here with a valid session — this also covers the back button
  // landing on /signin after signing in.
  const returnTo = safeReturnTo(params.next)
  if (user) redirect(returnTo ?? "/")

  // Carried through the OAuth round trip so a shared board link survives the
  // detour through sign in.
  const authorizeUrl = returnTo
    ? `/api/auth/authorize?next=${encodeURIComponent(returnTo)}`
    : "/api/auth/authorize"

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
      {/* A single soft glow behind the mark, and a hairline grid that fades out
          well before the edges — enough depth that the page doesn't read as an
          unstyled black rectangle, without competing with the button. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-[65%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,black,transparent)]"
      />

      <div className="relative w-full max-w-[320px]">
        <div className="flex flex-col items-center text-center">
          <VercelMark className="size-7 text-white" />
          <h1 className="mt-7 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            Sign in to Canvas
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            An infinite whiteboard for architectures, flows, and demos.
          </p>
        </div>

        {params.auth_error && (
          <p
            role="alert"
            className="mt-7 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-center text-[13px] leading-relaxed text-red-300"
          >
            {AUTH_ERRORS[params.auth_error] ?? "Sign in did not complete. Please try again."}
          </p>
        )}

        <a
          href={authorizeUrl}
          className="mt-7 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white text-sm font-medium text-black transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <VercelMark className="size-3.5" />
          Sign in with Vercel
        </a>

        <p className="mt-6 text-center text-xs leading-relaxed text-neutral-600">
          Boards you create are private to your account until you share them.
        </p>
      </div>
    </main>
  )
}
