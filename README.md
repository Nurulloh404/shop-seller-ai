# Shop Seller AI: do'kon uchun AI sotuvchi Telegram bot

Maishiy kimyo va kosmetika do'koni (shampun, gel, dezodorant, poroshok…) uchun Telegram bot. Mijozlarga 24/7 javob beradi, narx va bor-yo'qlikni aytadi, buyurtma qabul qiladi, tovari tugaganlarga o'xshashini taklif qiladi va qayta xarid haqida eslatadi.

**Ombor tizimi kerak emas.** Har tovarga kunlik limit beriladi (standart 5 dona):

- limit ichida bot o'zi sotadi;
- limitdan oshsa, sotuvchiga `✅ Bor / ❌ Yo'q` tugmali so'rov boradi;
- tovar tugasa, sotuvchi faqat "Tugadi" tugmasini bosadi;
- har kuni 06:00 da (Toshkent vaqti) limitlar yangilanadi.

## Texnologiyalar

| Qism | Nima |
|---|---|
| Server | Cloudflare Workers (TypeScript) |
| Baza | Cloudflare D1 (`dokon-bot`) |
| Telegram | grammY, webhook |
| AI | OpenRouter (tool calling), model `wrangler.toml` da |
| Rejalashtirish | Cron Triggers: har 10 daqiqa va har kuni 01:00 UTC |

Bot narx va bor-yo'qlikni **faqat bazadan** oladi, AI o'zidan narx to'qimaydi. OpenRouter ishlamay qolsa, mijoz "sotuvchi javob beradi" degan xabarni oladi, sotuvchiga esa ogohlantirish boradi.

## Joylashtirish (10 daqiqa)

D1 baza allaqachon yaratilgan, jadvallar va 18 ta namuna tovar kiritilgan (`database_id` `wrangler.toml` da). Sizga quyidagilar qoladi.

### 1. Tayyorgarlik

