-- Where a running desk got stuck. Later changes belong in 006.

CREATE TABLE stalls (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL CHECK (code IN ('no_message', 'composer')),
  flow TEXT NOT NULL DEFAULT '',
  step TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX stalls_open_code_ref ON stalls(code, ref) WHERE status = 'open';
