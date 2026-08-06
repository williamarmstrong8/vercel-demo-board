# Canvas

## Sign in with Vercel

1. Create a [Sign in with Vercel app](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard).
2. Add `https://<your-production-domain>/api/auth/callback` as an authorization callback URL. For local development, add `http://localhost:3000/api/auth/callback` too.
3. Under **Manage → Permissions**, enable `openid`, `profile`, and `email`. The header renders the signed-in user's name, username, and email, and those claims only reach the ID token when the matching scope is enabled. Requesting a scope that is disabled there fails sign in with `invalid_scope`.
4. Set these environment variables for the project:

   ```text
   NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=<Vercel app client ID>
   VERCEL_APP_CLIENT_SECRET=<Vercel app client secret>
   ```

   Set `VERCEL_APP_OAUTH_SCOPE` to override the requested scopes (defaults to `openid profile email`).

The application uses OAuth 2.0 Authorization Code with PKCE, validates the returned OIDC ID token against Vercel's JWKS, and stores it in an HTTP-only session cookie. See the [Sign in with Vercel guide](https://vercel.com/docs/sign-in-with-vercel/getting-started).

## Board ownership

The whole site is behind sign in — `proxy.ts` redirects anyone without a session to `/signin`, preserving where they were headed so a shared board link survives the detour. That check is only a cookie-presence test to keep it cheap; the pages and route handlers behind it verify the token for real, so an expired or forged cookie still reads as signed out.

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
