export interface SearchableProduct {
  id: string;
  name: string;
  aliases: string[];
  category: string;
}

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/** Umumiy so'zlar: aniq tovar emas, kategoriya darajasida moslik beradi */
const GENERIC = new Set([
  "shampun", "shampon", "poroshok", "kukun", "dezodorant", "dezik", "gel", "sovun", "pasta",
  "idish", "konditsioner", "kondisioner", "ustara", "britva", "unitaz", "xlor", "yumshatuvchi",
  "tish pastasi", "idish yuvish", "dush geli", "milo", "stanok",
]);

/** Kirillni lotinga o'giradi, apostroflar va belgilarni olib tashlaydi, kichik harf qiladi */
export function normalize(s: string): string {
  const lower = s.toLowerCase();
  let out = "";
  for (const ch of lower) out += CYR[ch] ?? ch;
  return out
    .replace(/[‘’`ʻʼ']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function fuzzyEq(token: string, word: string): boolean {
  if (token === word) return true;
  if (token.length < 4 || word.length < 4) return false;
  const allowed = word.length >= 7 ? 2 : 1;
  return levenshtein(token, word) <= allowed;
}

/** O'zbekcha qo'shimchalar: "arielni", "shampunlar", "rexonadan" -> asos so'z ham qidiriladi */
const SUFFIXES = ["larni", "larga", "lardan", "larning", "lar", "ning", "dan", "ni", "ga", "mi", "chi", "ingiz", "im"];

function expandTokens(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const suf of SUFFIXES) {
      if (t.endsWith(suf) && t.length - suf.length >= 3) out.add(t.slice(0, -suf.length));
    }
  }
  return [...out];
}

function containsPhrase(query: string, phrase: string): boolean {
  return (" " + query + " ").includes(" " + phrase + " ");
}

export interface SearchHit<T> {
  product: T;
  score: number;
}

/**
 * Mijoz matnidan tovarlarni topadi. Aniq nom/alias yuqori ball oladi,
 * umumiy so'z (shampun, poroshok) esa butun kategoriyani past ball bilan qaytaradi.
 */
export function searchProducts<T extends SearchableProduct>(query: string, products: T[]): SearchHit<T>[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = expandTokens(q.split(" "));
  const hits: SearchHit<T>[] = [];

  for (const p of products) {
    let score = 0;
    const terms = [p.name, ...p.aliases].map(normalize).filter(Boolean);

    for (const term of terms) {
      const generic = GENERIC.has(term);
      if (term.includes(" ")) {
        if (containsPhrase(q, term)) score = Math.max(score, generic ? 4 : 12 + term.length / 10);
        continue;
      }
      for (const t of tokens) {
        if (t === term) score = Math.max(score, generic ? 4 : 10);
        else if (!generic && fuzzyEq(t, term)) score = Math.max(score, 6);
      }
    }

    const cat = normalize(p.category);
    for (const t of tokens) {
      if (t === cat || fuzzyEq(t, cat)) score = Math.max(score, 4);
    }

    if (score > 0) hits.push({ product: p, score });
  }

  return hits.sort((a, b) => b.score - a.score);
}

/** Bitta aniq tovar kerak bo'lganda (sotuvchi buyruqlari): eng yuqori va raqobatchisiz natija */
export function bestMatch<T extends SearchableProduct>(query: string, products: T[]): T | null {
  const hits = searchProducts(query, products);
  if (!hits.length) return null;
  if (hits.length > 1 && hits[0].score === hits[1].score && hits[0].score < 10) return null;
  return hits[0].product;
}
