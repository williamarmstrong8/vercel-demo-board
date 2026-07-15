"use client"

import { createAuthClient } from "better-auth/react"
import { genericOAuthClient } from "better-auth/client/plugins"

// Client-side Better Auth handle. The generic OAuth client exposes
// signIn.oauth2({ providerId }) used by the "Sign in with Vercel" button, and
// the user menu reads the session and signs out.
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
})

export const { useSession, signIn, signOut } = authClient
