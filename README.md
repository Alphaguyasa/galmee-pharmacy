# Galmee Pharmacy

See which drugs expire next month and how much money is sitting in them.

Part of **Galmee**, business systems for Ethiopian businesses, by Alpha. Mobile-first PWA in Amharic, Afaan Oromo and English.

- Frontend: Next.js + Tailwind (PWA, offline)
- Backend: Supabase (shared project `galmee`), Postgres RLS per business
- Payments: Chapa (Telebirr, CBE Birr); SMS: AfroMessage; alerts: Telegram

See `ROADMAP.md` for progress.

## Development

```bash
cp .env.example .env.local   # publishable values only
npm install
npm run dev      # http://localhost:3000
npm test         # vitest (Ethiopian calendar, message keys)
npm run lint
npm run build
```

Env vars (Vercel too): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Secrets (Telegram, AfroMessage, Chapa) live only in Supabase Edge Function secrets.

Layout: `src/app/(auth)` login/signup, `src/app/(app)` logged-in screens with the app shell, `src/actions` server actions, `src/lib/supabase` clients, `src/lib/ethiopian-date.ts` calendar, `messages/*.json` translations (`am` default).

Screenshots (the frontend guidelines step 3): `npm run build && npx next start -p 3123 &` then `npm run screenshots` (needs Playwright + Chromium).

Design system: `docs/DESIGN.md`. Security rules: the security guidelines. Server-side data access only through `src/server/dal/`.
