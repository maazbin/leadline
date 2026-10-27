-- One editable plan per local day. Later changes belong in 005.

CREATE TABLE day_plans (
  day TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE day_plan_items (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  body TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX day_plan_items_day ON day_plan_items(day, sort_order, id);
