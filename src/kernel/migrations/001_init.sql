-- Leadline state. Edit this file only before the first real database exists.
-- After that, add 002_something.sql. Do not change a migration that already ran.

CREATE TABLE business (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  one_liner TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL DEFAULT '',
  proof TEXT NOT NULL DEFAULT '',
  price_band TEXT NOT NULL DEFAULT '',
  geos TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  do_not_contact TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE site_pages (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL
);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL COLLATE NOCASE UNIQUE,
  answer TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('person', 'agent')),
  created_at TEXT NOT NULL
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  created_at TEXT NOT NULL
);

CREATE TABLE channel_permissions (
  channel TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'draft', 'approve', 'auto')),
  daily_cap INTEGER NOT NULL CHECK (daily_cap >= 0 AND daily_cap <= 200),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'done')),
  offer_summary TEXT NOT NULL DEFAULT '',
  icp_summary TEXT NOT NULL DEFAULT '',
  followup_days INTEGER NOT NULL DEFAULT 4 CHECK (followup_days BETWEEN 1 AND 30),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE campaign_channels (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  channel TEXT NOT NULL,
  PRIMARY KEY (campaign_id, channel)
);

CREATE TABLE leads (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  fit TEXT NOT NULL DEFAULT 'unreviewed' CHECK (fit IN ('unreviewed', 'yes', 'no', 'maybe')),
  fit_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'skipped', 'queued', 'contacted', 'replied', 'won', 'lost')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX leads_source_url ON leads(source, source_url);
CREATE INDEX leads_email_idx ON leads(email);
CREATE INDEX leads_fit_idx ON leads(fit, status);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  channel TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('first', 'followup')),
  parent_id INTEGER REFERENCES messages(id),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'sent', 'failed', 'cancelled')),
  due_at TEXT,
  sent_at TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX messages_status_idx ON messages(status, updated_at);
CREATE INDEX messages_lead_idx ON messages(lead_id, channel, kind);

CREATE TABLE content_drafts (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  channel TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('idea', 'draft', 'approved', 'published', 'killed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  team TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);

CREATE TABLE browser_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'down',
  port INTEGER NOT NULL DEFAULT 9333,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  blocker TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE encounters (
  id INTEGER PRIMARY KEY,
  site TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('captcha', 'login', 'stuck', 'error')),
  detail TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  screenshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE path_nodes (
  site TEXT NOT NULL,
  node_key TEXT NOT NULL,
  see TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (site, node_key)
);

CREATE TABLE path_branches (
  id INTEGER PRIMARY KEY,
  site TEXT NOT NULL,
  from_node TEXT NOT NULL,
  choice TEXT NOT NULL,
  to_node TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK (outcome IN ('reached', 'success', 'stop', 'refused', 'retry')),
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (site, from_node, choice)
);

CREATE TABLE flow_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  flow TEXT NOT NULL,
  step TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE leads_fts USING fts5(
  name,
  company,
  role,
  snippet,
  content='leads',
  content_rowid='id'
);

CREATE TRIGGER leads_ai AFTER INSERT ON leads BEGIN
  INSERT INTO leads_fts(rowid, name, company, role, snippet)
  VALUES (new.id, new.name, new.company, new.role, new.snippet);
END;

CREATE TRIGGER leads_ad AFTER DELETE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, name, company, role, snippet)
  VALUES ('delete', old.id, old.name, old.company, old.role, old.snippet);
END;

CREATE TRIGGER leads_au AFTER UPDATE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, name, company, role, snippet)
  VALUES ('delete', old.id, old.name, old.company, old.role, old.snippet);
  INSERT INTO leads_fts(rowid, name, company, role, snippet)
  VALUES (new.id, new.name, new.company, new.role, new.snippet);
END;
