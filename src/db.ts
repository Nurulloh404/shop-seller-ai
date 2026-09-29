import { sqlUtc, tkDate, tkDayStartUtc } from "./util";

export interface ProductRow {
  id: string;
  name: string;
  aliases: string;
  price: number;
  category: string;
  alt_product_id: string | null;
  is_out: number;
  daily_limit: number;
  sold_today: number;
  active: number;
  info: string | null;
}

export interface Product extends Omit<ProductRow, "aliases"> {
  aliases: string[];
}

export interface CartLine {
  product_id: string;
  qty: number;
  name: string;
  price: number;
  category: string;
}

export interface OrderRow {
  id: number;
  customer_id: number;
  items: string;
  subtotal: number;
  delivery: number;
  total: number;
  status: string;
  address: string | null;
  phone: string | null;
  created_at: string;
}

export interface PendingRow {
  id: number;
  customer_id: number;
  product_id: string;
  qty: number;
  seller_message_id: number | null;
  status: string;
  reminded: number;
  created_at: string;
}

function toProduct(r: ProductRow): Product {
  let aliases: string[] = [];
  try {
    aliases = JSON.parse(r.aliases);
  } catch {
    aliases = [];
  }
  return { ...r, aliases };
}

// ---------- tovarlar ----------

export async function listProducts(db: D1Database, includeInactive = false): Promise<Product[]> {
  const sql = includeInactive
    ? "SELECT * FROM products ORDER BY category, name"
    : "SELECT * FROM products WHERE active = 1 ORDER BY category, name";
  const { results } = await db.prepare(sql).all<ProductRow>();
  return results.map(toProduct);
}

export async function getProduct(db: D1Database, id: string): Promise<Product | null> {
  const r = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<ProductRow>();
  return r ? toProduct(r) : null;
}

/** Limitdan band qiladi. Atomar: bir vaqtda ikki mijoz limitdan oshib keta olmaydi. */
export async function reserve(db: D1Database, id: string, qty: number): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE products SET sold_today = sold_today + ?1 WHERE id = ?2 AND is_out = 0 AND sold_today + ?1 <= daily_limit",
    )
    .bind(qty, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function release(db: D1Database, id: string, qty: number): Promise<void> {
  await db.prepare("UPDATE products SET sold_today = MAX(0, sold_today - ?1) WHERE id = ?2").bind(qty, id).run();
}

export async function setOut(db: D1Database, id: string, out: boolean, dailyLimit: number): Promise<void> {
  if (out) await db.prepare("UPDATE products SET is_out = 1 WHERE id = ?").bind(id).run();
  else
    await db
      .prepare("UPDATE products SET is_out = 0, daily_limit = MAX(daily_limit, sold_today + ?2) WHERE id = ?1")
      .bind(id, dailyLimit)
      .run();
}

export async function setDailyLimit(db: D1Database, id: string, limit: number): Promise<void> {
  await db.prepare("UPDATE products SET daily_limit = ? WHERE id = ?").bind(limit, id).run();
}

export async function setPrice(db: D1Database, id: string, price: number): Promise<void> {
  await db.prepare("UPDATE products SET price = ? WHERE id = ?").bind(price, id).run();
}

export async function addProduct(
  db: D1Database,
  p: { id: string; name: string; price: number; category: string; aliases: string[]; dailyLimit: number },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO products (id, name, aliases, price, category, daily_limit) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET name = excluded.name, price = excluded.price, category = excluded.category, active = 1",
    )
    .bind(p.id, p.name, JSON.stringify(p.aliases), p.price, p.category, p.dailyLimit)
    .run();
}

export async function resetDailyLimits(db: D1Database, dailyLimit: number): Promise<void> {
  await db.prepare("UPDATE products SET sold_today = 0, daily_limit = ?").bind(dailyLimit).run();
}

// ---------- mijozlar ----------

export async function upsertCustomer(
  db: D1Database,
  c: { id: number; name?: string; username?: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO customers (telegram_id, name, username, last_seen_at) VALUES (?1, ?2, ?3, datetime('now')) " +
        "ON CONFLICT(telegram_id) DO UPDATE SET name = COALESCE(?2, name), username = COALESCE(?3, username), last_seen_at = datetime('now')",
    )
    .bind(c.id, c.name ?? null, c.username ?? null)
    .run();
}

export interface CustomerRow {
  telegram_id: number;
  name: string | null;
  username: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
}

export async function getCustomer(db: D1Database, id: number) {
  return db
    .prepare("SELECT telegram_id, name, username, phone, address, lat, lon FROM customers WHERE telegram_id = ?")
    .bind(id)
    .first<CustomerRow>();
}

