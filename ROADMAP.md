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

- [x] Customers: list, search by name/phone, detail with balance
- [x] Items and stock (if this product uses stock): list, add, receive stock
- [x] Payments and credit: record payment, credit statement
- [ ] Reports: today / this week / this Ethiopian month; export CSV
- [ ] Offline queue for the main money action with sync status indicator

## M2: Galmee Pharmacy features

- [x] POS sale screen with search and phone-camera barcode scan
- [x] Stock list with expiry colours (red < 30 days, amber < 90 days)
- [x] Receive-stock form (supplier, batch, expiry, cost) using `receive_stock`
- [x] Credit customers list and statement (uses `customer_balances`)
- [x] Remove expired stock from the stock list (owner and manager)
- [ ] Daily closing report (cash vs Telebirr vs credit)
- [x] Migration: ph_suppliers
- [x] Migration: ph_purchase_orders
- [x] Migration: ph_purchase_lines
- [x] Sales go through core `record_sale` (already FEFO: earliest expiry leaves first)
- [x] Nightly report query: items expiring in 30/60/90 days and items below reorder level
- [ ] Purchase order -> receive goods -> `receive_stock` per line

## M3: Notifications

- [ ] Evening Telegram summary to owner: sales, cash vs Telebirr, expiring items, low stock
- [ ] Edge Function reads `notifications` queue and sends (needs AfroMessage/Telegram keys: ask in the decision log)

## M4: Demo ready

- [ ] Demo tenant "Galmee Pharmacy Demo" with data: 40 common Ethiopian pharmacy items (paracetamol, amoxicillin, ORS, etc.) with batches and expiries; 15 credit customers
- [ ] Demo login documented in the decision log for Alpha (password set by Alpha, never committed)
- [ ] 5-minute demo path works on a phone in airplane mode for the main action
- [ ] Amharic and Afaan Oromo text reviewed list in the decision log for Alpha (native speaker)

## M5: Client ready

- [ ] Receipt printing (58/80 mm thermal) and Telegram receipt (see M-next)
- [ ] Data import from Excel/CSV (see M-after)
- [ ] Export all tenant data to Excel (see M-after)

## Later (after the first paying pharmacy)

- [ ] Error monitoring hook (Sentry, DSN via env)
- [ ] README: setup, env vars, deploy steps

## M-next: close out the essentials

- [ ] Daily closing screen reading `ph_daily_closing` (cash/Telebirr/credit tiles + per-method list)
- [ ] Receipt layout component (58 mm CSS print) for one sale, EN/AM
- [ ] Print flow from sale success screen + reprint from sale detail
- [ ] Telegram receipt: queue `notifications` row with receipt text on sale

## M-after: keep them paying, then grow

- [ ] Offline queue: IndexedDB queue for `record_sale` with client_ref
- [ ] Sync status chip + retry on reconnect
- [ ] Evening Telegram summary generator (SQL + notifications row)
- [ ] Reports screen: today / this week / Ethiopian month from existing views
- [ ] CSV export of reports
- [ ] Staff invite (owner-only) + role select
- [ ] Per-staff sales column in daily closing
- [ ] Excel import of items (template + parser)
- [ ] Export-all to Excel

## Q: Quality and security baseline (do these inside M0 and M1, not after)

- [x] `docs/DESIGN.md` written per the frontend guidelines (palette, type with Ethiopic support, layout wireframes, reviewed against generic defaults)
- [x] Tailwind theme tokens and `next/font` fonts from DESIGN.md
- [x] `server-only` Data Access Layer in `src/server/dal/`; every Server Action validates with zod and re-checks auth + role
- [x] Security headers and CSP with nonce (the security guidelines section 5)
- [x] Cross-tenant RLS test extended to this product's tables and passing
- [x] Playwright screenshot script for 360 px and 1280 px
- [x] `npm audit` clean, Dependabot active
- [ ] Self-audit (the security guidelines section 9) recorded in the dev log
