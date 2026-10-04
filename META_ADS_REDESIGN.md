# Meta Ads — Front-end Audit & Design Plan

> Status: **plan only, nothing built yet.** Read it, answer the open decisions in §9, then it gets built phase by phase.
> Written 2026-10-04 from a full read of `src/components/MetaAds/*` (775 lines), `src/lib/metaAds.js`, `src/lib/metaAdsApi.js`, `src/pages/Marketing.jsx`, the Meta Ads CSS, migrations 0049–0051 and the Worker routes. Every layout claim below was checked by rendering the real components and the real `styles.css` inside the real `AppLayout` with mocked data, at 1440 × 900 and 390 × 844.

This plan sits under [REDESIGN.md](REDESIGN.md): same ground rules (§2 there), same house style (§4), same responsive rules (§5) and the same component kit (§6). Where this file is silent, that one applies.

---

## 1. Summary

The data layer behind Meta Ads is careful. Rates are derived at read time, spend is never blended across currencies, the budget ceiling is enforced in the Worker, every change is audited, and the Attribution tab is honest that its numbers are hand-tagged. The front end doesn't live up to that:

1. **Part of the page can't be reached on a desktop.** `/marketing` turns off scrolling for the whole content area so the calendar can fill the window, and Meta Ads never turns it back on. At 1440 × 900 the Overview's **Top ads** table and the Settings tab's **Budget guard rails** card sit below the fold with no way to scroll to them.
2. **The phone layout doesn't work.** Every table is squeezed into 390 px and broken one letter per line ("D A I L Y B U D G E T", "$ 1 3 / d a y"). Settings is about 4,500 px tall.
3. **Some headline numbers are wrong.** "Cost / result" divides by a sum of overlapping action types and reads **$0**. Reach is summed across days. Every USD amount is rounded to whole dollars, so a $12.50/day budget shows as **$13/day**, including inside the budget editor.
4. **Some states aren't honest.** While data is loading the page shows "$0" spend and "No campaigns synced yet". Attribution's date picker shows "last 90 days" while the table shows all-time figures.
5. **The controls for spending real money are fragile.** Pause is one click with no confirmation. The budget ceiling ignores currency on both client and server. A user can tick the "I meant it" box and only learn when they press Save that the amount is above the hard ceiling.

**Recommendation:** first ship the bug fixes in §6 as small `fix(...)` commits (Phase A, small and low-risk). Then rebuild the section on the REDESIGN kit (Phases B–F). It's 775 lines and self-contained, and it uses most of the kit, which makes it a good pilot for REDESIGN Phase 1 (decision #6).

---

## 2. How this was checked

- **Code read:** every file listed in the header, plus `ui.jsx`, `viz.jsx`, `Modal.jsx`, `AppLayout.jsx` and `utils/format.js`.
- **Render harness:** a throwaway Vite entry renders `AppLayout` + `Marketing` from `src/` with `styles.css` and the Tailwind CDN (as `index.html` does today). It replaces `lib/metaAds`, `lib/metaAdsApi`, `lib/db`, `supabase`, `AuthContext` and `CurrencyContext` with mocks, so no login is needed. States rendered: full data, loading, empty, multi-currency, view-only. Screenshots were taken with Chromium/Playwright.
- **Not checked:** the live ad account. The mock data is invented, with a USD account, long Meta-style campaign names, and a realistic `actions` array. It is not Kazi's real data, and none of its numbers appear in this file as facts.

The harness also answers REDESIGN §12 decision #1 (how to screenshot pages behind login) for pages whose data goes through `lib/*` helpers. It can be committed as a dev-only script if wanted (§8).

---

## 3. Audit findings

Severity: **High** = broken, wrong money or wrong number; **Med** = misleading or hard to use; **Low** = polish. IDs are referenced in §6–§7.

### 3.1 Broken layout

