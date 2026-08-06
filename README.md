# Canvas

## Sign in with Vercel

1. Create a [Sign in with Vercel app](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard).
2. Add `https://<your-production-domain>/api/auth/callback` as an authorization callback URL. For local development, add `http://localhost:3000/api/auth/callback` too.
3. Set these environment variables for the project:

   ```text
   NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=<Vercel app client ID>
   VERCEL_APP_CLIENT_SECRET=<Vercel app client secret>
   ```

The application uses OAuth 2.0 Authorization Code with PKCE, validates the returned OIDC ID token against Vercel's JWKS, and stores it in an HTTP-only session cookie. See the [Sign in with Vercel guide](https://vercel.com/docs/sign-in-with-vercel/getting-started).
