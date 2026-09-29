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

    if (request.method === "POST" && url.pathname === "/webhook") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
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
