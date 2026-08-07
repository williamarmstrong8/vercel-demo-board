-- The shared boards grid credits an author by name; this lets it show their
-- face too. Denormalized at creation time for the same reason author_name is:
-- there is no users table to join against, identity lives in the session JWT.
--
-- Boards created before this column stay null and fall back to initials.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS author_avatar text;
