export interface Env {
  DB: D1Database;
  // vars
  OPENROUTER_MODEL: string;
  DAILY_LIMIT: string;
  FREE_DELIVERY_FROM: string;
  DELIVERY_PRICE: string;
  SHOP_NAME: string;
  // secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENROUTER_API_KEY: string;
  SELLER_CHAT_ID: string;
}

export interface Settings {
  dailyLimit: number;
  freeDeliveryFrom: number;
  deliveryPrice: number;
  shopName: string;
  sellerChatId: string;
}

export function settings(env: Env): Settings {
  return {
    dailyLimit: Number(env.DAILY_LIMIT) || 5,
    freeDeliveryFrom: Number(env.FREE_DELIVERY_FROM) || 150000,
    deliveryPrice: Number(env.DELIVERY_PRICE) || 15000,
    shopName: env.SHOP_NAME || "Do'kon",
    sellerChatId: String(env.SELLER_CHAT_ID || "").trim(),
  };
}
