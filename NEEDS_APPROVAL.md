# NEEDS_APPROVAL: Galmee Pharmacy

The routine writes questions here; Alpha answers under each one.

## Open

### 2026-11-06: Supabase Auth URLs for the Vercel deploy
When you connect the repo to Vercel, add the production URL (and `http://localhost:3000`) under Supabase > Authentication > URL Configuration (Site URL + Redirect URLs), otherwise sign-up confirmation emails link to the wrong place. Env vars for Vercel are in `.env.example` (publishable key only).
Also: is email confirmation ON in the shared project? The app handles both, but for demos OFF is smoother. Your call (it is project-wide, all 10 products).

### 2026-11-06: Phone-number login
CLAUDE.md says phone/email + password. Email + password works now. Phone sign-in in Supabase needs an SMS provider (Twilio / MessageBird / Vonage etc.; AfroMessage is not built in) which costs money. Options: (a) keep email only, (b) phone number as a "fake email" like `0911234567@galmee.local` (free, no SMS verification), (c) pay for an SMS provider. Which one?

### 2026-11-06: Amharic and Afaan Oromo text review
All visible text is in `messages/am.json` and `messages/om.json` (first draft by Claude). Please have a native speaker check them, especially: Oromo Ethiopian month names in `src/lib/ethiopian-date.ts` (Fulbaana ... Qaammee) and the Oromo era suffix "ALI" (Amharic uses "ዓ.ም.", English "E.C.").

### 2026-11-06: shadcn registry blocked for the routine (optional)
The routine's network cannot reach `ui.shadcn.com`, so `npx shadcn add` fails. UI components are hand-written in the shadcn style instead (works fine). If you want the CLI, allow `ui.shadcn.com` in the routine's allowed domains.

## Answered

_(none yet)_
