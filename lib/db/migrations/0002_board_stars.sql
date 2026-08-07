-- A star is one user's endorsement of one public board. The composite primary
-- key makes starring idempotent and lets a user remove only their own star.
CREATE TABLE IF NOT EXISTS board_stars (
  board_id text NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS board_stars_user_idx ON board_stars (user_id);
