import { describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/llm";
import type { ToolContext } from "../src/tools";
import { atTashkent, fmt, sqlUtc, tkDate, tkHour } from "../src/util";

const ctx = {
  env: { OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: "test/model" },
  s: { dailyLimit: 5, freeDeliveryFrom: 150000, deliveryPrice: 15000, shopName: "Test", sellerChatId: "1" },
  api: {},
  customer: { id: 42, name: "Aziz" },
} as unknown as ToolContext;

function reply(message: object) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
}

describe("runAgent (OpenRouter tool-calling tsikli)", () => {
  it("tool chaqiradi, natijani qaytaradi va yakuniy matnni oladi", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "delivery_info", arguments: "{}" } }] }),
      )
      .mockResolvedValueOnce(reply({ role: "assistant", content: "Yetkazish 15 000 so'm." }));

    const text = await runAgent(ctx, "sys", [], "yetkazasizmi?", fetchMock as unknown as typeof fetch);
    expect(text).toBe("Yetkazish 15 000 so'm.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    const toolMsg = second.messages.find((m: { role: string }) => m.role === "tool");
    expect(JSON.parse(toolMsg.content).free_from).toBe(150000);
    expect(second.tools.length).toBeGreaterThan(5);
  });

  it("OpenRouter xato bersa, xato tashlaydi (bot fallback javob beradi)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(runAgent(ctx, "sys", [], "salom", fetchMock as unknown as typeof fetch)).rejects.toThrow(/429/);
  });

  it("cheksiz tool tsikliga tushmaydi", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      reply({ role: "assistant", content: null, tool_calls: [{ id: "x", type: "function", function: { name: "delivery_info", arguments: "{}" } }] }),
    );
    await expect(runAgent(ctx, "sys", [], "salom", fetchMock as unknown as typeof fetch)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("util", () => {
  it("fmt", () => {
    expect(fmt(98000)).toBe("98 000");
    expect(fmt(1234567)).toBe("1 234 567");
    expect(fmt(500)).toBe("500");
  });

  it("Toshkent vaqti (UTC+5)", () => {
    const d = new Date("2026-09-29T20:30:00Z"); // Toshkentda 30-sentabr 01:30
    expect(tkDate(d)).toBe("2026-09-30");
    expect(tkHour(d)).toBe(1);
  });

  it("ertaga 10:00 Toshkent = 05:00 UTC", () => {
    const d = new Date("2026-09-29T12:00:00Z");
    expect(sqlUtc(atTashkent(1, 10, d))).toBe("2026-09-30 05:00:00");
  });
});
