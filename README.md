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

## פריסה ל־Cloudflare Pages / Workers

1. חיבור GitHub לריפו [`Avner-Hilu/halcontoro`](https://github.com/Avner-Hilu/halcontoro)
2. Build command: `npm run build`
3. Deploy command: `npx wrangler deploy`
4. משתני סביבה בבילד (Secrets / Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Supabase

1. הריצו את הקובץ `supabase/migrations/001_profiles.sql` ב־SQL Editor
2. Authentication → Providers → הפעילו **Anonymous** (לאורחים)
3. Authentication → URL Configuration → הוסיפו ל־Redirect URLs:
   - `http://localhost:3000/account`
   - `https://YOUR-DEPLOY-URL/account`
4. העתיקו URL + publishable key לקובץ `apps/web/.env.local` (ראו `.env.example`)

## קרדיט

הומצא בידי Amit Hilu.
