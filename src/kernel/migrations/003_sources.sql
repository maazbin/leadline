-- Materials the person hands over instead of typing the whole setup form.
-- A PDF, their website, or their own social profile. Social rows stay unread
-- until the Leadline Chrome is signed in to that account.

CREATE TABLE profile_sources (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'social', 'website')),
  platform TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('saved', 'read', 'needs_login', 'no_text', 'failed')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX profile_sources_url ON profile_sources(url) WHERE url <> '';
