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
