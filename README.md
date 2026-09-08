# HALCON-TORO

משחק אסטרטגיה לשני שחקנים. Web MVP — משחק מקומי, מול AI, הדרכה, וחדרים אונליין.

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
- **אונליין** — `/play/online` (דורש התחברות)

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

1. הריצו ב־SQL Editor (בסדר הזה):
   - `supabase/migrations/001_profiles.sql`
   - `supabase/migrations/002_rooms.sql` (חדרים אונליין + Realtime)
2. Authentication → Providers:
   - **Email** — מופעל (התחברות/הרשמה עם סיסמה; אפשר לכבות “Confirm email” בביטא כדי להיכנס מיד)
   - **Google** — הפעילו והזינו Client ID + Client Secret מ־Google Cloud Console
   - **Anonymous** — לאורחים
3. Authentication → URL Configuration:
   - **Site URL** = כתובת האתר החי (לא localhost בפריסה)
   - Redirect URLs:
     - `http://localhost:3000/account`
     - `https://YOUR-DEPLOY-URL/account`
     - (אופציונלי) `http://localhost:3000/**` ו־`https://YOUR-DEPLOY-URL/**`
4. ב־Google Cloud → OAuth client: Authorized redirect URI של Supabase  
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
5. Database → Publications / Realtime: ודאו ש־`rooms` ו־`games` בפרסום `supabase_realtime`
6. העתיקו URL + publishable key לקובץ `apps/web/.env.local` (ראו `.env.example`)

## קרדיט

הומצא בידי Amit Hilu.
