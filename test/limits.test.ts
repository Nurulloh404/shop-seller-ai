import { describe, expect, it } from "vitest";
import { decideAdd, deliveryFor, freeDeliveryLeft, limitAfterApproval, remaining, repeatDays, stockStatus } from "../src/limits";

const p = (sold: number, limit = 5, out = 0) => ({ sold_today: sold, daily_limit: limit, is_out: out });

describe("decideAdd", () => {
  it("limit ichida AI o'zi sotadi", () => {
    expect(decideAdd(p(0), 1)).toEqual({ kind: "ok" });
    expect(decideAdd(p(2), 3)).toEqual({ kind: "ok" });
  });

  it("limitga aniq teng bo'lsa ham sotadi", () => {
    expect(decideAdd(p(4), 1)).toEqual({ kind: "ok" });
    expect(decideAdd(p(0), 5)).toEqual({ kind: "ok" });
  });

  it("limitdan oshsa sotuvchidan so'raydi", () => {
    expect(decideAdd(p(5), 1)).toEqual({ kind: "confirm" });
    expect(decideAdd(p(3), 3)).toEqual({ kind: "confirm" });
    expect(decideAdd(p(0), 6)).toEqual({ kind: "confirm" });
  });

  it("tugagan tovarni sotmaydi, limit bo'lsa ham", () => {
    expect(decideAdd(p(0, 5, 1), 1)).toEqual({ kind: "out" });
  });

  it("noto'g'ri miqdorni rad etadi", () => {
    expect(() => decideAdd(p(0), 0)).toThrow();
    expect(() => decideAdd(p(0), 1.5)).toThrow();
    expect(() => decideAdd(p(0), -2)).toThrow();
  });
});

describe("holat va qoldiq", () => {
  it("remaining va stockStatus", () => {
    expect(remaining(p(2))).toBe(3);
    expect(remaining(p(7))).toBe(0);
    expect(remaining(p(0, 5, 1))).toBe(0);
    expect(stockStatus(p(2))).toBe("available");
    expect(stockStatus(p(5))).toBe("needs_confirmation");
    expect(stockStatus(p(0, 5, 1))).toBe("out");
  });

  it("sotuvchi tasdiqlagach limit so'ralgan miqdor + bir kunlik zaxiraga oshadi", () => {
    const after = limitAfterApproval(p(5), 3, 5);
    expect(after).toBe(13);
    expect(decideAdd({ ...p(5), daily_limit: after }, 3)).toEqual({ kind: "ok" });
  });

  it("limitni hech qachon kamaytirmaydi", () => {
    expect(limitAfterApproval(p(0, 20), 1, 5)).toBe(20);
  });
});

describe("ikki mijoz bir vaqtda", () => {
  // db.reserve SQL shartini (sold_today + qty <= daily_limit) taqlid qiladi
  function reserveSim(state: { sold_today: number; daily_limit: number; is_out: number }, qty: number) {
    if (state.is_out || state.sold_today + qty > state.daily_limit) return false;
    state.sold_today += qty;
    return true;
  }

  it("limitdan ortig'i band qilinmaydi", () => {
    const state = p(3);
    const a = reserveSim(state, 2);
    const b = reserveSim(state, 2);
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(state.sold_today).toBe(5);
  });
});

describe("yetkazish", () => {
  it("chegaradan oshsa bepul", () => {
    expect(deliveryFor(150000, 150000, 15000)).toBe(0);
    expect(deliveryFor(149000, 150000, 15000)).toBe(15000);
    expect(deliveryFor(0, 150000, 15000)).toBe(0);
    expect(freeDeliveryLeft(98000, 150000)).toBe(52000);
    expect(freeDeliveryLeft(200000, 150000)).toBe(0);
  });

  it("qayta xarid muddatlari", () => {
    expect(repeatDays("poroshok")).toBe(25);
    expect(repeatDays("shampun")).toBe(30);
    expect(repeatDays("ustara")).toBeNull();
  });
});
