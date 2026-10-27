-- The master's crew ledger. One row per lane, rewritten on each review.
-- Later changes belong in 007.

CREATE TABLE agent_ledger (
  agent TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('working', 'waiting', 'stuck', 'off', 'paused')),
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  detail TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL
);
