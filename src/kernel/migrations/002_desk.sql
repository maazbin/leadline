-- Desk switches, lane permissions, and the platform playbook.
-- Applied once. Later changes belong in 003.

CREATE TABLE desk_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  running INTEGER NOT NULL DEFAULT 0 CHECK (running IN (0, 1)),
  full_power INTEGER NOT NULL DEFAULT 0 CHECK (full_power IN (0, 1)),
  adaptability INTEGER NOT NULL DEFAULT 1 CHECK (adaptability IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_permissions (
  agent TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'draft', 'approve', 'auto')),
  updated_at TEXT NOT NULL
);

CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  when_text TEXT NOT NULL,
  step TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'open' CHECK (result IN ('open', 'worked', 'failed')),
  evidence TEXT NOT NULL DEFAULT '',
  human_verdict TEXT NOT NULL DEFAULT '' CHECK (human_verdict IN ('', 'try', 'wrong')),
  human_note TEXT NOT NULL DEFAULT '',
  tries INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