| ID | Sev | Where | Finding |
|---|---|---|---|
| L1 | **High** | [AppLayout.jsx:170](src/components/AppLayout.jsx#L170), [:203](src/components/AppLayout.jsx#L203) | `/marketing` sets `.kscroll` to `padding: 0; overflow: hidden` for the full-bleed calendar. `.kmkt-page`, `.kmkt-metaads` and `.kmkt-metaads-body` have **no CSS at all**, so Meta Ads never gets a scroll container back. Measured at 1440 × 900: Overview content ends at y = 1210 and Settings at y = 1178, both inside a container that stops at y = 900 and can't scroll. The Top ads table and Budget guard rails can't be reached. |
| L2 | **High** | [styles.css:2997](src/styles.css#L2997), `.ktable` ([:772](src/styles.css#L772)) | At ≤ 768 px, `.kscroll { overflow-wrap: anywhere }` (REDESIGN §3) together with 5–7-column tables inside `overflow: hidden` cards breaks every header and cell one letter per line, on all four tabs. Settings measures about 4,500 px tall at 390 px. |
| L3 | Med | same as L1 | No gutter: tabs, cards and the Attribution footnote sit flush against the sidebar and the window edge, at every width. |
| L4 | Low | [Marketing.jsx:24](src/pages/Marketing.jsx#L24) | For anyone with Meta Ads access, the Calendar tab sits inside the unstyled `.kmkt-page` wrapper, so `.kmkt-shell { flex: 1 }` has nothing to fill. The calendar stops about 84 px short of the bottom (816 of 900). It fills correctly for people without Meta Ads access. |

### 3.2 Wrong or misleading numbers

| ID | Sev | Where | Finding |
|---|---|---|---|
| N1 | **High** | [Overview.jsx:23](src/components/MetaAds/Overview.jsx#L23), [:143](src/components/MetaAds/Overview.jsx#L143) | "Cost / result" divides spend by the **sum of every entry in Meta's `actions` array**. Those entries overlap: `page_engagement` includes `post_engagement`, which includes `link_click`. The same click is counted several times and video views are added in. With the mock's realistic action mix this shows "49,496 results" and a cost per result of **$0**. The "(all actions)" footnote doesn't make the number meaningful. |
| N2 | **High** | [Overview.jsx:80](src/components/MetaAds/Overview.jsx#L80) | Reach is **summed across days and campaigns**. Reach counts unique people, so it can't be added up: one person reached on 30 days counts 30 times. The KPI and the "Reach" trend line both overstate it. The schema comment (0050) says rates are derived from summed counts, but reach isn't a count that can be summed. |
| N3 | **High** | [format.js:13](src/utils/format.js#L13) via every Meta Ads money cell | `asCurrency` rounds every non-GBP amount to whole units (the right call for NPR elsewhere in the app). For a USD account: a $12.50/day budget shows as "$13/day" in the table **and** "Currently $13" in the budget editor, whose input says 12.5; a $0.42 cost per result shows as "$0". Money that is being edited has to be exact. |
| N4 | Med | [Overview.jsx:138](src/components/MetaAds/Overview.jsx#L138) | CTR is built from Meta's `clicks`, which counts **all** clicks (likes, profile taps, "see more"), not link clicks. It should be labelled "CTR (all)" or based on `link_click`. |
| N5 | Med | [DateRangePicker.jsx:12](src/components/MetaAds/DateRangePicker.jsx#L12) vs [metaSync.js:25](worker/lib/metaSync.js#L25) | The 90d preset suggests 90 days of history, but each sync only pulls the last 37 days. History only builds up from the first sync onward, so on a new install the 90-day view quietly covers the ~37 days synced so far. Nothing tells the user where the data starts. |
| N6 | Med | [Overview.jsx:92](src/components/MetaAds/Overview.jsx#L92) | The trend skips days with no rows instead of filling them with zero, so a gap in spend disappears from the chart and the x-axis isn't evenly spaced in time. If the range has only one day of data, `AreaChart` divides by `n − 1 = 0` and draws `NaN` paths. |
| N7 | Med | [Overview.jsx:72](src/components/MetaAds/Overview.jsx#L72) | When there's no data the currency falls back to `"USD"`, so an NPR or GBP account briefly shows "$0". With several currencies, the one shown is whichever happens to come first, and the user can't switch to another. |
| N8 | Med | [Attribution.jsx:114](src/components/MetaAds/Attribution.jsx#L114), [:127](src/components/MetaAds/Attribution.jsx#L127) | A campaign with zero spend shows ROAS **"converting…" forever** (a falsy `spendNpr` is treated as "rate not loaded yet"). If the rate fetch fails, the footnote says "1 USD ≈ 0 NPR". Campaigns with spend and no tagged orders show "0.00×", which reads as a measured failure when nothing was actually measured. |
| N9 | Low | [Overview.jsx:178](src/components/MetaAds/Overview.jsx#L178) | "Spend by campaign" uses vertical `Bars` 80 px tall, with unformatted values ("607", no currency) and long campaign names wrapped underneath. A small campaign comes out as a 4 px line. |

### 3.3 State that isn't true

| ID | Sev | Where | Finding |
|---|---|---|---|
| S1 | **High** | [Overview.jsx:134](src/components/MetaAds/Overview.jsx#L134) | While loading, the KPI row shows **"$0" spend, "0" clicks**, and both charts say "Nothing to chart yet". |
| S2 | **High** | [Campaigns.jsx:226](src/components/MetaAds/Campaigns.jsx#L226) | Campaigns has no loading state at all. Until the fetch returns, it says "No campaigns synced yet — run a sync from Settings." |
| S3 | **High** | [Attribution.jsx:40](src/components/MetaAds/Attribution.jsx#L40), [:77](src/components/MetaAds/Attribution.jsx#L77) | The query is all-time (`dateFrom: ""`), but the picker is fed `isoDaysAgo(90)` → today. The UI says "last 90 days" while the table shows all-time spend. There's also no "All time" option to pick. |
| S4 | Med | [Overview.jsx:126](src/components/MetaAds/Overview.jsx#L126) | The empty state is a card saying there's no data, with a full row of "$0 / 0 / —" KPIs and two "Nothing to chart yet" cards underneath. That's four ways of saying the same thing. |
| S5 | Med | whole section | Nothing shows how fresh the numbers are. A sync runs every 30 minutes, but the time of the last sync is only visible in a table on the Settings tab. |
| S6 | Med | [Campaigns.jsx:82](src/components/MetaAds/Campaigns.jsx#L82), [:96](src/components/MetaAds/Campaigns.jsx#L96) | Expanding a row fetches its children with no spinner and no `catch`. A failed fetch is an unhandled rejection with nothing on screen. Rows with no children still show a chevron, and expanding them shows nothing at all. |
| S7 | Med | [Campaigns.jsx:130](src/components/MetaAds/Campaigns.jsx#L130) | After a campaign is paused, the ad sets and ads already loaded under it keep their old status. The comment says children "re-fetch on next expand", but `if (!adsets[c.id])` caches them for good. |
| S8 | Med | [Campaigns.jsx:33](src/components/MetaAds/Campaigns.jsx#L33) | View-only roles see no row actions and no explanation. PRODUCT principle 3 ("Honest state … why something is … restricted") asks for a reason to be shown. |
| S9 | Low | [Attribution.jsx:47](src/components/MetaAds/Attribution.jsx#L47) | `error` isn't cleared when the range changes, so an old error stays above new, valid data. |

### 3.4 Real-money controls

| ID | Sev | Where | Finding |
|---|---|---|---|
| R1 | **High** | [BudgetEditDialog.jsx:21](src/components/MetaAds/BudgetEditDialog.jsx#L21), [worker/index.js:159](worker/index.js#L159) | The budget ceiling is compared in **raw minor units with no currency check**, both in the dialog and in the Worker. `budget_ceiling_currency` is stored and then never read. A 50.00 USD ceiling blocks a 60.00 NPR budget (about $0.45). A ceiling set in NPR would let a USD budget roughly 133× larger through. |
| R2 | **High** | [BudgetEditDialog.jsx:29](src/components/MetaAds/BudgetEditDialog.jsx#L29) | The over-ceiling check runs only on submit. Going above both the 3× multiple and the ceiling shows the amber "Yes, I meant to increase it this much" confirm. The user ticks it, presses Save, and only then sees "above the ceiling". The confirm path leads nowhere. |
| R3 | Med | [Campaigns.jsx:35](src/components/MetaAds/Campaigns.jsx#L35) | Pause/Resume is one click on a ghost button that looks like plain text, right next to "Edit budget". It stops a live campaign with no confirmation and no undo, and nothing tells the user how many ad sets and ads it affects. |
| R4 | Med | [worker/index.js:162](worker/index.js#L162) | The server error reads "That exceeds the budget ceiling (5000 minor units)." The client shows it as-is. |
| R5 | Med | [Campaigns.jsx:29](src/components/MetaAds/Campaigns.jsx#L29), [:33](src/components/MetaAds/Campaigns.jsx#L33) | The pill shows `effective_status` but the button follows `status`. An ad set paused by its campaign shows "CAMPAIGN_PAUSED" next to a **Pause** button. |
| R6 | Low | [BudgetEditDialog.jsx:46](src/components/MetaAds/BudgetEditDialog.jsx#L46), [:63](src/components/MetaAds/BudgetEditDialog.jsx#L63) | The primary button turns into "Review below". The warning box uses terra (error), not amber (caution). The checkbox state is named `confirmedOverCeiling` but means "over the multiple", and that name is what goes into the audit trail. |
| R7 | Low | [Settings.jsx:184](src/components/MetaAds/Settings.jsx#L184) | Clearing the multiplier field saves `0` (`Number("")`). The dialog then quietly uses 3 (`|| 3`), so the setting on screen isn't the one in force. There's no check that the value is ≥ 1, and Save gives no feedback while it's running. |

### 3.5 Visual consistency (against REDESIGN §4)

| ID | Sev | Finding |
|---|---|---|
| V1 | Med | **Two stacked tab bars that look almost the same** (`kmkt-tab` 13 px and `kmkt-tab--sub` 12.5 px, both underlined). The second reads like a broken copy of the first. |
| V2 | Med | **`Btn kind="secondary"` has no CSS.** `.kbtn--secondary` isn't defined (only `soft/outline/mint/…` are). The active date preset ([DateRangePicker.jsx:27](src/components/MetaAds/DateRangePicker.jsx#L27)) looks the same as the inactive ones, and Settings' "Add" button looks like plain text. |
| V3 | Med | **Status tones are backwards.** `PAUSED` is terra (alarm), while `DISAPPROVED`, `WITH_ISSUES` and `PENDING_REVIEW` are neutral grey, shown in Meta's raw `SCREAMING_CASE`. The things that need attention look calm, and the normal state looks alarming. |
| V4 | Med | **The topbar breadcrumb says "Marketing Calendar"** on the Meta Ads tab ([AppLayout.jsx:60](src/components/AppLayout.jsx#L60)). |
| V5 | Low | Table numbers are in mono but **left-aligned**, with no totals row. Timestamps use `toLocaleString()`, so the browser picks the format and no time zone is shown (Nepal and UK staff see different strings for the same sync). |
| V6 | Low | Mixed button systems: `Btn` on the page, legacy `primary-button` / `ghost-button` in the budget modal, and `Btn kind="primary"` still the dark fill rather than mint-deep (REDESIGN §4.5). |
| V7 | Low | `Settings` calls an ad account that isn't being synced "Paused". On this page "Paused" already means a paused campaign. |
| V8 | Low | The Attribution caveat is a 5-line paragraph in a mint-edged card. Mint is reserved for positive state, and the text should be a short info banner with the detail available on demand. |
| V9 | Low | Error messages are bare terra text (`.form-error`) with no icon, no `role="alert"`, and no way to retry. |

### 3.6 Accessibility

- Neither tab bar has `role="tablist"` / `role="tab"` / `aria-selected` or arrow-key movement.
- Every expand chevron has the label "Expand", with no `aria-expanded` and no row name ([Campaigns.jsx:23](src/components/MetaAds/Campaigns.jsx#L23)).
- The metric picker buttons have no `aria-pressed`. The date inputs and the add-account input have no labels (placeholder only).
- Charts have no text alternative. The `AreaChart` tooltip appears only on mouse move, and the `Bars` values only in a `title` attribute, so neither works on touch.
- Credit where it's due: `Modal.jsx` already traps focus, closes on Escape, restores focus and becomes a bottom sheet on phones.

### 3.7 Data that is synced but never shown

| Data | Synced in | Shown? | Use |
|---|---|---|---|
| `meta_ads_actions` (who paused or changed what, before/after) | every action, [Campaigns.jsx:108](src/components/MetaAds/Campaigns.jsx#L108) | **No.** `fetchRecentActions` exists and nothing calls it | Change log (§4.6). For actions that spend real money, this matters most. |
| `meta_ads.creative_thumbnail_url` | [metaSync.js:157](worker/lib/metaSync.js#L157) | No | Thumbnails in Top ads and on ad rows: an ad called "Carousel v3" means little without its picture. |
| `meta_campaigns.objective` | [metaSync.js:97](worker/lib/metaSync.js#L97) | No | Shown under the campaign name, and needed to define "results" (decision #1). |
| Ad-set / ad-level insights | all three levels synced | Only ad level, in Top ads | Spend and results per row in Campaigns (decision #3). |
| `meta_sync_runs.finished_at`, `insight_rows_synced`, `detail.pagingCaps` | every run | No | Run duration, plus a warning when a sync hit the paging cap and is therefore incomplete. |
| `meta_ad_accounts.timezone_name` | every sync | No | Meta's "day" is in the account's time zone, not Kathmandu's or London's. |

---

## 4. Design direction

**Who uses it and what for:**

- **UK directors** check in occasionally. They want to know what was spent, whether it's working, and whether anything is broken. Mostly desktop, read-only.
- **The marketing co-ordinator** works in it: pausing campaigns, adjusting budgets, finding disapproved ads, tagging customers. Desktop, with some phone.

Mode is **Operate** (REDESIGN §4). That means numbers that can be trusted at a glance, problems shown first, and controls for real money that are hard to trigger by accident and easy to audit.

### 4.1 Information architecture

```
Marketing  (page header: "Marketing" · tabs: Calendar | Meta Ads)
└─ Meta Ads
   ├─ Section bar (sticky):  account · currency · "Synced 17 min ago" · [Sync now]
   │                         [7d | 30d | 90d | All | Custom…]  ← shared by every sub-view
   ├─ Overview     — how much, how well, what needs attention
   ├─ Campaigns    — operate: status, budgets, pause/resume, drill-down
   ├─ Attribution  — hand-tagged customers/orders vs spend
   ├─ Activity     — NEW view on existing data: change log + sync history
   └─ Settings     — ad accounts, guard rails (read-only for view roles)
```

- **Sub-navigation becomes a `Segmented` control** in the section bar, not a second underline tab bar (V1). On phones it scrolls horizontally, and fades at the edge when it overflows.
- **One date range for the whole section**, held in `MetaAdsPage` and reflected in the URL, so switching tabs doesn't reset it. Today Overview and Attribution each keep their own.
- **URL state:** `/marketing?tab=meta-ads&view=campaigns&from=2026-09-04&to=2026-10-04`. Reload, the back button and shared links all work. Today a reload always goes back to Calendar → Overview.
- **Freshness and "Sync now" live in the section bar** (S5), not only in a Settings table.
- **The topbar title follows the tab:** "Marketing · Meta Ads" (V4).

### 4.2 Overview

```
Desktop ≥ 1200
┌ Meta Ads ── Kazi Manufacturing · USD ───────────── Synced 17 min ago  [⟳ Sync now] ┐
│ [Overview|Campaigns|Attribution|Activity|Settings]     [7d|30d|90d|All|Custom ▾]   │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ▲ Needs attention: 1 ad disapproved · 1 campaign has delivery issues   [Review →]  │  ← only when non-empty
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┤
│ SPEND    │ RESULTS¹ │ COST/RES │ LINK CLK │ CTR(link)│ IMPRESSIONS                 │
│ $1,274.12│ 48 msgs  │ $26.54   │ 1,447    │ 0.93%    │ 155,857                     │
├──────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────────────┤
│ Daily spend  [Spend|Results|Link clicks|Impressions]       ┆ Spend by campaign       │
│  ╱╲__╱╲___╱‾‾╲__  (zero-filled, 3–8 short date labels)      ┆ Private Label… ███ $607 │
│  "Data starts 27 Aug" marker when the range begins earlier  ┆ Hoodies | Mes… ██  $391 │
├─────────────────────────────────────────────────────────────┴──────────────────────┤
│ Top ads   [thumb] Hoodie close-up reel v3 · Hoodies | Messages   $141.20  512  …   │
└────────────────────────────────────────────────────────────────────────────────────┘
¹ "Results" per decision #1. Reach is removed or relabelled per decision #2.

Phone < 640
[Section bar: account · "Synced 17 min ago" · ⟳]
[Overview ▸ scrolling segmented]
[30d ▾]                         ← presets + custom in one sheet
[Needs attention banner]
[KPI 2 × 3 grid]
[Daily spend: full width, 3 date labels, tap for tooltip]
[Spend by campaign: BarList, names truncate, amounts right]
[Top ads: cards: thumb · name · campaign · spend]
```

- **KPIs:** a `StatStrip` (6 → 3 → 2 columns). Use the `Skeleton` while loading, never zeros (S1). When there's no data, show **one** `EmptyState` in place of the whole body: "No Meta Ads data for 4 Sep – 4 Oct. Data starts 27 Aug" (+ Sync now). Don't show a row of zeros (S4).
- **Needs attention** is a `Banner` built only from synced fields (`effective_status` in `DISAPPROVED`, `WITH_ISSUES`, `PENDING_BILLING_INFO`; the latest sync `failed`/`partial`; an account past `lastSyncedAt` + 2 h). It links to Campaigns with that filter applied. Nothing in it is invented.
- **Spend by campaign** becomes a horizontal `BarList` (REDESIGN §6): label left (truncated, full name in the row's accessible name), amount right in the currency, sorted by spend (N9).
- **Trend:** `ChartFrame` with zero-filled days, ≤ 8 short labels ("4 Sep"), tap tooltips, a guard for a single data point (N6), and a "data starts" marker (N5). Don't edit the shared `AreaChart` in place, because the Dashboard uses it ([Dashboard.jsx:1331](src/pages/Dashboard.jsx#L1331)).
- **Currency:** when there's more than one currency in range, a `Segmented` currency switch replaces the terra pill (N7).

### 4.3 Campaigns

```
Desktop
┌ [Search campaigns…]  [All | Active | Paused | Needs attention]   ☐ Show archived (2) ┐
├──────────────────────────────────────┬───────────────┬───────────────┬──────┬───────┤
│ NAME                                 │ DELIVERY      │ BUDGET        │SPEND²│       │
├──────────────────────────────────────┼───────────────┼───────────────┼──────┼───────┤
│ ▾ KAZI | Heavyweight Hoodies | Mes…  │ ● Active      │ $12.50 / day  │ $391 │[Pause]⋯│
│   Engagement · 2 ad sets             │               │               │      │       │
│   ▾ Kathmandu 18-34 | IG feed + reels│ ● Active      │ Campaign budg.│ $240 │[Pause]⋯│
│      [▣] Hoodie close-up reel v3     │ ● Active      │               │ $141 │[Pause]⋯│
│      [▣] Carousel — 6 colourways     │ ▲ Disapproved │               │  $0  │[Pause]⋯│
│   ▸ Pokhara 18-34 | Advantage+       │ ○ Paused      │               │  $0  │[Resume]│
│ ▸ Factory Tour Reel — Awareness      │ ○ Paused      │ $150.00 total │ $103 │[Resume]⋯│
└──────────────────────────────────────┴───────────────┴───────────────┴──────┴───────┘
² Spend / results columns per decision #3.

Phone: a list of campaign cards
┌──────────────────────────────────────┐
│ KAZI | Heavyweight Hoodies | Mess…   │
│ ● Active · $12.50/day · $391 spent   │
│ 2 ad sets                       ⋯  › │  → tap opens a Sheet: ad sets → ads
└──────────────────────────────────────┘     (breadcrumb, same row actions)
```

- **Delivery status in plain words**, with tones that follow importance (V3, R5). This map goes into `lib/status.js` (REDESIGN §6):

  | Meta `effective_status` | Label | Tone |
  |---|---|---|
  | `ACTIVE` | Active | mint |
  | `PAUSED` | Paused | neutral |
  | `CAMPAIGN_PAUSED` / `ADSET_PAUSED` | Paused by campaign / Paused by ad set | neutral, with the action shown as "Resume campaign" or no action |
  | `PENDING_REVIEW` / `IN_PROCESS` | In review / Processing | blue |
  | `WITH_ISSUES` / `PENDING_BILLING_INFO` | Has issues / Billing needed | amber |
  | `DISAPPROVED` | Disapproved | terra |
  | `ARCHIVED` / `DELETED` | Archived / Deleted | ghost; hidden behind "Show archived" |
  | sync `success` / `partial` / `failed` / `running` | Synced / Partly synced / Failed / Syncing | mint / amber / terra / blue |

- **One budget column** that reads "$12.50 / day", "$150.00 total" or "Campaign budget" (for an ad set under a campaign-level budget), always to the currency's exact precision (N3).
- **Row actions:** one visible `secondary` button (Pause / Resume) plus an overflow `Menu` (Edit budget; "Open in Ads Manager" if decision #3 allows deep links). On phones they move into the row's sheet. Buttons look like buttons (R3, V2).
- **Pause/Resume confirm** with `ConfirmDialog`: "Pause 'KAZI | Heavyweight Hoodies…'? Its 2 ad sets and 4 ads stop delivering. You can resume any time." After it succeeds: a toast, and the loaded children are refreshed (S7).
- **Expanding a row:** a skeleton child row while loading, an inline error with Retry if it fails, and "No ad sets" when it's empty (S6). The chevron is hidden only once a row is known to have no children.
- **Ad rows** show a 32 px thumbnail from `creative_thumbnail_url`.
- **View-only:** a `Banner` above the table says "You can see Meta Ads but not change it. Ask an admin for Edit on Meta Ads (Admin Panel → Roles)." (S8)

### 4.4 Budget editor

```
┌ Edit daily budget ──────────────────────────────────── ✕ ┐
│ KAZI | Heavyweight Hoodies | Messages | NP | Sep 26      │  (2 lines max, then ellipsis)
│ Campaign · currently $12.50 / day                        │
├──────────────────────────────────────────────────────────┤
│ New daily budget                                         │
│ [ USD │ 60.00                    ]                        │
│ +$47.50 / day vs now                                     │
│                                                          │
│ ┌ amber ─────────────────────────────────────────────┐   │  ← over 3× only
│ │ That's 4.8× the current budget.                    │   │
│ │ ☐ Yes, I meant to raise it this much               │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌ terra ─────────────────────────────────────────────┐   │  ← over ceiling: replaces
│ │ Above your $50.00 ceiling. Meta Ads → Settings     │   │     the amber box; Save off
│ └────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│                         [Cancel]  [Save $60.00 / day]    │
└──────────────────────────────────────────────────────────┘
```

- **Checks run as the user types, in order:** > 0 → over the ceiling (a hard stop; the ceiling is shown in *its own* currency, and Save is disabled) → over the multiple (amber confirm). That way the confirm can never lead to a rejection (R2).
- **Currency:** when the ceiling's currency differs from the account's, the dialog says so and doesn't compare them. The fix for this comparison is R1 in §6.
- The **Save label states exactly what will be sent**. Errors from the Worker are shown in plain words (R4).

### 4.5 Attribution

- **Info `Banner`** (blue, not mint) with one line, "Hand-tagged by staff, not tracked. Treat as a rough steer.", and a "How tagging works" disclosure holding today's full text. It ends with a link: "Tag a customer in Customers →" (V8).
- **Range:** the shared section range, with **All** as a real option. The default is all-time, shown truthfully as "All" (S3).
- **Grouped column headers** replace the pill that explained the mismatch:

  ```
  │              │ META · IN RANGE  │ TAGGED IN KAZI · ALL TIME          │ DERIVED        │
  │ CAMPAIGN     │ SPEND            │ CUSTOMERS  ORDERS  ORDER VALUE NPR │ COST/CUST  ROAS│
  ```

- **Rows** are sorted by spend. Campaigns with no spend and no tags fold into "Show 2 more". A totals row sits in `tfoot`. Numbers are right-aligned.
- **ROAS cell rules** (N8): spend 0 → "—" (no spend); rate failed → "—" with a "Rate unavailable — retry" note under the table; rate loading → skeleton; tagged orders 0 → "—". "0.00×" is never shown, because no tags means nothing was measured. The footnote, inside the card, gives the rate and the date it was fetched.
- **Phone:** one card per campaign: name, spend, "3 customers · 4 orders · NPR 412,000", ROAS.

### 4.6 Activity (new view, existing data)

- **Change log** from `meta_ads_actions`, newest first: "**{person}** paused *{campaign}* · 2 h ago", "**{person}** changed the daily budget $12.50 → $60.00 · confirmed above 3×". Filter by entity, and link from each campaign's overflow menu ("View changes").
- **Sync history**, moved here from Settings: when (relative, with the exact time and zone underneath), trigger, status tone, counts, duration (`finished_at − started_at`), and a "hit paging cap — data may be incomplete" note from `detail.pagingCaps`. Failed runs show the error with a plain-language hint where one is known, for example "Meta access token expired. An admin needs to renew `META_ACCESS_TOKEN`."

### 4.7 Settings

- **Ad accounts:** name, mono `act_` id, currency, time zone, a **Tracking** `Switch` (V7) and "last synced" as a relative time. **Add account** is a labelled field that normalises `act_` as the user types and only accepts digits, with the database error turned into words ("That account is already added").
- **Budget guard rails** as a form with a draft **save bar** (REDESIGN §4.5 `kap-savebar`):
  - *Hard ceiling*, with a currency select limited to the tracked accounts' currencies. Helper text: "No budget above this is ever sent to Meta, whoever asks."
  - *Ask to confirm above*, a `×` multiple with a minimum of 1. Helper text: "e.g. at 3×, raising $10/day to more than $30/day asks first."
  - Validation runs inline, and Save shows its loading state (R7).
- View roles see the same page read-only, with the view-only banner from §4.3.

---

## 5. Kit usage

Everything comes from REDESIGN §6. The only Meta-Ads-specific code is small composition:

| Today | Becomes |
|---|---|
| `kmkt-tabs` + `kmkt-tab--sub` | Page `Tabs` (Calendar / Meta Ads) + `Segmented` sub-nav |
| `DateRangePicker` | `DateRangeControl`: presets plus All plus Custom in a `Popover` / `Sheet`; shares Finance's `DateRangeFilter` if it fits |
| bare `.ktable`s | `DataTable` with phone roles (`title`, `status`, `amount`, `meta`, `hide`), `tfoot` totals, expandable rows, right-aligned numbers |
| `KPI` row | `StatStrip` + `Skeleton` |
| `Bars` | `BarList` |
| `AreaChart` | `ChartFrame` + chart theme (leaving the Dashboard's `AreaChart` alone) |
| `Pill` + `STATUS_TONE` / `RUN_STATUS_TONE` | `Pill` driven by `lib/status.js` Meta entries (§4.3 table) |
| ghost Pause / Edit budget | `RowActions` + `Menu`; `ConfirmDialog` for pause/resume |
| `.form-error`, `.kmkt-notice`, `.kmkt-warn`, attribution card | `Banner` (error / info / warn / view-only), toasts |
| `asCurrency` in Meta Ads | `Money` with an `exact` mode, using the currency's own precision (Intl's default fraction digits), **not** a change to `asCurrency`, which the rest of the app depends on |
| — | `MetaSectionBar` (freshness, Sync now, range, currency), `AdThumb` |

CSS moves into the page-scoped `kmkt-` prefix (REDESIGN §7). The Meta Ads block of `styles.css` (lines 1988–2108) is deleted in the same commit that replaces it.

---

## 6. Bugs to fix first

Each of these is its own `fix(...)` commit, done before any visual redesign (REDESIGN §2.1). None of them needs a design decision except where noted.

| # | Fixes | Change | Size |
|---|---|---|---|
| A1 | L1, L3, L4 | Give `.kmkt-page` a flex column (`flex: 1; min-height: 0`) and `.kmkt-metaads-body` its own scroll and gutter (`overflow-y: auto; padding` matching `.kscroll`). The calendar keeps its full-bleed shell. | XS, CSS only |
| A2 | N3 | Meta Ads money uses the currency's exact precision (a `money()` helper local to MetaAds until the kit's `Money` exists). Budgets, CPC and cost/result are never rounded. | S |
| A3 | R1, R4 | Check currency before comparing the ceiling, in both the dialog and the Worker. If the currency differs: refuse with a clear message, or convert. Decision #10. Error text in major units. | S, includes the Worker |
| A4 | R2, R7 | Run the ceiling check live and before the multiplier confirm. Validate the guard rail fields. | S |
| A5 | S1, S2, S4 | Loading state on Overview and Campaigns; one empty state. | S |
| A6 | S3, N8, S9 | Attribution: truthful range ("All" option), ROAS cell rules, clear `error` on range change. | S |
| A7 | S6, S7, R5 | Campaigns: `catch` + Retry on expand, refresh children after pause/resume, action keyed to effective status. | S |
| A8 | V2 | Define `.kbtn--secondary`, or switch the two callers to `outline`. | XS |
| A9 | N6 | Zero-fill trend days; guard `n === 1` in the Meta chart. | XS |
| A10 | N1, N2, N4 | **Needs decisions #1 and #2.** Replace "results (all actions)" and summed reach. | S–M |

---

## 7. Phases

Each phase ends with a review stop, like REDESIGN §9. One commit per component or view.

**Phase A — Fixes (§6).** Small commits. Ships on its own and makes the current UI correct and usable.

**Phase B — Section shell.** `MetaSectionBar` (freshness, Sync now, range, currency), `Segmented` sub-nav, URL state, a shared range lifted into `MetaAdsPage`, the topbar title, and the view-only banner. *Depends on:* `Segmented`, `Banner`, `Popover`/`Sheet` (decision #6).

**Phase C — Overview.** `StatStrip` + skeletons, the needs-attention banner, `ChartFrame` trend, `BarList`, Top ads with thumbnails (an RPC change: `meta_top_ads` returns `creative_thumbnail_url`), and the phone layout.

**Phase D — Campaigns.** `DataTable` with expandable rows, delivery status map, filters/search/archived toggle, `RowActions` + `ConfirmDialog`, the new budget editor (§4.4), and the phone card list + drill-down `Sheet`. Plus spend/results columns if decision #3 is yes (needs a `meta_entity_totals(level, parent_id, from, to)` RPC, in the same style as `meta_top_ads`).

**Phase E — Attribution.** Banner + disclosure, grouped headers, totals, ROAS rules, phone cards.

**Phase F — Activity + Settings.** Change log, sync history (moved), account switch + add-account validation, the guard rails form with save bar.

**Phase G — Sweep.** 360 / 390 / 768 / 1024 / 1440; every state (loading, empty, error, view-only, multi-currency, full); keyboard pass over tabs, row expand, menus and dialogs; `prefers-reduced-motion`; delete the old `kmkt-` Meta Ads CSS.

**Rough size:** Phase A ≈ 10 small commits. B–F ≈ 12–16 commits. Most of the risk is in Phase D (actions that spend real money) and in A3 (Worker change).

---

## 8. Verification

On every commit:

- `npm run build` passes (the repo has no test suite).
- In design commits, handlers and calculations are moved without being edited (REDESIGN §2.1). Changes to Worker and RPC code only appear in commits that say so.

On every view, before its commit, use the render harness from §2 at **390 × 844, 768 × 1024 and 1440 × 900**:

- No page-level horizontal scroll (`document.scrollingElement.scrollWidth <= innerWidth`).
- **Every card can be reached by scrolling.** This is the check L1 would have failed: the last card's `getBoundingClientRect().bottom` is reachable inside the scroll container.
- No table is wider than its card unless it's inside its own horizontal scroller.
- States: loading (a promise that never resolves), empty, error (a rejecting mock), view-only, multi-currency, full data.

For actions that spend real money (Phase D), test by hand against the live account with one paused test campaign before the change merges: pause, resume, budget below the multiple, above the multiple, above the ceiling, and a currency mismatch. Each one is checked against the `meta_ads_actions` row it writes.

**Offer:** the harness can be committed as `scripts/ui-harness/` (dev-only, never in the build, mocks under the same folder). Decision #11.

---

## 9. Open decisions

1. **What counts as a "result"?**
   - **(a)** Per campaign objective, from the `actions` data already stored: Engagement/Messages → `onsite_conversion.messaging_conversation_started_7d`; Leads → `lead`; Traffic → `link_click`; Awareness → no result (show reach/impressions instead). Front-end only. **(recommended)**
   - (b) A picker where the user chooses the action type.
   - (c) Drop the cost-per-result KPI.
2. **Reach:** **(a)** remove it from the KPI row and the trend for now **(recommended)**; (b) relabel it "Sum of daily reach"; (c) sync deduplicated reach for the range from Meta (a Worker change plus a new table or column).
3. **Spend and results per row in Campaigns** (data already synced; needs one aggregate RPC)? **Yes recommended.** Also add an "Open in Ads Manager" deep link?
4. **Activity view** (change log + sync history, no new data)? **Yes recommended.**
5. **Confirm before pause/resume:** at every level (recommended, it's cheap) or campaigns only?
6. **Build order against REDESIGN.md:** **(a)** use Meta Ads as the pilot for REDESIGN Phase 1, building the kit pieces it needs (`DataTable`, `Segmented`, `Banner`, `EmptyState`, `Skeleton`, `StatStrip`, `BarList`, `ChartFrame`, `RowActions`/`Menu`, `ConfirmDialog`, `Sheet`, `Money`) in `src/components/ui/` to the REDESIGN §6 APIs **(recommended)**; (b) wait for REDESIGN Phase 1, and ship only Phase A now.
7. **"Sync now" for view-only roles?** The Worker allows it ([metaAdsApi.js:39](src/lib/metaAdsApi.js#L39) says "Needs View"), but the UI hides it from them. Pick one.
8. **Default Marketing tab:** keep Calendar, or remember the last tab per person?
9. **Exchange rate for ROAS:** keep the live `open.er-api.com` rate (fetched from each viewer's browser), or use the app's own 1 GBP = 200 NPR convention plus a stored USD rate, so every page agrees?
10. **Ceiling with a different currency:** refuse the edit with a clear message **(recommended, simplest and safe)**, or convert at a stored rate?
11. **Commit the render harness** as a dev-only script (§8)?
