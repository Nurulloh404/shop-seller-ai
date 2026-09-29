/** Summani "98 000" ko'rinishida yozadi. */
export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const TK_OFFSET_MS = 5 * 60 * 60 * 1000; // Toshkent UTC+5, yozgi vaqt yo'q

/** Toshkent bo'yicha sana: YYYY-MM-DD */
export function tkDate(d: Date = new Date()): string {
  return new Date(d.getTime() + TK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Toshkent bo'yicha soat (0-23) */
export function tkHour(d: Date = new Date()): number {
  return new Date(d.getTime() + TK_OFFSET_MS).getUTCHours();
}

/** SQLite datetime('now') bilan bir xil formatdagi UTC vaqt */
export function sqlUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Bugundan `days` kun keyin, Toshkent vaqti bilan `hour`:00 ga to'g'ri keladigan lahza */
export function atTashkent(days: number, hour: number, now: Date = new Date()): Date {
  const tk = new Date(now.getTime() + TK_OFFSET_MS);
  const target = Date.UTC(tk.getUTCFullYear(), tk.getUTCMonth(), tk.getUTCDate() + days, hour, 0, 0);
  return new Date(target - TK_OFFSET_MS);
}

/** Toshkent kunining boshlanishi, UTC formatida (hisobotlar uchun) */
export function tkDayStartUtc(d: Date = new Date()): string {
  return sqlUtc(atTashkent(0, 0, d));
}

export function minutesAgo(min: number, now: Date = new Date()): string {
  return sqlUtc(new Date(now.getTime() - min * 60_000));
}

/** AI javobidagi markdown belgilarini olib tashlaydi (Telegram'da oddiy matn sifatida yuboriladi) */
export function plainText(s: string): string {
  return s
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
