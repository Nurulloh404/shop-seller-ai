import { Bot, type Context, InlineKeyboard } from "grammy";
import type { Update } from "grammy/types";
import * as db from "./db";
import { type Env, settings } from "./env";
import { runAgent } from "./llm";
import { remaining } from "./limits";
import { systemPrompt } from "./prompts";
import { bestMatch, normalize } from "./search";
import { CUSTOMER_TAG, customerLabel, notifySeller, orderKeyboard, orderText, parseCustomerTag } from "./telegram";
import { approvePending, type ToolContext } from "./tools";
import { fmt, plainText, tkDate } from "./util";
import { dlog } from "./debug";

const FALLBACK = "Bir daqiqa, sotuvchi hozir o'zi javob beradi 🙏";

let cached: { token: string; bot: Bot; ready: Promise<void> } | null = null;

/** Isolate ichida bitta Bot nusxasi; getMe faqat bir marta chaqiriladi */
function getBot(env: Env): { bot: Bot; ready: Promise<void> } {
  if (cached && cached.token === env.TELEGRAM_BOT_TOKEN) return cached;
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN.trim());
  registerHandlers(bot, env);
  cached = { token: env.TELEGRAM_BOT_TOKEN, bot, ready: bot.init() };
  cached.ready.catch(() => (cached = null));
  return cached;
}

export async function handleUpdate(env: Env, update: Update): Promise<void> {
  const { bot, ready } = getBot(env);
  await ready;
  await bot.handleUpdate(update);
}

export function apiFor(env: Env) {
  return getBot(env).bot.api;
}

function toolCtx(env: Env, bot: Bot, customer: ToolContext["customer"]): ToolContext {
  return { env, s: settings(env), api: bot.api, customer };
}

function productsKeyboard(products: db.Product[]) {
  const kb = new InlineKeyboard();
  for (const p of products) {
    const label = p.is_out ? `✅ Keldi: ${p.name}` : `⛔ Tugadi: ${p.name}`;
    kb.text(label.slice(0, 60), `p:${p.is_out ? "in" : "out"}:${p.id}`).row();
  }
  return kb;
}

function productsText(products: db.Product[]) {
  const lines = products.map((p) => {
    const state = p.is_out ? "⛔ tugagan" : `${remaining(p)}/${p.daily_limit} qoldi`;
    return `• ${p.name} — ${fmt(p.price)} so'm — ${state}`;
  });
  return `📦 Tovarlar (${products.length})\n\n${lines.join("\n")}\n\nTugagan tovar tugmasini bosing. Kelganda yana bosing.`;
}

const SELLER_HELP = `Sotuvchi buyruqlari:
/tovarlar — ro'yxat, limit va Tugadi/Keldi tugmalari
/tugadi ariel — tovar tugadi
/keldi ariel — tovar yana keldi
/narx ariel 99000 — narxni o'zgartirish
/qosh Sensodyne pasta 75 ml ; 32000 ; gigiyena — yangi tovar
/hisobot — bugungi natija
/buyurtmalar — ochiq buyurtmalar

Mijoz savoliga javob berish: bot yuborgan xabarga Reply qiling.`;

