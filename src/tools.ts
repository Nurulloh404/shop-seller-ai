import type { Api } from "grammy";
import * as db from "./db";
import type { Env, Settings } from "./env";
import { decideAdd, deliveryFor, freeDeliveryLeft, limitAfterApproval, repeatDays, stockStatus } from "./limits";
import { searchProducts } from "./search";
import { CUSTOMER_TAG, customerLabel, notifySeller, orderKeyboard, orderText, sendPendingToSeller } from "./telegram";
import { atTashkent, fmt } from "./util";

export interface ToolContext {
  env: Env;
  s: Settings;
  api: Api;
  customer: { id: number; name?: string | null; username?: string | null };
}

/** OpenAI / OpenRouter function calling formatidagi tool ta'riflari */
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Tovarni nomi bo'yicha qidiradi (lotin, kirill, xato yozuvlar ham). Narx, bor-yo'qlik va o'xshash tovarni qaytaradi. Mijoz biror tovar haqida so'rasa, AVVAL shuni chaqir.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Mijoz yozgan tovar nomi yoki turi, masalan 'reksona' yoki 'shampun'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_products",
      description: "Do'kondagi tovarlar ro'yxati. Mijoz 'nima bor?' yoki 'qanday shampunlar bor?' desa chaqir.",
      parameters: {
        type: "object",
        properties: { category: { type: "string", description: "Ixtiyoriy kategoriya: poroshok, shampun, dezodorant, gel, idish, tozalash, kir yuvish, gigiyena, sovun, ustara" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Tovarni mijoz savatiga qo'shadi. Natijadagi status: added, waiting_seller yoki out.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "search_products qaytargan id" },
          qty: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["product_id", "qty"],
      },
    },
  },
  {
    type: "function",
    function: { name: "view_cart", description: "Savat, jami summa va yetkazish narxi.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "remove_from_cart",
      description: "Tovarni savatdan olib tashlaydi.",
      parameters: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "checkout",
      description:
        "Buyurtmani rasmiylashtiradi. Faqat mijoz manzil va telefon raqamini bergandan keyin va buyurtmani tasdiqlagandan keyin chaqir.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Yetkazish manzili" },
          phone: { type: "string", description: "Telefon raqami" },
        },
        required: ["address", "phone"],
      },
    },
  },
  {
    type: "function",
    function: { name: "delivery_info", description: "Yetkazish shartlari va narxi.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "notify_seller",
      description: "Sen javob bera olmaydigan savolni (tovar topilmadi, shikoyat, maxsus so'rov) sotuvchiga yuboradi.",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
  },
] as const;

type Args = Record<string, unknown>;

function productView(p: db.Product) {
  return { id: p.id, name: p.name, price: p.price, price_text: `${fmt(p.price)} so'm`, category: p.category, status: stockStatus(p) };
}

async function cartSummary(ctx: ToolContext) {
  const lines = await db.getCart(ctx.env.DB, ctx.customer.id);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery = deliveryFor(subtotal, ctx.s.freeDeliveryFrom, ctx.s.deliveryPrice);
  return {
    items: lines.map((l) => ({ product_id: l.product_id, name: l.name, qty: l.qty, line_total: l.qty * l.price })),
    subtotal,
    delivery,
    total: subtotal + delivery,
    free_delivery_left: freeDeliveryLeft(subtotal, ctx.s.freeDeliveryFrom),
    text: `Tovarlar: ${fmt(subtotal)} so'm, yetkazish: ${delivery ? fmt(delivery) + " so'm" : "bepul"}, jami: ${fmt(subtotal + delivery)} so'm`,
  };
}

