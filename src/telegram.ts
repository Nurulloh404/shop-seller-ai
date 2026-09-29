import { Api, InlineKeyboard } from "grammy";
import type { CartLine, OrderRow, Product } from "./db";
import { fmt } from "./util";

export function customerLabel(c: { id: number; name?: string | null; username?: string | null }): string {
  const parts = [c.name || "Mijoz"];
  if (c.username) parts.push("@" + c.username);
  return parts.join(" ");
}

/** Sotuvchi shu xabarga "Reply" qilsa, javob mijozga yetkaziladi */
export const CUSTOMER_TAG = (id: number) => `#mijoz${id}`;
export function parseCustomerTag(text: string | undefined): number | null {
  const m = text?.match(/#mijoz(\d+)/);
  return m ? Number(m[1]) : null;
}

export function pendingKeyboard(pendingId: number) {
  return new InlineKeyboard().text("✅ Bor", `pc:ok:${pendingId}`).text("❌ Yo'q", `pc:no:${pendingId}`);
}

export function orderKeyboard(orderId: number, status: string) {
  const kb = new InlineKeyboard();
  if (status === "new") kb.text("✅ Qabul", `o:conf:${orderId}`);
  kb.text("🚚 Yetkazildi", `o:done:${orderId}`).text("✖️ Bekor", `o:cancel:${orderId}`);
  return kb;
}

export async function sendPendingToSeller(
  api: Api,
  sellerChatId: string,
  p: { pendingId: number; product: Product; qty: number; customer: { id: number; name?: string | null; username?: string | null } },
): Promise<number | null> {
  const text =
    `❓ Tasdiq kerak\n` +
    `${customerLabel(p.customer)} so'rayapti: ${p.qty} ta ${p.product.name}\n` +
    `Bugun sotildi: ${p.product.sold_today}, limit: ${p.product.daily_limit}\n` +
    `Omborda bormi?\n${CUSTOMER_TAG(p.customer.id)}`;
  try {
    const msg = await api.sendMessage(sellerChatId, text, { reply_markup: pendingKeyboard(p.pendingId) });
    return msg.message_id;
  } catch (e) {
    console.error("sendPendingToSeller", e);
    return null;
  }
}

export function orderText(o: Pick<OrderRow, "id" | "subtotal" | "delivery" | "total" | "address" | "phone" | "status">, items: CartLine[], who: string): string {
  const lines = items.map((i) => `• ${i.qty} × ${i.name} = ${fmt(i.qty * i.price)}`).join("\n");
  const status: Record<string, string> = { new: "🆕 Yangi", confirmed: "✅ Qabul qilindi", delivered: "🚚 Yetkazildi", cancelled: "✖️ Bekor qilindi" };
  return (
    `${status[o.status] ?? o.status} buyurtma №${o.id}\n${who}\n\n${lines}\n\n` +
    `Tovarlar: ${fmt(o.subtotal)} so'm\nYetkazish: ${o.delivery ? fmt(o.delivery) + " so'm" : "bepul"}\n` +
    `Jami: ${fmt(o.total)} so'm\n\n📞 ${o.phone ?? "-"}\n📍 ${o.address ?? "-"}`
  );
}

export async function notifySeller(api: Api, sellerChatId: string, text: string): Promise<void> {
  if (!sellerChatId) return;
  try {
    await api.sendMessage(sellerChatId, text);
  } catch (e) {
    console.error("notifySeller", e);
  }
}
