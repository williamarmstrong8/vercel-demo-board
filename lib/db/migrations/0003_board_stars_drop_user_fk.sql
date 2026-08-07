-- The board_stars table already existed in some databases carrying a foreign key
-- from user_id to a `user` table. This app has no users table: an identity is
-- the Vercel session JWT's `sub` claim and never a row in Postgres, so every
-- star insert failed that constraint with a foreign key violation.
--
-- board_id keeps its foreign key — boards really are rows here, and a deleted
-- board should take its stars with it.
ALTER TABLE board_stars DROP CONSTRAINT IF EXISTS board_stars_user_id_user_id_fk;