/** add_to_cart mantiqi. Sotuvchi tasdiqlagandan keyin ham shu funksiya ishlatiladi. */
export async function addToCart(ctx: ToolContext, productId: string, qty: number) {
  const p = await db.getProduct(ctx.env.DB, productId);
  if (!p || !p.active) return { status: "error", message: "Bunday tovar yo'q. Avval search_products bilan qidir." };

  const decision = decideAdd(p, qty);
  if (decision.kind === "out") {
    const alt = p.alt_product_id ? await db.getProduct(ctx.env.DB, p.alt_product_id) : null;
    return {
      status: "out",
      product: p.name,
      alternative: alt && !alt.is_out ? productView(alt) : null,
      instruction: "Mijozga bu tovar bugun yo'qligini ayt. Alternativa bo'lsa, uni taklif qil.",
    };
  }

  if (decision.kind === "ok" && (await db.reserve(ctx.env.DB, p.id, qty))) {
    await db.addToCartRow(ctx.env.DB, ctx.customer.id, p.id, qty);
    return { status: "added", product: p.name, qty, cart: await cartSummary(ctx) };
  }

  // Limitdan oshdi: sotuvchidan so'raymiz
  const existing = await db.findWaitingPending(ctx.env.DB, ctx.customer.id, p.id);
  if (!existing) {
    const pendingId = await db.createPending(ctx.env.DB, ctx.customer.id, p.id, qty);
    const msgId = await sendPendingToSeller(ctx.api, ctx.s.sellerChatId, { pendingId, product: p, qty, customer: ctx.customer });
    if (msgId) await db.setPendingMessage(ctx.env.DB, pendingId, msgId);
  }
  return {
    status: "waiting_seller",
    product: p.name,
    qty,
    instruction: "Mijozga omborni tekshirayotganingni va sotuvchi 2-3 daqiqada tasdiqlashini ayt. Hali savatga qo'shilmadi.",
  };
}

/** Sotuvchi "Bor" bosganda: limitni oshirib, tovarni mijoz savatiga qo'shadi */
export async function approvePending(ctx: ToolContext, pending: db.PendingRow) {
  const p = await db.getProduct(ctx.env.DB, pending.product_id);
  if (!p) return null;
  if (p.is_out) await db.setOut(ctx.env.DB, p.id, false, ctx.s.dailyLimit);
  const fresh = (await db.getProduct(ctx.env.DB, p.id))!;
  await db.setDailyLimit(ctx.env.DB, p.id, limitAfterApproval(fresh, pending.qty, ctx.s.dailyLimit));
  const ok = await db.reserve(ctx.env.DB, p.id, pending.qty);
  if (!ok) return null;
  await db.addToCartRow(ctx.env.DB, pending.customer_id, p.id, pending.qty);
  return { product: p, cart: await cartSummary(ctx) };
}

async function checkout(ctx: ToolContext, address: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return { status: "error", message: "Telefon raqami noto'g'ri. Mijozdan to'liq raqamni so'ra." };
  if (address.trim().length < 5) return { status: "error", message: "Manzil juda qisqa. Mijozdan aniqroq manzil so'ra." };

  const items = await db.getCart(ctx.env.DB, ctx.customer.id);
  if (!items.length) return { status: "error", message: "Savat bo'sh." };

  const subtotal = items.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery = deliveryFor(subtotal, ctx.s.freeDeliveryFrom, ctx.s.deliveryPrice);
  const firstToday = (await db.ordersTodayForCustomer(ctx.env.DB, ctx.customer.id)) === 0;
  const orderId = await db.createOrder(ctx.env.DB, { customerId: ctx.customer.id, items, subtotal, delivery, address, phone });
  await db.clearCart(ctx.env.DB, ctx.customer.id);
  await db.saveContact(ctx.env.DB, ctx.customer.id, phone, address);
  await db.recordOrderStats(ctx.env.DB, subtotal + delivery, firstToday);

  // Qayta xarid eslatmalari: har kategoriya uchun bittadan
  const seen = new Set<string>();
  for (const it of items) {
    const days = repeatDays(it.category);
    if (!days || seen.has(it.category)) continue;
    seen.add(it.category);
    await db.addReminder(
      ctx.env.DB,
      ctx.customer.id,
      atTashkent(days, 10),
      `Assalomu alaykum! ${it.name} tugab qolgandir? Xohlasangiz, bugun yana yetkazib beramiz. "Ha" deb yozing, qolganini o'zim hal qilaman.`,
      "repeat",
    );
  }

  const order = { id: orderId, subtotal, delivery, total: subtotal + delivery, address, phone, status: "new" };
  const who = `${customerLabel(ctx.customer)}\n${CUSTOMER_TAG(ctx.customer.id)}`;
  try {
    await ctx.api.sendMessage(ctx.s.sellerChatId, orderText(order, items, who), { reply_markup: orderKeyboard(orderId, "new") });
  } catch (e) {
    console.error("order notify", e);
  }

  return {
    status: "ok",
    order_id: orderId,
    items: items.map((i) => `${i.qty} × ${i.name}`),
    subtotal,
    delivery,
    total: subtotal + delivery,
    instruction: "Mijozga buyurtma raqamini, jami summani ayt va sotuvchi tez orada bog'lanishini bildir.",
  };
}