- **Bot tokeni:** Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni saqlang.
- **OpenRouter kaliti:** [openrouter.ai/keys](https://openrouter.ai/keys) → kalit yarating, hisobni ozgina to'ldiring.
- **Webhook siri:** istalgan uzun tasodifiy satr (faqat harf va raqam), masalan parol generatoridan 40 ta belgi.

### 2. O'rnatish

```bash
git clone https://github.com/Nurulloh404/shop-seller-ai.git
cd shop-seller-ai
npm install
npx wrangler login          # brauzer ochiladi, Cloudflare'ga kirasiz
```

### 3. Sirlarni qo'yish

Har bir buyruq qiymat so'raydi, uni kiritib Enter bosasiz:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SELLER_CHAT_ID      # hozircha 0 kiriting, 6-qadamda almashtirasiz
```

### 4. Deploy

```bash
npm run deploy
```

Oxirida `https://dokon-bot.<sizning-subdomain>.workers.dev` manzili chiqadi. Brauzerda ochsangiz "ishlayapti ✅" yozuvi ko'rinadi.

### 5. Webhook

```bash
cp .dev.vars.example .dev.vars   # ichiga token va webhook sirini yozing (3-qadamdagi bilan bir xil)
npm run set-webhook -- https://dokon-bot.<sizning-subdomain>.workers.dev
```

### 6. Sotuvchini ulash

1. Sotuvchi botga `/id` yozadi (yoki botni sotuvchilar guruhiga qo'shib, guruhda `/id` yoziladi).
2. Chiqqan raqamni qo'ying: `npx wrangler secret put SELLER_CHAT_ID`
3. Sotuvchi `/start` yozadi, buyruqlar ro'yxati chiqadi.

Tayyor. Boshqa akkauntdan botga "ariel bormi?" deb yozib sinab ko'ring.

## Sotuvchi buyruqlari

| Buyruq | Nima qiladi |
|---|---|
| `/tovarlar` | Ro'yxat, qolgan limit, har tovarda Tugadi/Keldi tugmasi |
| `/tugadi ariel` | Tovar tugadi, bot o'xshashini taklif qiladi |
| `/keldi ariel` | Tovar yana sotuvda |
| `/narx ariel 99000` | Narxni o'zgartirish |
| `/qosh Sensodyne pasta 75 ml ; 32000 ; gigiyena` | Yangi tovar qo'shish |
| `/hisobot` | Bugun: yozganlar, sotib olganlar, konversiya, tushum |
| `/buyurtmalar` | Ochiq buyurtmalar: Qabul / Yetkazildi / Bekor |
| Bot xabariga **Reply** | Javob mijozga yetkaziladi |

Avtomatik keladigan xabarlar: har yangi buyurtma, limitdan oshgan so'rovlar (10 daqiqada javob bo'lmasa qayta eslatiladi), AI javob bera olmagan savollar, mijoz yuborgan rasm yoki ovozli xabarlar, har kuni ertalab kechagi hisobot.

## Mijoz uchun avtomatik eslatmalar

- **Tashlab ketilgan savat:** 3 soat ichida rasmiylashtirilmasa, ertasi kuni 10:00 da bitta eslatma boradi.
- **Qayta xarid:** poroshok 25 kun, shampun va gel 30 kun, dezodorant 40 kun, idish yuvish va sovun 20 kundan keyin.
- Eslatmalar faqat 09:00–21:00 oralig'ida yuboriladi.

## Sozlamalar (`wrangler.toml` → `[vars]`)

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Tool calling'ni qo'llaydigan istalgan model |
| `DAILY_LIMIT` | `5` | Har tovarga kunlik limit |
| `FREE_DELIVERY_FROM` | `150000` | Shu summadan yetkazish bepul |
| `DELIVERY_PRICE` | `15000` | Yetkazish narxi |
| `SHOP_NAME` | `Do'kon` | Salomlashishda ishlatiladi |

O'zgartirgach, `npm run deploy` qiling.

## Taxminiy xarajat

- **Cloudflare Workers va D1:** bepul tarif yetadi (Workers kuniga 100 000 so'rov).
- **OpenRouter:** `gpt-4o-mini` bilan bitta suhbat taxminan 1 sent atrofida. Kuniga 40 suhbat bo'lsa, oyiga taxminan 10–15 dollar. Aniq narxlarni [openrouter.ai/models](https://openrouter.ai/models) da tekshiring.

## Ishlab chiqish

```bash
npm test            # limit, qidiruv va AI tsikli testlari
npm run typecheck
npm run dev         # lokal: wrangler dev (.dev.vars kerak)
```

Lokal test uchun Telegram webhook'ini `cloudflared tunnel --url http://localhost:8787` manziliga yo'naltiring.

### Tuzilma

```
src/
  index.ts      webhook + cron kirish nuqtasi
  bot.ts        mijoz va sotuvchi handlerlari
  llm.ts        OpenRouter tool-calling tsikli
  tools.ts      AI chaqiradigan toollar (qidiruv, savat, buyurtma)
  limits.ts     kunlik limit mantiqi (sof funksiyalar)
  search.ts     lotin/kirill, xato yozuvlarga chidamli qidiruv
  db.ts         D1 so'rovlari
  cron.ts       eslatmalar, kunlik reset va hisobot
  prompts.ts    AI tizim prompti
migrations/     sxema va namuna tovarlar
demo/           do'kon egasiga ko'rsatish uchun interaktiv demo sahifa
docs/           dastlabki texnik topshiriq
```

Baza boshqa akkauntda kerak bo'lsa: `npx wrangler d1 create dokon-bot`, yangi `database_id` ni `wrangler.toml` ga yozing va `npm run db:migrate` ni ishga tushiring.

## Keyingi qadamlar

- Sotuvchi prays-list yoki nakladnoy rasmini yuboradi, vision model tovar va narxlarni o'qib bazaga qo'shadi (tasdiqlash bilan).
- Telegram Business orqali botni do'konning shaxsiy akkauntiga ulash.
- Instagram Direct integratsiyasi.
- Sotuvchi uchun oddiy veb-panel.
