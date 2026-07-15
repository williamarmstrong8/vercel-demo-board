"use client"

import { createAuthClient } from "better-auth/react"

// Client-side Better Auth handle. Used by the header user menu to read the
// current session (`useSession`) and sign out.
export const authClient = createAuthClient()

export const { useSession, signOut } = authClient
