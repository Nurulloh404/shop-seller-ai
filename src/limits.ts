export interface LimitState {
  is_out: number;
  daily_limit: number;
  sold_today: number;
}

export type AddDecision = { kind: "out" } | { kind: "ok" } | { kind: "confirm" };
export type StockStatus = "available" | "needs_confirmation" | "out";

export function remaining(p: LimitState): number {
  return p.is_out ? 0 : Math.max(0, p.daily_limit - p.sold_today);
}

/** Savatga qo'shishdan oldin: AI o'zi sotadimi, sotuvchidan so'raydimi yoki tovar yo'qmi */
export function decideAdd(p: LimitState, qty: number): AddDecision {
  if (!Number.isInteger(qty) || qty < 1) throw new Error("qty musbat butun son bo'lishi kerak");
  if (p.is_out) return { kind: "out" };
  if (p.sold_today + qty <= p.daily_limit) return { kind: "ok" };
  return { kind: "confirm" };
}

export function stockStatus(p: LimitState): StockStatus {
  if (p.is_out) return "out";
  return remaining(p) > 0 ? "available" : "needs_confirmation";
}

/** Sotuvchi "Bor" deganda yangi limit: so'ralgan miqdor + yana bir kunlik zaxira */
export function limitAfterApproval(p: LimitState, qty: number, dailyLimit: number): number {
  return Math.max(p.daily_limit, p.sold_today + qty + dailyLimit);
}

export function deliveryFor(subtotal: number, freeFrom: number, price: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= freeFrom ? 0 : price;
}

export function freeDeliveryLeft(subtotal: number, freeFrom: number): number {
  return Math.max(0, freeFrom - subtotal);
}

/** Qayta xarid eslatmasi necha kundan keyin (null: eslatma yo'q) */
const REPEAT_DAYS: Record<string, number> = {
  poroshok: 25,
  shampun: 30,
  gel: 30,
  dezodorant: 40,
  idish: 20,
  tozalash: 30,
  sovun: 20,
};

export function repeatDays(category: string): number | null {
  return REPEAT_DAYS[category] ?? null;
}
