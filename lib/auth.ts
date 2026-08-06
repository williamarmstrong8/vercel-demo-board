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

  return {
    id: payload.sub,
    name: typeof payload.name === "string" ? payload.name : null,
    email: typeof payload.email === "string" ? payload.email : null,
    username: typeof payload.preferred_username === "string" ? payload.preferred_username : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
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
