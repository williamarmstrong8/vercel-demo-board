import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { cookies } from "next/headers"

export const SESSION_COOKIE = "vercel_id_token"

const jwks = createRemoteJWKSet(new URL("https://vercel.com/.well-known/jwks"))

type VercelIdentity = {
  id: string
  name: string | null
  email: string | null
  username: string | null
  picture: string | null
  displayName: string
}

// Vercel only sends `name` when the account has a display name set, so fall back
// to the email's local part: "ada.lovelace@example.com" reads as "Ada Lovelace".
// This is a guess at how the address is meant to be written, not a real name, so
// it stays behind the claims Vercel actually vouches for.
function nameFromEmail(email: string | null) {
  const local = email?.split("@")[0]?.split("+")[0]
  if (!local) return null

  const words = local
    .split(/[._-]+/)
    .filter((part) => part.length > 0 && !/^\d+$/.test(part))
    .map((part) => part[0].toUpperCase() + part.slice(1))

  return words.length > 0 ? words.join(" ") : null
}

function clientId() {
  const value = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
  if (!value) throw new Error("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID is not configured")
  return value
}

export async function verifyIdToken(idToken: string, nonce?: string) {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: "https://vercel.com",
    audience: clientId(),
  })

  if (nonce && payload.nonce !== nonce) throw new Error("Invalid OAuth nonce")

  return payload
}

function toIdentity(payload: JWTPayload): VercelIdentity | null {
  if (!payload.sub) return null

  const name = typeof payload.name === "string" ? payload.name : null
  const email = typeof payload.email === "string" ? payload.email : null
  const username = typeof payload.preferred_username === "string" ? payload.preferred_username : null

  return {
    id: payload.sub,
    name,
    email,
    username,
    picture: typeof payload.picture === "string" ? payload.picture : null,
    displayName: name ?? nameFromEmail(email) ?? username ?? email ?? "Vercel user",
  }
}

export async function getCurrentUser(): Promise<VercelIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    return toIdentity(await verifyIdToken(token))
  } catch {
    return null
  }
}
