# ROADMAP: Galmee Pharmacy

## M0: Foundation (shared pattern for all Galmee products)

- [x] Next.js App Router + TS + Tailwind + shadcn/ui scaffold; `npm run build` passes
- [x] PWA manifest, icons, offline shell; installs from Android Chrome
- [x] Supabase client (`@supabase/ssr`) with `.env.example` values; middleware session refresh
- [x] Auth: sign up, log in, log out; after first signup call `create_tenant` (vertical `pharmacy`)
- [x] next-intl with `am`, `om`, `en`; language switcher; Ethiopic-friendly font (Noto Sans Ethiopic)
- [x] Ethiopian calendar date display helper + tests
- [x] App shell: bottom navigation on mobile, sidebar on desktop, tenant name and logo
- [ ] Staff management (owner only): invite staff, set role
- [x] Generated Supabase TypeScript types committed

## M1: Core screens

- [ ] Customers: list, search by name/phone, detail with balance
- [ ] Items and stock (if this product uses stock): list, add, receive stock
- [ ] Payments and credit: record payment, credit statement
- [ ] Reports: today / this week / this Ethiopian month; export CSV
- [ ] Offline queue for the main money action with sync status indicator

## M2: Galmee Pharmacy features

- [ ] POS sale screen with search and phone-camera barcode scan
- [ ] Stock list with expiry colours (red < 30 days, amber < 90 days)
- [ ] Receive-stock form (supplier, batch, expiry, cost) using `receive_stock`
- [ ] Credit customers list and statement (uses `customer_balances`)
- [ ] Daily closing report (cash vs Telebirr vs credit)
- [ ] Migration: ph_suppliers
- [ ] Migration: ph_purchase_orders
- [ ] Migration: ph_purchase_lines
- [ ] Sales go through core `record_sale` (already FEFO: earliest expiry leaves first)
- [ ] Nightly report query: items expiring in 30/60/90 days and items below reorder level
- [ ] Purchase order -> receive goods -> `receive_stock` per line

## M3: Notifications

- [ ] Evening Telegram summary to owner: sales, cash vs Telebirr, expiring items, low stock
- [ ] Edge Function reads `notifications` queue and sends (needs AfroMessage/Telegram keys: ask in NEEDS_APPROVAL.md)

## M4: Demo ready

- [ ] Demo tenant "Galmee Pharmacy Demo" with data: 40 common Ethiopian pharmacy items (paracetamol, amoxicillin, ORS, etc.) with batches and expiries; 15 credit customers
- [ ] Demo login documented in NEEDS_APPROVAL.md for Alpha (password set by Alpha, never committed)
- [ ] 5-minute demo path works on a phone in airplane mode for the main action
- [ ] Amharic and Afaan Oromo text reviewed list in NEEDS_APPROVAL.md for Alpha (native speaker)

## M5: Client ready

- [ ] Receipt printing (58/80 mm thermal) and Telegram receipt
- [ ] Data import from Excel/CSV
- [ ] Export all tenant data to Excel
- [ ] Error monitoring hook (Sentry, DSN via env)
- [ ] README: setup, env vars, deploy steps

## Q: Quality and security baseline (do these inside M0 and M1, not after)

- [x] `docs/DESIGN.md` written per `docs/FRONTEND.md` and the `frontend-design` skill (palette, type with Ethiopic support, layout wireframes, reviewed against generic defaults)
- [x] Tailwind theme tokens and `next/font` fonts from DESIGN.md
- [x] `server-only` Data Access Layer in `src/server/dal/`; every Server Action validates with zod and re-checks auth + role
- [x] Security headers and CSP with nonce (SECURITY.md section 5)
- [ ] Cross-tenant RLS test extended to this product's tables and passing
- [x] Playwright screenshot script for 360 px and 1280 px (`webapp-testing` skill)
- [x] `npm audit` clean, Dependabot active
- [ ] Self-audit (SECURITY.md section 9) recorded in DAILY_LOG.md
