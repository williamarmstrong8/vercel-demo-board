"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { signIn } from "@/lib/auth-client"

export function AuthForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSignIn() {
    setError(null)
    setPending(true)
    try {
      // Kicks off the OAuth redirect to Vercel; on return, Better Auth sets the
      // session cookie and lands the user on "/".
      const { error } = await signIn.oauth2({
        providerId: "vercel",
        callbackURL: "/",
      })
      if (error) throw new Error(error.message ?? "Could not start sign in")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <svg
          viewBox="0 0 76 65"
          fill="currentColor"
          className="mb-4 size-7 text-foreground"
          aria-hidden="true"
        >
          <path d="M37.59.25l36.95 64H.64l36.95-64z" />
        </svg>
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Canvas</h1>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          Use your Vercel account to continue.
        </p>
      </div>

      <button
        type="button"
        onClick={onSignIn}
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <svg viewBox="0 0 76 65" fill="currentColor" className="size-4" aria-hidden="true">
            <path d="M37.59.25l36.95 64H.64l36.95-64z" />
          </svg>
        )}
        Sign in with Vercel
      </button>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        Access is restricted to approved Vercel accounts.
      </p>
    </div>
  )
}