export async function saveLocation(db: D1Database, id: number, lat: number, lon: number, address?: string): Promise<void> {
  await db
    .prepare("UPDATE customers SET lat = ?2, lon = ?3, address = COALESCE(?4, address) WHERE telegram_id = ?1")
    .bind(id, lat, lon, address ?? null)
    .run();
}

export function mapLink(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export async function saveContact(db: D1Database, id: number, phone?: string, address?: string): Promise<void> {
  await db
    .prepare("UPDATE customers SET phone = COALESCE(?2, phone), address = COALESCE(?3, address) WHERE telegram_id = ?1")
    .bind(id, phone ?? null, address ?? null)
    .run();
}

// ---------- savat ----------

export async function getCart(db: D1Database, customerId: number): Promise<CartLine[]> {
  const { results } = await db
    .prepare(
      "SELECT c.product_id, c.qty, p.name, p.price, p.category FROM carts c JOIN products p ON p.id = c.product_id WHERE c.customer_id = ? ORDER BY c.updated_at",
    )
    .bind(customerId)
    .all<CartLine>();
  return results;
}

export async function addToCartRow(db: D1Database, customerId: number, productId: string, qty: number): Promise<void> {
  await db
    .prepare(
      "INSERT INTO carts (customer_id, product_id, qty) VALUES (?1, ?2, ?3) " +
        "ON CONFLICT(customer_id, product_id) DO UPDATE SET qty = qty + ?3, updated_at = datetime('now'), reminded = 0",
    )
    .bind(customerId, productId, qty)
    .run();
}

export async function removeCartRow(db: D1Database, customerId: number, productId: string): Promise<number> {
  const row = await db
    .prepare("SELECT qty FROM carts WHERE customer_id = ? AND product_id = ?")
    .bind(customerId, productId)
    .first<{ qty: number }>();
  if (!row) return 0;
  await db.prepare("DELETE FROM carts WHERE customer_id = ? AND product_id = ?").bind(customerId, productId).run();
  return row.qty;
}

export async function clearCart(db: D1Database, customerId: number): Promise<void> {
  await db.prepare("DELETE FROM carts WHERE customer_id = ?").bind(customerId).run();
}

export async function staleCarts(db: D1Database, olderThan: string) {
  const { results } = await db
    .prepare("SELECT customer_id, product_id, qty FROM carts WHERE updated_at < ?")
    .bind(olderThan)
    .all<{ customer_id: number; product_id: string; qty: number }>();
  return results;
}

export async function cartsToRemind(db: D1Database, olderThan: string) {
  const { results } = await db
    .prepare(
      "SELECT c.customer_id, GROUP_CONCAT(p.name, ', ') AS names FROM carts c JOIN products p ON p.id = c.product_id " +
        "WHERE c.reminded = 0 AND c.updated_at < ? GROUP BY c.customer_id",
    )
    .bind(olderThan)
    .all<{ customer_id: number; names: string }>();
  return results;
}

export async function markCartReminded(db: D1Database, customerId: number): Promise<void> {
  await db.prepare("UPDATE carts SET reminded = 1 WHERE customer_id = ?").bind(customerId).run();
}

// ---------- xabarlar tarixi ----------

export async function addMessage(db: D1Database, customerId: number, role: "user" | "assistant", content: string) {
  await db.prepare("INSERT INTO messages (customer_id, role, content) VALUES (?, ?, ?)").bind(customerId, role, content).run();
}

export async function recentMessages(db: D1Database, customerId: number, limit = 20) {
  const { results } = await db
    .prepare("SELECT role, content FROM messages WHERE customer_id = ? ORDER BY id DESC LIMIT ?")
    .bind(customerId, limit)
    .all<{ role: "user" | "assistant"; content: string }>();
  return results.reverse();
}

// ---------- tasdiq kutayotganlar ----------

export async function findWaitingPending(db: D1Database, customerId: number, productId: string) {
  return db
    .prepare("SELECT * FROM pending_confirmations WHERE customer_id = ? AND product_id = ? AND status = 'waiting'")
    .bind(customerId, productId)
    .first<PendingRow>();
}

export async function createPending(db: D1Database, customerId: number, productId: string, qty: number): Promise<number> {
  const res = await db
    .prepare("INSERT INTO pending_confirmations (customer_id, product_id, qty) VALUES (?, ?, ?)")
    .bind(customerId, productId, qty)
    .run();
  return Number(res.meta.last_row_id);
}

export async function setPendingMessage(db: D1Database, id: number, messageId: number) {
  await db.prepare("UPDATE pending_confirmations SET seller_message_id = ? WHERE id = ?").bind(messageId, id).run();
}

export async function getPending(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM pending_confirmations WHERE id = ?").bind(id).first<PendingRow>();
}

/** Faqat 'waiting' holatidagi so'rovni yopadi; ikki marta bosilsa ikkinchisi false qaytaradi */
export async function closePending(db: D1Database, id: number, status: "approved" | "rejected"): Promise<boolean> {
  const res = await db
    .prepare("UPDATE pending_confirmations SET status = ? WHERE id = ? AND status = 'waiting'")
    .bind(status, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function pendingToRemind(db: D1Database, olderThan: string) {
  const { results } = await db
    .prepare("SELECT * FROM pending_confirmations WHERE status = 'waiting' AND reminded = 0 AND created_at < ?")
    .bind(olderThan)
    .all<PendingRow>();
  return results;
}

export async function markPendingReminded(db: D1Database, id: number) {
  await db.prepare("UPDATE pending_confirmations SET reminded = 1 WHERE id = ?").bind(id).run();
}

// ---------- buyurtmalar ----------

export async function createOrder(
  db: D1Database,
  o: { customerId: number; items: CartLine[]; subtotal: number; delivery: number; address: string; phone: string },
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO orders (customer_id, items, subtotal, delivery, total, address, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(o.customerId, JSON.stringify(o.items), o.subtotal, o.delivery, o.subtotal + o.delivery, o.address, o.phone)
    .run();
  return Number(res.meta.last_row_id);
}

export async function getOrder(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
}

export async function setOrderStatus(db: D1Database, id: number, status: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE orders SET status = ? WHERE id = ? AND status NOT IN ('cancelled', 'delivered')")
    .bind(status, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function openOrders(db: D1Database) {
  const { results } = await db
    .prepare("SELECT * FROM orders WHERE status IN ('new', 'confirmed') ORDER BY id DESC LIMIT 20")
    .all<OrderRow>();
  return results;
}

export async function ordersTodayForCustomer(db: D1Database, customerId: number): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND created_at >= ? AND status != 'cancelled'")
    .bind(customerId, tkDayStartUtc())
    .first<{ n: number }>();
  return r?.n ?? 0;
}

// ---------- eslatmalar ----------

export async function addReminder(db: D1Database, customerId: number, sendAt: Date, text: string, type: string) {
  await db
    .prepare("INSERT INTO reminders (customer_id, send_at, text, type) VALUES (?, ?, ?, ?)")
    .bind(customerId, sqlUtc(sendAt), text, type)
    .run();
}

export async function dueReminders(db: D1Database, now: Date = new Date()) {
  const { results } = await db
    .prepare("SELECT id, customer_id, text, type FROM reminders WHERE sent = 0 AND send_at <= ? ORDER BY send_at LIMIT 50")
    .bind(sqlUtc(now))
    .all<{ id: number; customer_id: number; text: string; type: string }>();
  return results;
}

export async function markReminderSent(db: D1Database, id: number) {
  await db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").bind(id).run();
}

// ---------- statistika ----------

async function ensureStats(db: D1Database, date: string) {
  await db.prepare("INSERT OR IGNORE INTO daily_stats (date) VALUES (?)").bind(date).run();
}

/** Mijozni bugungi "yozganlar" soniga bir marta qo'shadi */
export async function markSeen(db: D1Database, customerId: number): Promise<void> {
  const date = tkDate();
  const res = await db.prepare("INSERT OR IGNORE INTO seen_today (date, customer_id) VALUES (?, ?)").bind(date, customerId).run();
  if ((res.meta.changes ?? 0) > 0) {
    await ensureStats(db, date);
    await db.prepare("UPDATE daily_stats SET chats = chats + 1 WHERE date = ?").bind(date).run();
  }
}

export async function recordOrderStats(db: D1Database, revenue: number, firstOrderToday: boolean): Promise<void> {
  const date = tkDate();
  await ensureStats(db, date);
  await db
    .prepare("UPDATE daily_stats SET orders = orders + 1, revenue = revenue + ?, buyers = buyers + ? WHERE date = ?")
    .bind(revenue, firstOrderToday ? 1 : 0, date)
    .run();
}

export async function getStats(db: D1Database, date: string) {
  return (
    (await db.prepare("SELECT * FROM daily_stats WHERE date = ?").bind(date).first<{
      date: string;
      chats: number;
      buyers: number;
      orders: number;
      revenue: number;
    }>()) ?? { date, chats: 0, buyers: 0, orders: 0, revenue: 0 }
  );
}

export async function cleanupSeen(db: D1Database, keepFrom: string) {
  await db.prepare("DELETE FROM seen_today WHERE date < ?").bind(keepFrom).run();
}
