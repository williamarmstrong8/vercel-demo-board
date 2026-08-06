-- Board ownership and visibility.
--
-- Every board belongs to the Vercel identity that created it (`owner_id` holds
-- the OAuth `sub` claim) and starts private. Making a board public is what puts
-- it in the shared section of the dashboard for everyone else to read.
--
-- Written to be re-runnable: the columns and single-column indexes already
-- existed unused on some databases, so everything here is IF NOT EXISTS.

ALTER TABLE boards ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'anonymous';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS author_name text;

CREATE INDEX IF NOT EXISTS boards_owner_id_idx ON boards (owner_id);
CREATE INDEX IF NOT EXISTS boards_is_public_idx ON boards (is_public);

-- The dashboard runs exactly two list queries, both sorted newest-first. These
-- composite indexes let each one be served without a sort.
CREATE INDEX IF NOT EXISTS boards_owner_updated_idx ON boards (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS boards_public_updated_idx ON boards (is_public, updated_at DESC)
  WHERE is_public;
