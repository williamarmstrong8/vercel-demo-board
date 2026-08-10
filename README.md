# Canvas

## Sign in with Vercel

1. Create a [Sign in with Vercel app](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard).
2. Add `https://<your-production-domain>/api/auth/callback` as an authorization callback URL. For local development, add `http://localhost:3000/api/auth/callback` too.
3. Under **Manage → Permissions**, enable `openid`, `profile`, `email`, and `offline_access`. The header renders the signed-in user's name, username, and email, and those claims only reach the ID token when the matching scope is enabled; `offline_access` is what makes sessions last longer than an hour (see below). Requesting a scope that is disabled there fails sign in with `invalid_scope`.
4. Set these environment variables for the project:

   ```text
   NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=<Vercel app client ID>
   VERCEL_APP_CLIENT_SECRET=<Vercel app client secret>
   ```

   Set `VERCEL_APP_OAUTH_SCOPE` to override the requested scopes (defaults to `openid profile email offline_access`).

The application uses OAuth 2.0 Authorization Code with PKCE, validates the returned OIDC ID token against Vercel's JWKS, and stores it in an HTTP-only session cookie. See the [Sign in with Vercel guide](https://vercel.com/docs/sign-in-with-vercel/getting-started).

### Bypassing sign in locally

Setting up a Sign in with Vercel app just to run the project on `localhost` is a lot of ceremony, so set `DEV_BYPASS_AUTH=1` in `.env.local` to skip it: `proxy.ts` lets every request through and `getCurrentUser()` returns a fixed fake identity (`dev-local-user`) instead of reading the session cookie. It only takes effect when `NODE_ENV !== "production"`, so it can't accidentally ship enabled. Boards created this way are owned by that fake user like any other account.

### Session length

The session *is* the ID token, and Vercel issues those with a one-hour expiry. `offline_access` also gets a refresh token, which lasts 30 days and rotates every time it's used, so `proxy.ts` trades it for a new ID token once the current one is within ten minutes of expiring. The renewal happens inside the request that noticed, so nobody sees a redirect — in practice a session lasts 30 days, and longer than that if it's still being used when the refresh token rotates.

Two consequences worth knowing:

- Signing out revokes the refresh token with Vercel rather than only dropping the cookies, since a cookie deleted from one browser wouldn't stop anyone else holding a copy from minting fresh ID tokens for the next 30 days.
- Without `offline_access` there's no refresh token, sign in still works, and sessions quietly go back to lasting an hour. The callback logs a warning when Vercel returns no refresh token, because there's no other outward sign of it.

## Board ownership

The whole site is behind sign in — `proxy.ts` redirects anyone without a session to `/signin`, preserving where they were headed so a shared board link survives the detour. That check only reads the token's expiry to decide whether to renew or redirect, which keeps it cheap; the pages and route handlers behind it verify the token for real, so an expired or forged cookie still reads as signed out.

Every board belongs to the Vercel account that created it, and starts private:

- **Private** — only the owner can open it. To everyone else it 404s, so a board's existence is never leaked.
- **Public** — any signed-in user can open and read it. Editing, renaming, publishing and deleting stay with the owner alone; other viewers get the canvas in read-only mode with no toolbar.

The dashboard shows this as two grids: **Your boards** (yours, private and public alike) and **Shared boards** (everyone else's public ones). Use the ⋯ menu on a board you own to make it public or private again.

Access control lives in `lib/boards/service.ts`, which resolves the viewer from the session cookie itself rather than trusting an id from the caller, so the Server Actions and the `/api/boards/flush` and `/api/ai/build-board` routes are all covered by the same rules.

## Database

The schema in `lib/db/schema.ts` is hand-kept, and `lib/db/migrations/*.sql` is what actually changes the database:

```bash
pnpm db:migrate   # apply any migrations that haven't run yet (tracked in _migrations)
pnpm db:claim     # one-off: reassign pre-ownership 'anonymous' boards to a real account
```