export async function runTool(ctx: ToolContext, name: string, args: Args): Promise<unknown> {
  const DB = ctx.env.DB;
  switch (name) {
    case "search_products": {
      const products = await db.listProducts(DB);
      const hits = searchProducts(String(args.query ?? ""), products).slice(0, 6);
      if (!hits.length) return { found: false, instruction: "Topilmadi. Mijozdan aniqlashtir yoki notify_seller chaqir. Narx to'qima." };
      const byId = new Map(products.map((p) => [p.id, p]));
      return {
        found: true,
        results: hits.map(({ product: p }) => {
          const alt = p.alt_product_id ? byId.get(p.alt_product_id) : undefined;
          return { ...productView(p), alternative: p.is_out && alt && !alt.is_out ? productView(alt) : null };
        }),
      };
    }
    case "list_products": {
      const cat = typeof args.category === "string" ? args.category.toLowerCase() : "";
      const products = (await db.listProducts(DB)).filter((p) => !cat || p.category.toLowerCase() === cat);
      return { products: products.map(productView) };
    }
    case "add_to_cart": {
      const qty = Math.floor(Number(args.qty ?? 1));
      if (!Number.isFinite(qty) || qty < 1 || qty > 50) return { status: "error", message: "Miqdor 1 dan 50 gacha bo'lsin." };
      return addToCart(ctx, String(args.product_id ?? ""), qty);
    }
    case "view_cart":
      return cartSummary(ctx);
    case "remove_from_cart": {
      const id = String(args.product_id ?? "");
      const qty = await db.removeCartRow(DB, ctx.customer.id, id);
      if (qty) await db.release(DB, id, qty);
      return { removed: qty > 0, cart: await cartSummary(ctx) };
    }
    case "checkout":
      return checkout(ctx, String(args.address ?? ""), String(args.phone ?? ""));
    case "delivery_info":
      return {
        free_from: ctx.s.freeDeliveryFrom,
        price: ctx.s.deliveryPrice,
        text: `Yetkazish ${fmt(ctx.s.deliveryPrice)} so'm. ${fmt(ctx.s.freeDeliveryFrom)} so'mdan oshsa bepul. Odatda shu kunning o'zida.`,
      };
    case "notify_seller": {
      await notifySeller(
        ctx.api,
        ctx.s.sellerChatId,
        `💬 ${customerLabel(ctx.customer)} savoli:\n${String(args.text ?? "")}\n\nJavob berish uchun shu xabarga Reply qiling.\n${CUSTOMER_TAG(ctx.customer.id)}`,
      );
      return { sent: true, instruction: "Mijozga sotuvchi tez orada javob berishini ayt." };
    }
    default:
      return { error: `Noma'lum tool: ${name}` };
  }
}

