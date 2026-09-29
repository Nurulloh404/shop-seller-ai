-- Diagnostika jurnali: webhook va xatolarni bazaga yozadi
CREATE TABLE IF NOT EXISTS debug_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  stage TEXT NOT NULL,
  detail TEXT
);
