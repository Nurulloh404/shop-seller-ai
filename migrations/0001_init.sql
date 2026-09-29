-- Do'kon AI sotuvchi: asosiy sxema
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  price INTEGER NOT NULL,
  category TEXT NOT NULL,
  alt_product_id TEXT,
  is_out INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 5,
  sold_today INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  telegram_id INTEGER PRIMARY KEY,
  name TEXT,
  username TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS carts (
  customer_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reminded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  items TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  address TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  seller_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting',
  reminded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  send_at TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  chats INTEGER NOT NULL DEFAULT 0,
  buyers INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS seen_today (
  date TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  PRIMARY KEY (date, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id, id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(sent, send_at);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_confirmations(status);
