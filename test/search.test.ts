import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bestMatch, levenshtein, normalize, searchProducts } from "../src/search";

// Seed faylidan haqiqiy tovarlarni o'qiymiz, testlar ma'lumot bilan birga yashaydi
const seed = readFileSync(new URL("../migrations/0002_seed.sql", import.meta.url), "utf8");
const products = [...seed.matchAll(/\('([^']+)', '([^']+)', '(\[.*?\])', (\d+), '([^']+)'/g)].map((m) => ({
  id: m[1],
  name: m[2],
  aliases: JSON.parse(m[3]) as string[],
  price: Number(m[4]),
  category: m[5],
}));

const top = (q: string) => searchProducts(q, products)[0]?.product.id;

describe("normalize", () => {
  it("kirillni lotinga o'giradi va belgilarni tozalaydi", () => {
    expect(normalize("Рексона")).toBe("reksona");
    expect(normalize("Head & Shoulders!")).toBe("head shoulders");
    expect(normalize("o‘zbek  TILI")).toBe("ozbek tili");
  });

  it("levenshtein", () => {
    expect(levenshtein("rexona", "reksona")).toBe(2);
    expect(levenshtein("ariel", "ariel")).toBe(0);
  });
});

describe("searchProducts", () => {
  it("seed 18 ta tovar", () => {
    expect(products).toHaveLength(18);
  });

  it.each([
    ["3 ta reksona olaman", "rexona"],
    ["Рексона бор ми?", "rexona"],
    ["ariel bormi", "ariel"],
    ["ariyel 3kg", "ariel"],
    ["jilet kerak", "gillette"],
    ["хед энд шолдерс", "head"],
    ["Head & Shoulders narxi", "head"],
    ["tayd poroshok", "tide"],
    ["domestas", "domestos"],
    ["kolgeyt pasta", "colgate"],
    ["persel", "persil"],
    ["nivia dezodorant", "nivea"],
    ["garnyer", "garnier"],
  ])("%s → %s", (q, id) => {
    expect(top(q)).toBe(id);
  });

  it("umumiy so'z butun kategoriyani qaytaradi", () => {
    const ids = searchProducts("qanday shampunlar bor", products).map((h) => h.product.id);
    expect(ids).toEqual(expect.arrayContaining(["head", "clear", "pantene", "garnier"]));
    const ids2 = searchProducts("шампунь", products).map((h) => h.product.id);
    expect(ids2).toEqual(expect.arrayContaining(["head", "clear", "pantene", "garnier"]));
  });

  it("aniq nom umumiy so'zdan ustun", () => {
    expect(top("pantene shampun")).toBe("pantene");
    expect(top("persil poroshok")).toBe("persil");
  });

  it("aloqasiz so'rov hech narsa topmaydi", () => {
    expect(searchProducts("iphone 15", products)).toEqual([]);
    expect(searchProducts("", products)).toEqual([]);
  });

  it("bestMatch noaniq holatda null qaytaradi", () => {
    expect(bestMatch("ariel", products)?.id).toBe("ariel");
    expect(bestMatch("dezodorant", products)).toBeNull();
  });
});
