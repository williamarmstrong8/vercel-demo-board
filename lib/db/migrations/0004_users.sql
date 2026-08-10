-- A `users` table finally lands, but only as a cache of the Vercel session JWT,
-- never as the source of truth for who someone is (that stays the verified
-- token — see lib/auth.ts). It exists so the People directory and profile pages
-- can list and render a person who isn't the one currently signed in, which the
-- JWT alone can't do.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text,
  name text,
  display_name text NOT NULL DEFAULT 'Vercel user',
  email text,
  picture text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);

-- Backfill from board owners so the directory isn't empty for accounts that
-- authored boards before this table existed. `author_name` is the only thing
-- Postgres knows about them; username/email/picture fill in when they next sign
-- in and the upsert runs. The legacy `anonymous` owner matches no real identity,
-- so it never becomes a person.
INSERT INTO users (id, display_name)
SELECT owner_id, COALESCE(NULLIF(MAX(author_name), ''), 'Vercel user')
FROM boards
WHERE owner_id <> 'anonymous'
GROUP BY owner_id
ON CONFLICT (id) DO NOTHING;
