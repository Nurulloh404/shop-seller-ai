import * as db from "./db";
import { type Env, settings } from "./env";
import { apiFor } from "./bot";
import { atTashkent, fmt, minutesAgo, tkDate, tkHour } from "./util";

/** Har 10 daqiqada: eslatmalar, tasdiq kutayotganlar, tashlab ketilgan savatlar */
export async function every10Minutes(env: Env, now: Date = new Date()): Promise<void> {
  const s = settings(env);
  const api = apiFor(env);
  const DB = env.DB;

  // 1. Vaqti kelgan eslatmalar (faqat 09:00-21:00 Toshkent)
  const hour = tkHour(now);
  if (hour >= 9 && hour < 21) {
    for (const r of await db.dueReminders(DB, now)) {
      try {
        await api.sendMessage(r.customer_id, r.text);
        await db.addMessage(DB, r.customer_id, "assistant", r.text);
      } catch (e) {
        console.error("reminder send", r.id, e);
      }
      await db.markReminderSent(DB, r.id);
    }
  }

  // 2. 10 daqiqadan beri javobsiz tasdiq so'rovlari: sotuvchiga bir marta eslatamiz
  for (const p of await db.pendingToRemind(DB, minutesAgo(10, now))) {
    try {
      await api.sendMessage(s.sellerChatId, "⏰ Mijoz hali javob kutyapti. Tugmani bosing.", {
        reply_parameters: p.seller_message_id ? { message_id: p.seller_message_id, allow_sending_without_reply: true } : undefined,
      });
    } catch (e) {
      console.error("pending remind", e);
    }
    await db.markPendingReminded(DB, p.id);
  }

  // 3. 3 soatdan beri rasmiylashtirilmagan savat: ertaga 10:00 da bitta eslatma
  for (const c of await db.cartsToRemind(DB, minutesAgo(180, now))) {
    await db.addReminder(
      DB,
      c.customer_id,
      atTashkent(1, 10, now),
      `Assalomu alaykum! Kecha savatingizda ${c.names} qolgan edi. Hali ham bor. Bugun buyurtma qilamizmi? Manzil va telefoningizni yozsangiz, yetkazib beramiz.`,
      "abandoned",
    );
    await db.markCartReminded(DB, c.customer_id);
  }

  // 4. 24 soatdan eski savatlar: band qilingan limitni bo'shatamiz
  for (const row of await db.staleCarts(DB, minutesAgo(24 * 60, now))) {
    await db.removeCartRow(DB, row.customer_id, row.product_id);
    await db.release(DB, row.product_id, row.qty);
  }
}

/** Har kuni 06:00 Toshkent: kechagi hisobot va limitlarni tiklash */
export async function daily(env: Env, now: Date = new Date()): Promise<void> {
  const s = settings(env);
  const api = apiFor(env);
  const yesterday = tkDate(new Date(now.getTime() - 24 * 3600_000));
  const st = await db.getStats(env.DB, yesterday);
  const conv = st.chats ? Math.round((st.buyers / st.chats) * 100) : 0;

  try {
    await api.sendMessage(
      s.sellerChatId,
      `🌅 Kechagi natija (${yesterday})\nYozganlar: ${st.chats}\nSotib olganlar: ${st.buyers} (${conv}%)\nBuyurtmalar: ${st.orders}\nTushum: ${fmt(st.revenue)} so'm\n\nBugungi limitlar yangilandi: har tovarga ${s.dailyLimit} ta.`,
    );
  } catch (e) {
    console.error("daily report", e);
  }

  await db.resetDailyLimits(env.DB, s.dailyLimit);
  await db.cleanupSeen(env.DB, tkDate(new Date(now.getTime() - 7 * 24 * 3600_000)));
}
