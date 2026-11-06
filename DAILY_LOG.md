# DAILY_LOG: Galmee Pharmacy

Newest entries first.

## 2026-11-06 (routine run 1, part 2: quality and security baseline)

Alpha's new `docs/FRONTEND.md`, `docs/SECURITY.md` and skills landed mid-run; merged them and brought today's work up to that standard before pushing.

Shipped:
- `docs/DESIGN.md`: dispensing-counter palette (dispensary green #0B5D4B, counter white, ink, shelf rules, expiry red/amber; contrast checked: 7.8, 15.3, 6.6, 5.2:1), Atkinson Hyperlegible Next + Noto Sans Ethiopic, 360 px wireframes, the "expiry label" as the one bold element, review against generic defaults. Tokens applied in `globals.css`; fonts self-hosted with `next/font/local`; flat cards, green header bar, 48 px tap targets.
- Security: `src/server/dal/` (`server-only`) for all Supabase access, returning small DTOs; zod validation in every Server Action (login, signup, onboarding, setLocale); onboarding action re-checks the user itself; password minimum 10; Ethiopian phone validation. Inactive profiles are signed out.
- Headers: per-request CSP nonce in `src/proxy.ts` (`connect-src` limited to self + Supabase https/wss, `frame-ancestors 'none'`), plus HSTS, nosniff, Referrer-Policy, Permissions-Policy (camera self only), X-Frame-Options, no `X-Powered-By`; `experimental.taint` on. Checked with `curl -I` on `next start`: all present.
- `npm run screenshots` (`scripts/screenshots.cjs`, Playwright): 360 and 1280 px, am and en, fails on console errors (incl. CSP violations) or horizontal scroll. Screenshots in `docs/screenshots/`. Logged-in screens need a demo account (`SHOT_EMAIL`/`SHOT_PASSWORD`), not available yet.
- Web Interface Guidelines review (fetched from vercel-labs): added skip link, `<h1>` on auth pages, `spellCheck`/`autoCapitalize` off on email, hint linked with `aria-describedby`, `aria-busy` on submit, `translate="no"` on the brand, `touch-action: manipulation`, tabular numbers, reduced-motion rule.

Checks: `npm run lint` clean, `npm run build` ok, `npm test` 14/14, `npm audit --omit=dev` 0 vulnerabilities, secret grep on staged diff prints nothing. Server action + locale switch tested in Chromium under the CSP with no console errors. No database changes, so no RLS test or advisors run needed this time.

Self-audit (SECURITY.md section 9):
- Every database call inside the `server-only` DAL? Yes (`src/server/dal/session.ts`, `auth.ts`, `tenant.ts`; proxy only refreshes the session).
- `"use client"` components receive more data than they render? No: client components get only labels/props they show (nav, switcher, form fields).
- Every Server Action validates input, re-checks auth/role, returns minimal data? Yes for all four; none touch tenant records yet beyond `create_tenant`, which the core RPC scopes to the caller.
- `[param]` routes validated? None exist yet.
- Cross-tenant RLS test for touched tables? No `ph_` tables yet; core test passed per `supabase/core/README.md`.
- Advisors zero warnings on own objects? No own objects yet.

Not done from the Q list: cross-tenant RLS test for `ph_` tables (comes with the first migration).

## 2026-11-06 (routine run 1)

Shipped (M0 foundation, 8 of 9 items):
- Next.js 16.4 App Router + TypeScript + Tailwind v4 scaffold; shadcn-style UI primitives (Button, Input, Label, Card) in `src/components/ui` with `components.json`. Cache Components left off for now (simpler auth + cookie-based i18n).
- Supabase: browser/server clients via `@supabase/ssr`, `src/proxy.ts` (Next 16 name for middleware) refreshes the session and sends logged-out users to `/login`.
- Auth: email + password sign up / log in / log out; `/onboarding` calls core `create_tenant` (vertical `pharmacy`) when the user has no profile yet (works with or without email confirmation).
- i18n: next-intl (no URL prefix, locale in a cookie), `am` default, `om`, `en`; language switcher; Noto Sans Ethiopic bundled locally (`@fontsource`, works offline). Test checks all three message files have the same keys.
- Ethiopian calendar helper `src/lib/ethiopian-date.ts` (JDN conversion, month names in 3 languages, Addis Ababa timezone, `daysBetween` for expiry) with vitest tests (`npm test`), incl. a 16-year round trip.
- PWA: manifest, icons (192/512/maskable/apple), `public/sw.js` offline shell (network-first pages, cache-first static, `/offline` fallback).
- App shell: bottom tab bar on phones (Home, Sell, Stock, Credit, Reports), sidebar on desktop, tenant name/logo, user name and role. Placeholder screens for the four tabs.
- `src/lib/database.types.ts` generated from the live schema (core only; no `ph_` tables yet).
- Checked: `npm run lint`, `npm run build`, `npm test` pass; smoke-tested `next start` (redirects, locale cookie, wrong-password error from Supabase) at 360px width with no horizontal scroll.

Not yet verified: PWA install on a real Android phone (needs the Vercel URL).

No database migrations this run.

Next: `ph_suppliers` / `ph_purchase_orders` / `ph_purchase_lines` migrations with the extended cross-tenant RLS test and advisors, then staff management and the stock list with expiry labels.

Blockers: none hard. See NEEDS_APPROVAL.md (Supabase Auth URLs, phone login, translation review).

## 2026-11-06

- Repo created. Shared Supabase project `galmee` live with core schema (tenants, roles, customers, stock, sales, credit, bookings, audit). Next: M0 foundation.
