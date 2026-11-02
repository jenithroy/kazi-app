# Kazi Mobile — build plan and parity with the website

The website (`../src`, React + Vite) and this app share one Supabase database. This app began as a port of the website and has not
kept pace with it: it is a snapshot of the site as it stood in mid-October 2026, in places older, and some of what it writes does not
match what the database now expects. **It is not at parity.** This file says where it stands, in the order things should be done.
Read it before starting work here, and keep it up to date as things ship (`CLAUDE.md` points to it).

Last compared against the website on 2026-11-02.

## The date that cannot slip: 1 December 2026

The management memo's attendance rules start on 2026-12-01 (`NEW_RULES_FROM`): a 10-minute grace and lateness counted in minutes with
no pay cut, and every 7 unapproved absences in a month costing a day of salary. Before it, the old rule: 15+ minutes late flags a
quarter-day cut. A day takes the rules of the day it happened, a month those of the month, so nothing recorded is judged again.

This app writes the day's attendance record when someone clocks in, so a build made before the change would grade December's arrivals by
the old rule. **This app has no over-the-air update** (no `expo-updates`), so a new build has to be in everyone's hands before that day.

- The rules are `src/data/attendance/work-rules.ts`, a copy of the website's `src/lib/workRules.js`. Change either and run
  `npm run check:work-rules`, which compares the two on every minute of a working day either side of the start date (Node 23.6+).
- Ported 2026-11-02: arrival grading by day; no cut from the start date on, in the roll-call editor, the month views and the team card;
  a past day with a clock-in and no clock-out reads as Absent (this one is already live on the website, for every day); a monthly
  summary that counts absences "N of 7"; coming back after a break no longer grades the arrival again.
- Not ported: approved overtime and the overtime dialog, the Leaderboard, and the payroll run. Their database part, migration
  `0064_overtime_and_payroll_run.sql`, was applied to the live database on 2026-11-02 (0060 to 0062 were not checked), so they can be
  ported now; the website's side is `src/lib/overtime.js`, `workHours.js`, `payrollRun.js` and `payrollFacts.js`. Until they are, the
  app reads no overtime approval and shows none.

## What was fixed on 2026-11-02

Writes that put wrong data into the shared database:

| Where | Was | Now |
|---|---|---|
| Orders | a blank delivery date was sent as `""` to a `date` column, which the database rejects; the first history row stored a stage id with no author; notes were signed "You" | blank is `null`; history rows carry the stage name, the day and who; notes carry the person's name |
| Stock | quantities were read as whole numbers, and `2.5` as `25` (the point was stripped); the movement was valued at 0 and the reference was dropped | decimals kept to the three places the ledger holds; valued at the item's unit cost; the reference is kept in the note; the day is the local one |
| Tech packs | saving a pack made on the website's technical sheet overwrote its per-size measurements | those measurements are shown read-only and never written (`sheetFormat` 2) |
| Purchases | numbered by counting what the phone had; deleting one found its VAT bills and stock-in by the "EXP001" text, which since 0046 names one purchase in each fiscal year | numbered by `next_purchase_number` for the purchase's own fiscal year; the stock-in is filed linked to the purchase; delete finds linked rows by the purchase's id, before it deletes |
| Billing | a payment added to the invoice's paid total, with no `payments` row, which the database trigger sums (migration 0030) and so undid at the next payment; a pound invoice's paid amount was read as rupees and divided by 200, and written multiplied by 200 | each payment is a row, in the invoice's own currency, dated, with its method and reference; the status is set; the payment history is read from those rows |
| Undo | many toasts offered Undo for a `restore*` writer that does nothing in the database | `mockUndo` (`src/lib/supabase/undo.ts`) offers it only in the mock |

New: **Roles & Duties** (`src/screens/roles`, `src/data/roles`), the website's page, open to everyone signed in.

## Still to do, in order

**1. Finish the write mismatches** (small each, high cost if left)
- Finance: the audit found expenses written without the paid-from and payment type, journal entries without party and region (0048),
  and bank transactions without some of their fields. That list was not re-checked line by line: compare
  `src/data/finance/supabase-write.ts` with `../src/lib/financeWrites.js` first.
- Undo that is still a list rewind: the invoice-adjacent quotation and challan writers are covered; check customers, employees, bug
  reports and marketing, whose `restore*` writers may or may not be real inverses (tasks, orders and stock are real).
- Orders keep the customer as typed text; the website links `customer_id`, which is what the customer ledger reads by.
- Only NPR and GBP are supported: the phone prices a euro invoice at the pound's rate and reads any other currency as rupees, where the website
  handles any (`../src/utils/currency.js`). Recording a payment on one is refused rather than guessed.

**2. Pages the website has that this app does not**
- Leaderboard — hours worked this month (`../src/pages/Leaderboard.jsx`, the ranking rule in `../src/lib/workHours.js`). Reads
  `work_hours_leaderboard` (migration 0064, applied 2026-11-02); keep a "not available yet" state for a database without it, as the website does.
- Embroidery Digitizer — runs entirely in the browser (`../src/lib/digitizer`, `../src/lib/embroidery`). The pure code can be reused; the
  work is the picking, the preview and handing the stitch file to the share sheet.
- Meta Ads (`../src/pages/MetaAds.jsx`, migrations 0050 to 0053).

**3. Across the app**
- The shared Filters panel, the colleague profile card, "send to Chat", the UK / Nepal region switch and the region tag on records,
  profile pictures (0056), any-currency money, the Chat and Marketing permission tabs in Admin, the marketing calendar on the real
  `content_calendar` model, task points and the pause rule (0057, 0062), the tasks board (0058), holidays (0059) on the calendar,
  the tech pack sheet viewer (0063), Production's filters and materials-used, the Samples and stock ledger.

## How things work here (read before adding anything)

- One module: route `src/app/(app)/<name>.tsx` → `src/screens/<module>` → `src/data/<module>/{types,keys,api,hooks,supabase,supabase-write,mock}.ts`.
  `api.ts` picks live or mock; a module is listed in `MORE_MODULES` (`src/constants.ts`) and shown by `canView(id)`.
- Reads go through the `fs_<collection>` views, camelCase. Writes go through `src/lib/supabase/write.ts`: `toRow` maps names to columns
  and does **not** coerce types (a `date` column takes `null`, never `""`); a collection needs an entry in `SPECS` there or it throws.
- `liveWrite` runs the live write first and throws if it fails, then runs the mock. A `restore*` snapshot undo cannot reach the database.
- Amounts on an invoice, quotation or challan are in **the document's own currency** (`total_npr`, `amount_paid` included); everything
  else is NPR.
- A "day" is the Kathmandu day (`nepalToday()` in `src/data/attendance/live-shared.ts`) or the phone's local one (`isoDay`), never
  `toISOString().slice(0, 10)`, which is the previous day for the first hours of a Nepal morning.
- Check a change with `npx tsc --noEmit` and `npx eslint <files>`; see it with `npx expo start --web` (no `.env` runs the mock, and the
  session is a mock login: `admin@`, `staff@` or `director@kazi.com.np`). Expo SDK 57: read the versioned docs first.
