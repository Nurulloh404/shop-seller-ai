# Vazifa: Maishiy kimyo do'koni uchun AI sotuvchi Telegram bot (MVP)

Menga Cloudflare Workers'da ishlaydigan, OpenRouter orqali LLM ishlatadigan Telegram bot qurib ber. Bot maishiy kimyo va kosmetika do'konining (shampun, gel, dezodorant, poroshok va h.k.) onlayn mijozlariga javob beradi va buyurtma qabul qiladi.

Kodni yozishdan oldin qisqa reja tuz, keyin bosqichma-bosqich amalga oshir. Har bosqich oxirida `npx tsc --noEmit` va testlarni ishga tushir.

## Biznes muammosi (kontekst)

- Kuniga ~40 kishi yozadi, faqat ~10 tasi sotib oladi. Asosiy sabab: javob kech keladi, "bormi?" savoliga aniq javob yo'q.
- Do'konda ombor tizimi YO'Q va bo'lmaydi. Egasi har tovarni kiritishni xohlamaydi (oldingi tizimni shu sabab tashlagan).
- Yechim: **kunlik limit modeli**. Har tovarga kuniga 5 dona limit beriladi. Limit ichida bot o'zi sotadi. Limitdan oshsa, sotuvchidan Telegram orqali bir bosishda tasdiq so'raydi. Tovar tugasa, sotuvchi faqat "Tugadi" bosadi.

## Texnologiyalar

