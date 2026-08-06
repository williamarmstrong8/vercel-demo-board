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
