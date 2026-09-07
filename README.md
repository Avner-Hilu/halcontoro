# HALCON-TORO

משחק אסטרטגיה לשני שחקנים. Web MVP — משחק מקומי, מול AI, והדרכה.

## הרצה מקומית

```bash
npm install
npm test
npm run dev
```

פתחו http://localhost:3000

- **הדרכה** — `/play/tutorial`
- **מול מחשב** — `/play/ai`
- **מקומי לשניים** — `/play/local`

## מבנה

- `packages/engine` — מנוע חוקים טהור + AI + בדיקות
- `apps/web` — Next.js UI (static export לפריסה)

## פריסה ל־Cloudflare Pages

1. היכנסו ל־[Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. חברו את GitHub ובחרו את הריפו [`Avner-Hilu/halcontoro`](https://github.com/Avner-Hilu/halcontoro)
3. הגדרות בנייה:
   - **Framework preset:** `Next.js (Static HTML Export)` או `None`
   - **Build command:** `npm ci && npm run build`
   - **Build output directory:** `apps/web/out`
   - **Root directory:** `/` (שורש הריפו)
4. שמרו ופרסמו — תקבלו כתובת בסגנון `*.pages.dev`

כל push ל־`main` יבנה מחדש אוטומטית.

## קרדיט

הומצא בידי Amit Hilu.
