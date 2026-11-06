# DESIGN.md: Galmee Pharmacy

Written per `docs/FRONTEND.md` and the `frontend-design` skill. Change this file first, then the code.

## Brief

- **Subject:** the dispensing counter of a small pharmacy in Shashamane. Shelves of boxed medicine, each box carrying a printed batch number and an EXP date; a cashier with one phone, a busy queue, often bright daylight.
- **Audience:** pharmacist-owner (checks money and expiry at night), cashier/druggist (sells all day, one thumb).
- **Primary job:** make the expiry date and the money sitting in that stock impossible to miss, and make a sale fast.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| `--dispensary` | `#0B5D4B` | Dominant. The green of a pharmacy sign: header bar on phones, primary action. White on it is 7.8:1. |
| `--counter` | `#FBFBF8` | Page background, a clean shelf-paper white (not cream). |
| `--ink` | `#1C2421` | Text. Green-tinted black so it sits with the dispensary green. 15.3:1 on counter. |
| `--shelf` | `#DCE1DD` | Hairline rules and borders between shelf rows. |
| `--expiry-red` | `#B42318` | Expires in under 30 days, errors. 6.6:1 on white. |
| `--expiry-amber` | `#A15C00` | Expires in under 90 days. A dark amber that stays readable as text (5.2:1 on white), not a yellow highlight. |

Status is never colour alone: expiry states always carry an icon and the number of days ("12 days left").

Light theme only for now: pharmacies are bright and the phones are used in daylight. Dark mode can come later as tokens only.

## Type

- **Atkinson Hyperlegible Next** (Latin: English and Afaan Oromo). Built by the Braille Institute so that look-alike characters (I l 1, 0 O, rn m) stay distinct. On a drug name, batch number or amount, a misread is a real error, so legibility is the personality here, not a neutral choice.
- **Noto Sans Ethiopic** for Amharic (Ge'ez). Atkinson is listed first so Latin text and digits use it; Ethiopic characters fall through to Noto.
- Both self-hosted with `next/font/local` (`src/app/fonts/`), so they work offline and need no Google request.
- Scale (1.25): 13 / 16 (body) / 20 / 25 / 31 px. Weights 400 and 700 (Ethiopic 600). Sentence case everywhere; no all-caps labels.
- Numbers (money, quantities, dates) use the `.num` class (`tabular-nums`) so columns line up.

## The one bold thing: the expiry label

Every stock row ends with an **expiry label**, drawn like the printed EXP stamp on a medicine box: a bordered block with the Ethiopian date and "days left", tinted red or amber by status. It is the thing a pharmacist should see in 2 seconds. Everything else stays quiet: flat white surfaces, 1 px shelf rules, small radius (6 px), no shadows, no gradients.

## Layout (360 px first)

```
Stock list (phone)                     Home (phone)
+----------------------------------+   +----------------------------------+
| [G] Abebe Pharmacy    [am|om|en] |   | [G] Abebe Pharmacy    [am|om|en] |  <- dispensary-green bar
+----------------------------------+   +----------------------------------+
| [ Search drug or scan  [|||] ]   |   | Welcome, Hana                    |
| All | < 30 days | < 90 | Low     |   | Today: Tikimt 27, 2019 E.C.      |
|----------------------------------|   |----------------------------------|
| Amoxicillin 500mg caps    120 pcs|   | Birr in stock expiring < 30 days |
| Batch A23-114   +--------------+ |   |   ETB 18,450.00   (14 items)     |
|                 | ! Hidar 12   | |   |----------------------------------|
|                 |   15 days    | |   | Below reorder level      6 items |
|                 +--------------+ |   | Sales today        ETB 7,230.00  |
|----------------------------------|   |                                  |
| ORS sachet               48 pcs  |   |                                  |
| Batch 7781      [ Ginbot 3 ... ] |   |                                  |
+----------------------------------+   +----------------------------------+
| Home | Sell | Stock | Credit | Rep |   | Home | Sell | Stock | Credit | Rep |
+----------------------------------+   +----------------------------------+
```

- Content is left-aligned. Money is right-aligned in lists.
- Primary action within thumb reach: bottom tab bar (64 px) and, on forms, a full-width button at the end of the form.
- Desktop (1280 px): 240 px sidebar with the same five destinations, content max 1024 px, tables instead of stacked rows.

## Review against generic defaults

- Started from "white cards with soft shadows and a teal accent" (the SaaS-card kit). Changed to flat surfaces with shelf rules and no shadows, and moved all emphasis into the expiry label.
- Rejected Inter/Geist (the scaffold default) for Atkinson Hyperlegible Next, chosen for the misreading risk on drug names.
- No eyebrow labels, no middle-dot meta strings, no arrows on buttons, no monospace data labels: batch numbers use the body face with tabular figures.
- Dark mode and decorative motion left out on purpose. Motion only confirms actions (sale recorded, sheet opened) and respects `prefers-reduced-motion`.

## Components

- `Button` 48 px tall (`lg` for the main action), `Input` 48 px, `Card` flat with a 1 px border.
- Header bar: dispensary green on phones, white sidebar on desktop.
- Language switcher: always visible (header on phones, sidebar on desktop), shows each language in its own script.
