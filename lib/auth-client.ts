"use client"

import { createAuthClient } from "better-auth/react"

// Client-side Better Auth handle. Used by the auth form to sign in / sign up and
// by the header user menu to read the current session and sign out.
export const authClient = createAuthClient()

export const { useSession, signIn, signUp, signOut } = authClient
