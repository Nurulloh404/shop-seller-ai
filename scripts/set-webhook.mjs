// Foydalanish: npm run set-webhook -- https://dokon-bot.<subdomain>.workers.dev
// .dev.vars faylidan TELEGRAM_BOT_TOKEN va TELEGRAM_WEBHOOK_SECRET o'qiladi
// (Cloudflare'ga `wrangler secret put` bilan qo'ygan qiymatlaringiz bilan bir xil bo'lsin).
import { readFileSync } from "node:fs";

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\//.test(base)) {
  console.error("Worker manzilini bering: npm run set-webhook -- https://dokon-bot.xxx.workers.dev");
  process.exit(1);
}

let vars = {};
try {
  vars = Object.fromEntries(
    readFileSync(".dev.vars", "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
} catch {
  console.error(".dev.vars topilmadi. .dev.vars.example dan nusxa oling va to'ldiring.");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN || vars.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || vars.TELEGRAM_WEBHOOK_SECRET;
if (!token || !secret) {
  console.error("TELEGRAM_BOT_TOKEN va TELEGRAM_WEBHOOK_SECRET kerak (.dev.vars ichida).");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${base}/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});
const data = await res.json();
console.log(data.ok ? `✅ Webhook o'rnatildi: ${base}/webhook` : `❌ Xato: ${data.description}`);

const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json();
console.log("Holat:", { url: info.result?.url, pending: info.result?.pending_update_count, last_error: info.result?.last_error_message ?? "yo'q" });