- **Cloudflare Workers** (TypeScript), `wrangler` bilan deploy
- **grammY** kutubxonasi (Workers'da ishlaydi, `webhookCallback(bot, "cloudflare-mod")`)
- **Cloudflare D1** (SQLite) — barcha ma'lumotlar uchun
- **Cron Triggers** — kunlik limitni tiklash va eslatmalar
- **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`, OpenAI-mos format) — tool calling bilan
- Model env orqali tanlanadi: `OPENROUTER_MODEL` (tool calling'ni qo'llaydigan model bo'lishi shart; standart qiymat sifatida arzon va tez modelni qo'y, men keyin almashtiraman)
- Testlar uchun **vitest** (`@cloudflare/vitest-pool-workers` yoki oddiy unit testlar)

## Sirlar va sozlamalar

`wrangler secret put` orqali:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (webhook so'rovlarida `X-Telegram-Bot-Api-Secret-Token` sarlavhasi bilan tekshiriladi, mos kelmasa 401)
- `OPENROUTER_API_KEY`

`wrangler.toml` vars:
- `OPENROUTER_MODEL`
- `SELLER_CHAT_ID` (sotuvchi yoki sotuvchilar guruhi chat ID)
- `DAILY_LIMIT = 5`
- `FREE_DELIVERY_FROM = 150000`
- `DELIVERY_PRICE = 15000`
- `TIMEZONE = "Asia/Tashkent"`

Hech qanday kalitni kodga yoki git'ga yozma. `.dev.vars.example` fayl yarat.

## D1 sxemasi (migratsiya fayl sifatida)

- `products`: id, name, aliases (JSON massiv: mijozlar yozadigan variantlar, lotin va kirill), price, category, alt_product_id (tugasa taklif qilinadigan o'xshash tovar), is_out (0/1), daily_limit, sold_today, active
- `customers`: telegram_id, name, username, phone, address, created_at, last_seen_at
- `carts`: customer_id, product_id, qty
- `orders`: id, customer_id, items (JSON), subtotal, delivery, total, status (new/confirmed/delivered/cancelled), address, phone, created_at
- `pending_confirmations`: id, customer_id, product_id, qty, seller_message_id, status (waiting/approved/rejected), created_at
- `reminders`: id, customer_id, send_at, text, type (abandoned/repeat), sent (0/1)
- `messages`: customer_id, role, content, created_at (oxirgi 20 ta xabarni kontekst uchun saqlash)
- `daily_stats`: date, chats, buyers, orders, revenue

## Mijoz bilan suhbat (LLM qismi)

Tizim prompti talablari:
- Til: mijoz qaysi tilda yozsa, shunda javob ber (o'zbek lotin, o'zbek kirill yoki rus). Standart: o'zbek lotin.
- Qisqa, samimiy, sotuvchidek gapir. 3–4 qatordan oshmasin.
- **Narx, bor-yo'qlik va tovar nomini HECH QACHON o'zing to'qima.** Faqat tool natijalaridan foydalan. Tool topa olmasa: "Aniqlab, sotuvchi 5 daqiqada javob beradi" de va `notify_seller` chaqir.
- Har buyurtmada bepul yetkazish chegarasigacha qancha qolganini ayt va mos tovar taklif qil (upsell), lekin tiqishtirma.
- Mijoz "o'ylab ko'raman" desa, bosim qilma.

Toollar (OpenAI function calling formatida, har biri D1 bilan ishlaydigan TS funksiya):
1. `search_products(query)` — nom va aliases bo'yicha noaniq qidiruv (katta-kichik harf, lotin/kirill, xatoli yozuvlar: "reksona", "jilet"). Har natijada: id, name, price, status (`available` / `needs_confirmation` / `out`), alt tovar.
2. `add_to_cart(product_id, qty)` — limit mantiqi shu yerda (pastga qara).
3. `view_cart()` — savat, jami, yetkazish narxi.
4. `remove_from_cart(product_id)`
5. `checkout(address, phone)` — buyurtma yaratadi, sotuvchiga yuboradi, 25 kundan keyin qayta xarid eslatmasini (poroshok, shampun kabi tugaydigan tovarlar uchun) rejalashtiradi.
6. `delivery_info()` — shartlar.
7. `notify_seller(text)` — tushunarsiz savolni sotuvchiga yo'naltiradi.

Tool-calling tsikli: modelga javob, tool chaqiruvlarini bajar, natijani qaytar, yakuniy javobni ol. Maksimum 5 iteratsiya. OpenRouter xato bersa yoki timeout (15 s) bo'lsa, mijozga "Bir daqiqa, sotuvchi javob beradi" deb yoz va sotuvchiga xabar yubor. Bot hech qachon jim qolmasin.

## Limit mantiqi (eng muhim qism, testlar bilan)

`add_to_cart(product, qty)`:
- `is_out = 1` bo'lsa → rad et, `alt_product_id` ni taklif qil.
- `sold_today + qty <= daily_limit` bo'lsa → savatga qo'sh, `sold_today` ni oshir (buyurtma bekor bo'lsa yoki savat 24 soatda rasmiylashtirilmasa, qaytar).
- Aks holda → `pending_confirmations` yarat, sotuvchiga inline tugmali xabar yubor: `[✅ Bor] [❌ Yo'q]`. Mijozga "Omborni tekshiryapman, 2–3 daqiqa" de.
  - ✅ bosilsa: `daily_limit` ga `DAILY_LIMIT` qo'sh, tovarni savatga qo'sh, mijozga xabar ber.
  - ❌ bosilsa: `is_out = 1`, mijozga alt tovarni taklif qil.
  - 10 daqiqada javob bo'lmasa: sotuvchiga qayta eslat.

Bu mantiqni LLM'dan mustaqil sof funksiya qilib yoz va vitest bilan to'liq test qil (limit chegarasi, bir vaqtda ikki mijoz, tugagan tovar, tasdiq/rad).

## Sotuvchi tomoni (faqat `SELLER_CHAT_ID` dan qabul qilinadi)

Buyruqlar:
- `/tovarlar` — ro'yxat, har birida qolgan limit va inline `[Tugadi]` / `[Keldi]` tugmalari
- `/tugadi <nom>` va `/keldi <nom>` — noaniq qidiruv bilan
- `/narx <nom> <summa>` — narxni o'zgartirish
- `/qosh <nom> <narx>` — yangi tovar
- `/hisobot` — bugun: nechta yozdi, nechta sotib oldi, konversiya %, tushum
- `/buyurtmalar` — yangi buyurtmalar, `[Tasdiqlash] [Yetkazildi] [Bekor]` tugmalari

Har yangi buyurtma sotuvchiga darhol keladi: mijoz ismi, telefon, manzil, tovarlar, jami.

## Cron vazifalari

- Har kuni 06:00 Toshkent (01:00 UTC): barcha `sold_today = 0`, `daily_limit = DAILY_LIMIT` ga qaytar, kechagi `daily_stats` ni sotuvchiga yubor.
- Har soat: vaqti kelgan `reminders` ni yubor (faqat 09:00–21:00 Toshkent oralig'ida).
- Savatga tovar qo'shib, 3 soat ichida rasmiylashtirmagan mijozga ertasi kuni 10:00 da bitta eslatma (bittadan ko'p emas, spam qilma).

## Mock data (seed migratsiya)

`seed.sql` yarat. Aliases'ga lotin, kirill va keng tarqalgan xato yozuvlarni qo'sh.

| id | nom | narx (so'm) | kategoriya | alt |
|---|---|---|---|---|
| ariel | Ariel poroshok 3 kg | 98000 | poroshok | persil |
| persil | Persil poroshok 3 kg | 92000 | poroshok | ariel |
| tide | Tide poroshok 3 kg | 86000 | poroshok | ariel |
| head | Head & Shoulders 400 ml | 54000 | shampun | clear |
| clear | Clear shampun 400 ml | 49000 | shampun | head |
| pantene | Pantene shampun 400 ml | 52000 | shampun | garnier |
| garnier | Garnier Fructis 400 ml | 47000 | shampun | pantene |
| rexona | Rexona dezodorant | 38000 | dezodorant | nivea |
| nivea | Nivea dezodorant | 42000 | dezodorant | rexona |
| palmolive | Palmolive dush geli | 33000 | gel | — |
| fairy | Fairy 500 ml | 24000 | idish | cif |
| domestos | Domestos 1 l | 32000 | tozalash | cif |
| cif | Cif krem 500 ml | 29000 | tozalash | domestos |
| lenor | Lenor konditsioner 1 l | 45000 | kir yuvish | — |
| colgate | Colgate tish pastasi 100 ml | 18000 | gigiyena | — |
| dove | Dove sovun 90 g | 14000 | sovun | safeguard |
| safeguard | Safeguard sovun 90 g | 11000 | sovun | dove |
| gillette | Gillette Blue II, 5 dona | 36000 | ustara | — |

Qayta xarid eslatmasi muddatlari (kun): poroshok 25, shampun 30, gel 30, dezodorant 40, idish 20, tozalash 30, sovun 20. Qolganlari uchun eslatma yo'q.

## Loyiha tuzilmasi

```
src/
  index.ts          // fetch (webhook) + scheduled (cron)
  bot.ts            // grammY: mijoz va sotuvchi handlerlari
  llm.ts            // OpenRouter klient + tool-calling tsikli
  tools.ts          // tool ta'riflari va implementatsiyalari
  limits.ts         // limit mantiqi (sof funksiyalar)
  search.ts         // noaniq qidiruv, lotin<->kirill transliteratsiya
  db.ts             // D1 so'rovlari
  prompts.ts        // tizim prompti
migrations/
  0001_init.sql
  0002_seed.sql
test/
  limits.test.ts
  search.test.ts
README.md
```

## README'da bo'lishi kerak

1. BotFather'da bot yaratish
2. `wrangler d1 create`, migratsiyalar, `wrangler secret put`
3. Deploy va webhook o'rnatish (`setWebhook` URL + `secret_token`) — buni bitta npm script qil: `npm run set-webhook`
4. Lokal test: `wrangler dev` + ngrok yoki cloudflared tunnel
5. `SELLER_CHAT_ID` ni qanday topish
6. Taxminiy xarajat: Workers bepul tarifi, D1 bepul tarifi, OpenRouter token narxi (bitta suhbatga taxminan qancha ketishini hisoblab ko'rsat)

## Keyingi bosqich (hozir qilma, faqat README'da "Keyingi qadamlar" bo'limiga yoz)

- Sotuvchi prays-list yoki nakladnoy rasmini yuboradi → vision model tovar va narxlarni o'qib `products` ga qo'shadi (tasdiqlash bilan)
- Telegram Business orqali botni do'konning shaxsiy akkauntiga ulash (mijozlar bot emas, do'konga yozayotgandek his qiladi)
- Instagram Direct integratsiyasi
- Sotuvchi uchun oddiy veb-panel

## Qabul mezonlari

- `npm test` barcha testlardan o'tadi
- `npx tsc --noEmit` xatosiz
- Mijoz "3 ta reksona olaman" yozsa, bot to'g'ri tovarni topadi, savatga qo'shadi, yetkazish chegarasini aytadi
- Limit tugagan tovarda sotuvchiga tugmali so'rov boradi, tugma bosilgach mijoz javob oladi
- Bot narxni hech qachon o'zi to'qimaydi (tizim promptida va tool natijalarida tekshir)
- OpenRouter ishlamay qolsa ham mijoz javobsiz qolmaydi
