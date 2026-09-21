-- Throttle progress/collaborator update emails (one per recipient per tree per kind per 24h).

CREATE TABLE IF NOT EXISTS tree_update_notices (
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notice_kind TEXT NOT NULL CHECK (notice_kind IN ('progress_update', 'collaborator_update')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tree_id, recipient_user_id, notice_kind)
);

CREATE INDEX IF NOT EXISTS idx_tree_update_notices_sent_at ON tree_update_notices(sent_at);