function registerHandlers(bot: Bot, env: Env) {
  const s = settings(env);
  const DB = env.DB;
  const isSeller = (ctx: Context) => !!s.sellerChatId && String(ctx.chat?.id) === s.sellerChatId;

  bot.catch(async (err) => {
    console.error("bot error", err.error);
    await dlog(DB, "bot-error", err.error);
  });

  // Istalgan chatda: chat ID ni bilish (SELLER_CHAT_ID sozlash uchun)
  bot.command("id", (ctx) => ctx.reply(`Bu chat ID: ${ctx.chat.id}`));

  // ================= SOTUVCHI =================
  const seller = bot.filter(isSeller);

  seller.command(["start", "yordam", "help"], (ctx) => ctx.reply(SELLER_HELP));

  seller.command("tovarlar", async (ctx) => {
    const products = await db.listProducts(DB);
    await ctx.reply(productsText(products), { reply_markup: productsKeyboard(products) });
  });

  const toggleCmd = (out: boolean) => async (ctx: Context) => {
    const q = String(ctx.match ?? "").trim();
    if (!q) return void (await ctx.reply(`Tovar nomini yozing: /${out ? "tugadi" : "keldi"} ariel`));
    const p = bestMatch(q, await db.listProducts(DB));
    if (!p) return void (await ctx.reply(`"${q}" topilmadi yoki bir nechta mos keldi. /tovarlar dan tugma bilan belgilang.`));
    await db.setOut(DB, p.id, out, s.dailyLimit);
    await ctx.reply(out ? `⛔ ${p.name} tugadi deb belgilandi. Bot endi o'xshash tovar taklif qiladi.` : `✅ ${p.name} yana sotuvda.`);
  };
  seller.command("tugadi", toggleCmd(true));
  seller.command("keldi", toggleCmd(false));

  seller.command("narx", async (ctx) => {
    const m = String(ctx.match ?? "").trim().match(/^(.*?)\s+([\d\s]+)$/);
    if (!m) return void (await ctx.reply("Namuna: /narx ariel 99000"));
    const price = Number(m[2].replace(/\s/g, ""));
    const p = bestMatch(m[1], await db.listProducts(DB));
    if (!p || !price) return void (await ctx.reply(`"${m[1]}" topilmadi.`));
    await db.setPrice(DB, p.id, price);
    await ctx.reply(`💰 ${p.name}: ${fmt(p.price)} → ${fmt(price)} so'm`);
  });

  seller.command("qosh", async (ctx) => {
    const parts = String(ctx.match ?? "").split(";").map((x) => x.trim());
    const [name, priceRaw, category = "boshqa"] = parts;
    const price = Number((priceRaw ?? "").replace(/\s/g, ""));
    if (!name || !price) return void (await ctx.reply("Namuna: /qosh Sensodyne pasta 75 ml ; 32000 ; gigiyena"));
    const id = normalize(name).replace(/ /g, "-").slice(0, 40);
    const first = normalize(name).split(" ")[0];
    await db.addProduct(DB, { id, name, price, category: category.toLowerCase(), aliases: [first], dailyLimit: s.dailyLimit });
    await ctx.reply(`➕ Qo'shildi: ${name} — ${fmt(price)} so'm (${category})`);
  });

  seller.command("hisobot", async (ctx) => {
    const st = await db.getStats(DB, tkDate());
    const conv = st.chats ? Math.round((st.buyers / st.chats) * 100) : 0;
    await ctx.reply(
      `📊 Bugun (${st.date})\nYozganlar: ${st.chats}\nSotib olganlar: ${st.buyers}\nKonversiya: ${conv}%\nBuyurtmalar: ${st.orders}\nTushum: ${fmt(st.revenue)} so'm`,
    );
  });

  seller.command("buyurtmalar", async (ctx) => {
    const orders = await db.openOrders(DB);
    if (!orders.length) return void (await ctx.reply("Ochiq buyurtma yo'q ✅"));
    for (const o of orders.slice(0, 10)) {
      const c = await db.getCustomer(DB, o.customer_id);
      const who = `${customerLabel({ id: o.customer_id, name: c?.name, username: c?.username })}\n${CUSTOMER_TAG(o.customer_id)}`;
      await ctx.reply(orderText(o, JSON.parse(o.items), who), { reply_markup: orderKeyboard(o.id, o.status) });
    }
  });

  // Sotuvchi bot xabariga Reply qilsa: mijozga yetkazamiz
  seller.on("message:text", async (ctx) => {
    const replied = ctx.message.reply_to_message;
    const customerId = replied?.from?.id === ctx.me.id ? parseCustomerTag(replied.text ?? replied.caption) : null;
    if (!customerId) {
      if (ctx.chat.type === "private") await ctx.reply(SELLER_HELP);
      return;
    }
    try {
      await ctx.api.sendMessage(customerId, ctx.message.text);
      await db.addMessage(DB, customerId, "assistant", ctx.message.text);
      await ctx.reply("✅ Mijozga yuborildi", { reply_parameters: { message_id: ctx.message.message_id } });
    } catch {
      await ctx.reply("Yuborib bo'lmadi: mijoz botni bloklagan bo'lishi mumkin.");
    }
  });

  // Tugmalar (faqat sotuvchi chatidan)
  bot.on("callback_query:data", async (ctx) => {
    if (!isSeller(ctx)) return void (await ctx.answerCallbackQuery());
    const [kind, action, rawId] = ctx.callbackQuery.data.split(":");
    const originalText = ctx.callbackQuery.message?.text ?? "";

    if (kind === "p") {
      await db.setOut(DB, rawId, action === "out", s.dailyLimit);
      const products = await db.listProducts(DB);
      await ctx.answerCallbackQuery(action === "out" ? "Tugadi deb belgilandi" : "Sotuvga qaytdi");
      await ctx.editMessageText(productsText(products), { reply_markup: productsKeyboard(products) }).catch(() => {});
      return;
    }

    if (kind === "pc") {
      const id = Number(rawId);
      const pending = await db.getPending(DB, id);
      if (!pending || !(await db.closePending(DB, id, action === "ok" ? "approved" : "rejected"))) {
        return void (await ctx.answerCallbackQuery("Bu so'rov allaqachon hal qilingan"));
      }
      const c = await db.getCustomer(DB, pending.customer_id);
      const tctx = toolCtx(env, bot, { id: pending.customer_id, name: c?.name, username: c?.username });

      let customerMsg: string;
      if (action === "ok") {
        const res = await approvePending(tctx, pending);
        if (!res) {
          customerMsg = "Kechirasiz, tovarni tekshirishda xatolik bo'ldi. Sotuvchi o'zi bog'lanadi.";
        } else {
          const hint = res.cart.free_delivery_left > 0
            ? `\nYana ${fmt(res.cart.free_delivery_left)} so'mlik tovar qo'shsangiz, yetkazish bepul.`
            : "\nYetkazish bepul ✅";
          customerMsg = `✅ ${pending.qty} ta ${res.product.name} bor, savatingizga qo'shdim.\n${res.cart.text}${hint}\n\nRasmiylashtiramizmi?`;
        }
      } else {
        const p = await db.getProduct(DB, pending.product_id);
        await db.setOut(DB, pending.product_id, true, s.dailyLimit);
        const alt = p?.alt_product_id ? await db.getProduct(DB, p.alt_product_id) : null;
        customerMsg = alt && !alt.is_out
          ? `Afsuski, ${p?.name} bugun tugab qolibdi 😔\nO'rniga ${alt.name} bor: ${fmt(alt.price)} so'm. Olib qo'yaymi?`
          : `Afsuski, ${p?.name ?? "bu tovar"} bugun tugab qolibdi 😔 Kelganda sizga xabar beraman.`;
      }
      try {
        await ctx.api.sendMessage(pending.customer_id, customerMsg);
        await db.addMessage(DB, pending.customer_id, "assistant", customerMsg);
      } catch (e) {
        console.error("pending customer notify", e);
      }
      await ctx.answerCallbackQuery(action === "ok" ? "Tasdiqlandi" : "Rad etildi");
      await ctx.editMessageText(`${originalText}\n\n${action === "ok" ? "✅ Tasdiqlandi" : "❌ Yo'q deb belgilandi"}`).catch(() => {});
      return;
    }

    if (kind === "o") {
      const id = Number(rawId);
      const order = await db.getOrder(DB, id);
      if (!order) return void (await ctx.answerCallbackQuery("Buyurtma topilmadi"));
      const status = action === "conf" ? "confirmed" : action === "done" ? "delivered" : "cancelled";
      if (!(await db.setOrderStatus(DB, id, status))) return void (await ctx.answerCallbackQuery("Buyurtma allaqachon yopilgan"));

      if (status === "cancelled") {
        for (const it of JSON.parse(order.items) as db.CartLine[]) await db.release(DB, it.product_id, it.qty);
      }
      const texts: Record<string, string> = {
        confirmed: `✅ Buyurtmangiz №${id} qabul qilindi. Tez orada yetkazamiz!`,
        delivered: `🚚 Buyurtma №${id} yetkazildi. Xaridingiz uchun rahmat! Yana kerak bo'lsa, shu yerga yozing.`,
        cancelled: `Buyurtma №${id} bekor qilindi. Savol bo'lsa, yozing.`,
      };
      try {
        await ctx.api.sendMessage(order.customer_id, texts[status]);
        await db.addMessage(DB, order.customer_id, "assistant", texts[status]);
      } catch (e) {
        console.error("order customer notify", e);
      }
      const labels: Record<string, string> = { confirmed: "✅ Qabul qilindi", delivered: "🚚 Yetkazildi", cancelled: "✖️ Bekor qilindi" };
      await ctx.answerCallbackQuery(labels[status]);
      await ctx
        .editMessageText(`${originalText}\n\nHolat: ${labels[status]}`, {
          reply_markup: status === "confirmed" ? orderKeyboard(id, status) : undefined,
        })
        .catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // ================= MIJOZ =================
  const customer = bot.chatType("private").filter((ctx) => !isSeller(ctx));

  customer.command("start", async (ctx) => {
    await db.upsertCustomer(DB, { id: ctx.from.id, name: ctx.from.first_name, username: ctx.from.username });
    const text = `Assalomu alaykum${ctx.from.first_name ? ", " + ctx.from.first_name : ""}! ${s.shopName}ga xush kelibsiz 🌿\nQaysi tovar kerak? Nomini yozing, narxi va bor-yo'qligini darhol aytaman.`;
    await ctx.reply(text);
    await db.addMessage(DB, ctx.from.id, "assistant", text);
  });

  customer.on("message:contact", async (ctx) => {
    await db.upsertCustomer(DB, { id: ctx.from.id, name: ctx.from.first_name, username: ctx.from.username });
    await db.saveContact(DB, ctx.from.id, ctx.message.contact.phone_number);
    await answerCustomer(ctx, `Telefon raqamim: ${ctx.message.contact.phone_number}`);
  });

  customer.on("message:text", (ctx) => answerCustomer(ctx, ctx.message.text));

  customer.on(["message:photo", "message:voice", "message:video", "message:document"], async (ctx) => {
    const who = customerLabel({ id: ctx.from.id, name: ctx.from.first_name, username: ctx.from.username });
    try {
      await ctx.forwardMessage(s.sellerChatId);
      await notifySeller(ctx.api, s.sellerChatId, `☝️ ${who} yubordi. Javob berish uchun shu xabarga Reply qiling.\n${CUSTOMER_TAG(ctx.from.id)}`);
    } catch (e) {
      console.error("forward", e);
    }
    await ctx.reply("Qabul qildim, sotuvchiga yubordim. Tovar nomini matn bilan yozsangiz, darhol javob beraman.");
  });

  async function answerCustomer(ctx: Context, text: string) {
    const from = ctx.from!;
    await dlog(DB, "customer", `${from.id}: ${text.slice(0, 60)}`);
    const c = { id: from.id, name: from.first_name, username: from.username };
    await db.upsertCustomer(DB, c);
    await db.markSeen(DB, from.id);
    await ctx.replyWithChatAction("typing").catch(() => {});

    const history = await db.recentMessages(DB, from.id, 20);
    await db.addMessage(DB, from.id, "user", text);

    let reply: string;
    try {
      reply = await runAgent(toolCtx(env, bot, c), systemPrompt(s, from.first_name), history, text);
    } catch (e) {
      console.error("agent", e);
      await dlog(DB, "agent-error", e);
      reply = FALLBACK;
      await notifySeller(
        ctx.api,
        s.sellerChatId,
        `⚠️ AI javob bera olmadi. ${customerLabel(c)} yozdi:\n"${text}"\n\nShu xabarga Reply qilib javob bering.\n${CUSTOMER_TAG(from.id)}`,
      );
    }
    reply = plainText(reply);
    await ctx.reply(reply.slice(0, 4000));
    await db.addMessage(DB, from.id, "assistant", reply);
  }
}
