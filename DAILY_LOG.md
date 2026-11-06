# DAILY_LOG: Galmee Pharmacy

Newest entries first.

## 2026-11-06 (routine run 1)

Shipped (M0 foundation, 8 of 9 items):
- Next.js 16.4 App Router + TypeScript + Tailwind v4 scaffold; shadcn-style UI primitives (Button, Input, Label, Card) in `src/components/ui` with `components.json`. Cache Components left off for now (simpler auth + cookie-based i18n).
- Supabase: browser/server clients via `@supabase/ssr`, `src/proxy.ts` (Next 16 name for middleware) refreshes the session and sends logged-out users to `/login`.
- Auth: email + password sign up / log in / log out; `/onboarding` calls core `create_tenant` (vertical `pharmacy`) when the user has no profile yet (works with or without email confirmation).
- i18n: next-intl (no URL prefix, locale in a cookie), `am` default, `om`, `en`; language switcher; Noto Sans Ethiopic bundled locally (`@fontsource`, works offline). Test checks all three message files have the same keys.
- Ethiopian calendar helper `src/lib/ethiopian-date.ts` (JDN conversion, month names in 3 languages, Addis Ababa timezone, `daysBetween` for expiry) with 13 vitest tests (`npm test`), incl. a 16-year round trip.
- PWA: manifest, icons (192/512/maskable/apple), `public/sw.js` offline shell (network-first pages, cache-first static, `/offline` fallback).
- App shell: bottom tab bar on phones (Home, Sell, Stock, Credit, Reports), sidebar on desktop, tenant name/logo, user name and role. Placeholder screens for the four tabs.
- `src/lib/database.types.ts` generated from the live schema (core only; no `ph_` tables yet).
- Checked: `npm run lint`, `npm run build`, `npm test` pass; smoke-tested `next start` (redirects, locale cookie, wrong-password error from Supabase) at 360px width with no horizontal scroll.

Not yet verified: PWA install on a real Android phone (needs the Vercel URL).

No database migrations this run.

Next: staff management (owner invites staff, sets role), then M1 items list/stock + expiry colours, and the `ph_suppliers` / `ph_purchase_orders` / `ph_purchase_lines` migrations.

Blockers: none hard. See NEEDS_APPROVAL.md (Supabase Auth URLs, phone login, translation review).

## 2026-11-06

- Repo created. Shared Supabase project `galmee` live with core schema (tenants, roles, customers, stock, sales, credit, bookings, audit). Next: M0 foundation.
