import type { Update } from "grammy/types";
import { handleUpdate } from "./bot";
import { daily, every10Minutes } from "./cron";
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Do'kon AI sotuvchi ishlayapti ✅", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    // Diagnostika: sirlarning qiymatini emas, faqat qo'yilgan-qo'yilmaganini ko'rsatadi
    if (request.method === "GET" && url.pathname === "/health") {
      const set = (v: unknown) => typeof v === "string" && v.trim().length > 0;
      let db: string;
      try {
        const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM products").first<{ n: number }>();
        db = `ok (${r?.n ?? 0} ta tovar)`;
      } catch (e) {
        db = "xato: " + (e instanceof Error ? e.message : String(e));
      }
      const body = {
        TELEGRAM_BOT_TOKEN: set(env.TELEGRAM_BOT_TOKEN),
        TELEGRAM_WEBHOOK_SECRET: set(env.TELEGRAM_WEBHOOK_SECRET),
        OPENROUTER_API_KEY: set(env.OPENROUTER_API_KEY),
        SELLER_CHAT_ID: set(env.SELLER_CHAT_ID) && env.SELLER_CHAT_ID.trim() !== "0",
        OPENROUTER_MODEL: env.OPENROUTER_MODEL ?? null,
        DB: env.DB ? db : "ulanmagan",
      };
      return Response.json(body);
    }

    // Webhook'ni Worker o'zi o'rnatadi (noutbuk kerak emas).
    // Xavfsiz: webhook faqat SHU Worker manziliga va SHU Worker siriga yo'naltiriladi, boshqa joyga emas.
    if (request.method === "GET" && url.pathname === "/setup-webhook") {
      const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
      const secret = (env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
      if (!token || !secret) {
        return Response.json(
          { ok: false, sabab: "TELEGRAM_BOT_TOKEN yoki TELEGRAM_WEBHOOK_SECRET qo'yilmagan. /health sahifasini tekshiring." },
          { status: 400 },
        );
      }
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
        return Response.json(
          { ok: false, sabab: "TELEGRAM_WEBHOOK_SECRET faqat harf, raqam, _ va - dan iborat bo'lishi kerak (1-256 belgi)." },
          { status: 400 },
        );
      }
      const tg = (method: string, body?: unknown) =>
        fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }).then((r) => r.json() as Promise<{ ok: boolean; description?: string; result?: any }>);

      const set = await tg("setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      });
      const info = await tg("getWebhookInfo");
      const me = await tg("getMe");
      return Response.json({
        ok: set.ok,
        natija: set.ok ? "✅ Webhook o'rnatildi" : `❌ ${set.description}`,
        bot: me.ok ? "@" + me.result?.username : `token xato: ${me.description}`,
        webhook_url: info.result?.url ?? null,
        kutayotgan_xabarlar: info.result?.pending_update_count ?? null,
        oxirgi_xato: info.result?.last_error_message ?? "yo'q",
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const expected = (env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
      if (!expected || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
        console.warn("webhook 401: secret mos kelmadi yoki qo'yilmagan");
        return new Response("unauthorized", { status: 401 });
      }
      let update: Update;
      try {
        update = (await request.json()) as Update;
      } catch {
        return new Response("bad request", { status: 400 });
      }
      // Telegram'ga darhol 200 qaytaramiz, AI javobini fonda tayyorlaymiz (webhook timeout bo'lmasligi uchun)
      ctx.waitUntil(handleUpdate(env, update).catch((e) => console.error("update failed", e)));
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "0 1 * * *") ctx.waitUntil(daily(env));
    else ctx.waitUntil(every10Minutes(env));
  },
} satisfies ExportedHandler<Env>;
