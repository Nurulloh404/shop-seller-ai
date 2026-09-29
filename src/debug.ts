/** Muhim bosqich va xatolarni D1 ga yozadi, shunda muammoni loglarsiz ham ko'rish mumkin. Hech qachon xato tashlamaydi. */
export async function dlog(db: D1Database | undefined, stage: string, detail: unknown): Promise<void> {
  if (!db) return;
  try {
    const text =
      detail instanceof Error
        ? `${detail.name}: ${detail.message}\n${(detail.stack ?? "").split("\n").slice(1, 4).join("\n")}`
        : typeof detail === "string"
          ? detail
          : JSON.stringify(detail);
    await db.prepare("INSERT INTO debug_log (stage, detail) VALUES (?, ?)").bind(stage, text.slice(0, 1500)).run();
  } catch {
    // jurnal yozilmasa ham bot ishlashda davom etadi
  }
}

export async function trimLog(db: D1Database): Promise<void> {
  try {
    await db.prepare("DELETE FROM debug_log WHERE id <= (SELECT MAX(id) - 500 FROM debug_log)").run();
  } catch {
    // e'tiborsiz
  }
}
