# Kazi ERP — Redesign Plan

> Status: **approved 2026-09-11, building on `feat/responsive-redesign`.** The §12 decisions are answered; phases run in order with a review stop after each.
> Written 2026-09-11 from a full read of every page and shared component (~28,900 lines of JSX plus the 6,743-line `styles.css`).

---

## 1. Goal

Rebuild the front end of every page so the whole app:

1. **Looks like one product.** It should share the visual language of the newer pages: [Roles](src/pages/Roles.jsx), [Usage & Activity](src/pages/Usage.jsx), [Admin Panel](src/pages/AdminPanel.jsx) and [Messenger](src/pages/Messenger.jsx).
2. **Works at every width** from a 360 px phone to a 1440 px+ desktop, with no page-level sideways scrolling and no text broken letter by letter.
3. **Keeps every behaviour.** Calculations, permissions, data writes, keyboard entry, tours, and printed or PDF documents all work exactly as they do today.

### Confirmed with you

| Question | Answer |
|---|---|
| Visual target | The newer pages' style (Roles / Usage / Admin / Messenger) |
| Device priority | Mostly desktop use, but **everything must be responsive** |
| Printed & PDF documents | **The document output stays the same.** The UI around it (toolbars, previews' frames, forms, modals) gets restyled |
| Git | New branch, **one commit per page / component** |
| Build style | Plan first (this file), then phases with a review between each |

Product facts are recorded in [PRODUCT.md](PRODUCT.md).

---

## 2. Ground rules for every commit

These hold on every page, in every phase.

1. **No business-logic changes inside a design commit.** Maths, handlers, database writes, permission checks and region filtering move over verbatim. A real bug gets its own `fix(...)` commit (see §11).
2. **Split, then restyle.** For the five giant files (Inventory, Production, Finance, Dashboard, Billing), the first commit only splits the file into smaller modules with zero behaviour change. The next commit does the redesign. That way each diff can be reviewed on its own terms.
3. **Documents are frozen.** Nothing inside these changes:
   - the A4 `.invoice-page` in [DocPreview](src/components/DocPreview.jsx)
   - [InvoicePDF.jsx](src/components/InvoicePDF.jsx)
   - the salary slip preview and its print-window HTML in [SalarySlipModal](src/components/SalarySlipModal.jsx)
   - the tech-pack spec sheet and the stock-ledger print report
   - the helpers they use: `formatDescription`, `numWords`, `calcTotals`, `fmtCurrency*`
   - the global `.invoice-page` rule (styles.css ~L1215)
   - `#kinv-spec-print-area`, `#kinv-ledger-print-area`, `.kinv-no-print`, and the `@media print` block
4. **Hooks the code depends on stay put:**
   - every `data-tour="…"` anchor (14 of them; used by the "Show me" tours)
   - `data-role="particulars" | "item-description" | "purchase-date"` and `[data-kb-select]` (Enter-to-advance data entry)
   - datalist ids `kinv-fabric-names` and `kinv-season-options`
   - the `RegionSwitch` exports API (used by 17 files)
5. **Keyboard-first entry keeps working:** Enter-to-advance, `KeyboardSelect`, and the Shift+letter Finance tab shortcuts.
6. **View-only roles still see the whole page, read-only.** Hidden edit controls stay hidden.
7. **Honest content.** No invented numbers, sparklines, deltas or copy. Empty, loading, error and restricted states say what is actually true.

---

## 3. What we're fixing (current state)

| Problem | Evidence |
|---|---|
| Two visual languages | New pages use scoped CSS prefixes with real breakpoints. Old pages use **1,775 inline `style={{}}` objects** (Inventory 273, Finance 177, Production 141, Dashboard 124, Employees 121, Billing ~105, Attendance 102, Tasks 85). |
| No shared parts | **11** different modal implementations, **~9** tab implementations, **~12** button class families (`primary-button`, `ghost-button`, `kbtn`, `kap-btn`, `kbil-btn-*`, `kinv-btn-*`, `kchat-ghost-btn`, `kbug-submit` …), and **6** page-header implementations. |
| Letter-by-letter text on phones | `.kscroll { overflow-wrap: anywhere; }` at ≤768 px ([styles.css:2855](src/styles.css#L2855)) is applied to the app's main scroll area, while wide tables are squeezed into a 480–600 px `min-width`. |
| Tables not built for phones | Employees 15 cols, Items Cost 15, Order P&L 13, Billing 12, Stock Levels 12, Item Details 12, Purchases 12, QC 10, Attendance 9, Expenses 9, Journal 9, Bank 9. |
| Layout grids that never collapse | `kfin-kpis` (4 cols, also used by Billing and FY pages), `kfin-charts`, `kfin-pl`, `kfin-bs`, `kbil-cols` line-item grid, `kbil-page-hd`, `kdash-qa`. Inline `gridColumn: "span 2/3"` also forces overflow once forms go single-column (Production order form, Billing). |
| Touch-hostile interactions | Drag-and-drop is HTML5-only on the Tasks board, Production pipeline and Marketing calendar, so it does nothing on touch. Row actions and delete buttons only show on hover. Tooltips are hover-only. Tap targets are 14–24 px. |
| Modals that don't fit phones | Tasks (11 fields, no scrolling), SalarySlip (fixed 2-column 960 px), Billing payment modal, Order form. **None trap focus**; most ignore Escape. |
| Native dialogs | **64** `alert` / `confirm` / `prompt` calls across 16 files. |
| Tailwind play CDN in `index.html` | Only [MarketingCalendar](src/components/MarketingCalendar.jsx) uses Tailwind classes. But the CDN also injects Tailwind's *Preflight* reset for the **whole app**, so the other pages silently depend on it. |
| A global rule that stretches buttons | At ≤480 px `.primary-button { width: 100% }` stretches every primary button, including ones inside table cells and card action rows. |
| Stale design docs | [DESIGN.md](DESIGN.md) describes Poppins, Firebase and a gradient-green look that no longer exists. The real tokens (Geist, mint/forest) live at the top of `styles.css`. |

---

## 4. Design direction — the Kazi house style

This is an **extension of an established world**, not a new identity. The newer pages already define it, and we're pulling it out into a system and applying it everywhere. Mode: **Operate.** The tool should disappear into the task, so the priorities are scanability, consistent affordances and density where people need it.

### 4.1 Keep the existing tokens

We keep the tokens at the top of `styles.css`:

- **Ink:** `--ink` to `--ink-5`
- **Surfaces:** `--bg`, `--bg-2`, `--card`, `--line`, `--line-strong`
- **Dark forest sidebar:** `--dark*`
- **Mint brand:** `--mint`, `--mint-2`, `--mint-deep`, `--mint-soft`
- **Status:** amber, terra and blue, each with a `-soft` variant
- **Shape:** `--r-card: 14px`, `--r-input: 10px`, `--r-pill`
- **Shadows:** `--shadow-1`, `--shadow-2`, `--shadow-pop`
- **Fonts:** Geist and Geist Mono

### 4.2 Add a few semantic tokens

The same raw values are repeated in dozens of places today, so they become tokens:

| Token | Value today (repeated inline) | Used for |
|---|---|---|
| `--mint-deep-hover` | `#185a3d` | primary hover |
| `--terra-ink` / `--amber-ink` / `--blue-ink` | `#6a2e1c` / `#7a5418` / `#2a4f6f` | text on soft status fills |
| `--r-control` / `--r-sm` | 9px / 7px | buttons & inputs / small chips |
| `--scrim` | `rgba(10,28,20,.4)` | modal & drawer backdrop |
| `--focus-ring` | `0 0 0 3px var(--mint-soft)` + `--mint-2` border | every focusable control |
| `--chart-1…10` | the Usage page `PALETTE` | every chart, one palette |
| `--stage-*` | replaces Tailwind-palette hexes in ProductionCalendar / Sales | order stages everywhere |

### 4.3 Typography

- One family: Geist, with a fixed rem scale and no fluid headings.

| Role | Spec |
|---|---|
| Page title | 20px / 650 / -0.02em (as `kap-title`) |
| Page description | 13px `--ink-3`, max 64ch |
| Card / section title | 13.5–15px / 650, **sentence case** |
| Micro label (field labels, group headers, table headers) | 10.5–11px / 700 / uppercase / .06em / `--ink-4` |
| Body | 13–13.5px |
| Meta | 11.5–12px `--ink-4` |
| Numbers | `tabular-nums`, right-aligned in tables |
| IDs, codes, SHAs | Geist Mono |

- Inputs render at **16px on coarse pointers / ≤768px** so iOS doesn't zoom on focus.

### 4.4 Colour

Restrained:

- Mint-deep is the single accent, used for primary actions, current selection and positive state only.
- Status uses one **tone map** (§6, `lib/status.js`) so the same status never shows two colours on different pages. Today Billing's `statusBadge` and Customers' `Pill` disagree about Draft and Sent.
- Emoji used as icons (🖨️ ⚡ 💡 🧾 🏖️ ⚠️ 🗓️ ✕ …) are replaced by the `Icons` set. The region flags stay: they're content, not icons.

### 4.5 Components' look

Taken directly from the reference pages:

- **Card:** white surface, 1px `--line`, radius 14, `--shadow-1`. The header row sits on a hairline divider with its actions on the right and wraps on narrow screens (`kap-card`).
- **Buttons** (`kap-btn`):
  - base: 12.5px / 600, 7px × 13px padding, radius 9
  - primary: `--mint-deep` fill (not the dark fill the current `Btn` uses)
  - secondary: white fill with a `--line-strong` border
  - ghost: transparent
  - danger: terra-soft fill
  - also: small size, icon-only with `aria-label`, and a loading state
- **Inputs:** 1.5px `--line-strong` border, radius 9. Focus shows a `--mint-2` border plus the 3px mint-soft ring.
- **Segmented control** (`kap-seg` / `kusg-chips` / `kregion-seg`): a `--bg-2` track; the active segment has a card background, `--shadow-1` and mint-deep text.
- **Banners** (`kap-note` / `kap-error`): icon, text and an optional dismiss button.
- **Empty state** (`kchat-empty`): an icon in a soft circle, a title, one honest line and an optional action.
- **Skeletons:** a shimmer (`kap-skel`), never a "Loading…" paragraph in the middle of content.
- **Draft save bar** (`kap-savebar`): used anywhere edits are staged before saving.

### 4.6 Motion

- 120–200 ms, only to convey state changes (open, close, save, move).
- Every animation has a `prefers-reduced-motion` fallback.
- No page-load choreography.

### 4.7 Out of scope unless you ask

- Dark mode, a new colour identity, new fonts
- New features or new metrics on pages
- Changing what the documents look like

---

## 5. Responsive system

### 5.1 Breakpoints

Content-driven. We write min-width queries on top of phone-first base styles, and use container queries where a component's own width matters, not the viewport's.

| Name | Width | Shell | Layout |
|---|---|---|---|
| phone | < 640 | hamburger drawer (native app: bottom nav) | 1 column |
| large phone / small tablet | 640–899 | drawer | 1–2 columns |
| tablet | 900–1199 | drawer or collapsed sidebar | 2 columns, master–detail |
| desktop | ≥ 1200 | full sidebar | multi-column, dense tables |

Every page is checked at **360, 390, 768, 1024 and 1440**.

### 5.2 Rules every page follows

1. **No page-level horizontal scroll, ever.** Only three things may scroll sideways inside their own container: a spreadsheet (§5.3), a calendar/Gantt, or a chart legend.
2. **Tables use the `DataTable` pattern.** A real `<table>` on wide containers turns into **stacked cards** on narrow ones:
   - each column declares its phone role: `title`, `subtitle`, `meta`, `amount`, `status`, `hide`, or `detail` (shown in an expand/sheet)
   - row actions become one visible primary action plus an overflow menu
3. **Forms go single-column on phones.** `FormGrid` controls column spans through props and classes, never inline `gridColumn`. Long forms split into titled sections.
4. **Modals become bottom sheets on phones.** The body scrolls, the footer (Save/Cancel) is sticky, Escape and backdrop close it, focus is trapped and restored.
5. **Nothing depends on hover.** Hover-revealed actions stay visible on `(hover: none)`, and hover tooltips get a tap target or inline text.
6. **Tap targets are ≥ 40 px on coarse pointers,** without inflating desktop density. We use `(pointer: coarse)` instead of the blanket rule that makes every button 44 px at ≤768 px.
7. **Drag-and-drop gets a touch equivalent:** every draggable card has a "Move to…" menu. Drag stays on desktop.
8. **Charts size to their container** (ResizeObserver or ResponsiveContainer). Tooltips open on tap, and there are no fixed-px SVG widths.
9. **Kanban boards:**
   - desktop: fixed-width columns (~280 px) in a horizontal scroller (no wrapping to a second row)
   - phone: one column at a time, with a segmented column switcher showing counts
10. **Tab bars:**
    - desktop: underline tabs with count badges and a fade edge when they scroll
    - phone: tabs scroll, or become a select menu once there are more than ~5
11. **Safe areas are respected** (`env(safe-area-inset-*)`) in the native app shell, sheets and the save bar.

### 5.3 Spreadsheet exceptions

These screens are genuinely spreadsheet work, so they keep a table on tablet and desktop. The table gets a sticky first column, visible input borders on touch, and horizontal scroll inside its card. On phones each row becomes a card with an edit sheet.

- Inventory → Items Cost (15 cols)
- Inventory → Stock Ledger report (10 cols, also printable)
- Finance → Purchases entry and the Purchases page (`PurchaseRowGroup`, rowSpan line items)
- Billing → line-items editor

---

## 6. Component kit

We extend the existing design-system location instead of starting a second one. `src/components/ui.jsx` becomes `src/components/ui/`, with an `index.js` that re-exports everything, so every existing `import … from "../components/ui"` keeps working.

**Existing pieces, kept and fixed:**

- `Card`: add `actions` wrap and `flush` variants.
- `Btn`: primary becomes mint-deep; add `secondary`, `IconBtn` and `loading`. Its current doc comment is wrong.
- `Pill`: driven by the status tone map.
- `KPI`: remove the inline font size; add `href`/`onClick` for linked KPIs.
- `Avatar`, `Progress`, `SegBar`, `Spark`, `Icons`: add the missing icons (Print, Upload, Filter, Sort, Menu, Undo, Grip).

**New pieces:**

| Component | Replaces | Notes |
|---|---|---|
| `PageHeader` | `.page-header`, `.kph`, `kap-top`, `kchg-header`, `kbug-header`, `kbil-page-hd` | title, description, actions slot (region switch, currency, primary action), optional back link and stats. Stacks on phones. |
| `Toolbar` / `FilterBar` + `SearchInput` | `kcust-controls`, `kusg-scope`, `kbrf-bar`, ad-hoc search inputs | wraps; can collapse into a "Filters" sheet on phones |
| `Tabs` | `tab-row`, `kfin-tabs`, `kinv-tabs`, `kchat-tabs` | counts, overflow fade, arrow-key navigation, optional group separators, phone select mode |
| `Segmented` | `kap-seg`, `kusg-chips`, `kcal-toggle`, `kadm-toggle`, loose primary/ghost toggles | view toggles, %/Amt, AD/BS, NPR/GBP |
| `Field`, `FormGrid`, `FormSection`, `Input`/`Select`/`Textarea`, `Checkbox`, `Switch` | `grid-form`, `kfin-form`, `kap-field`, `kbug-field`, inline input styles | label, hint, error, required marker; responsive spans |
| `DataTable` | `table-wrap`, `kfin-tbl`, `kinv-table`, `kopl-tbl`, `kusg-table`, `ktable`, div grids | columns config with phone roles, sort, totals row (`tfoot`), empty/loading/error, row actions, expandable rows, sticky first column, spreadsheet mode |
| `RowActions` + `Menu` | inline button clusters, stacked `kbil-tbl-actions` | the popover is portalled so `overflow` containers can't clip it |
| `Money` | dozens of inline "NPR … / (£ …)" pairs | NPR primary with GBP secondary, honours the currency toggle, owed/settled tone |
| `Dialog`, `Sheet` (right drawer ≥ 900, bottom sheet < 900) | all 11 modal implementations | focus trap, Escape, restore focus, sticky footer, scrollable body |
| `ConfirmDialog` + `useConfirm()`; toasts (`react-hot-toast` is already a dependency) | the 64 `alert` / `confirm` / `prompt` calls | same wording; `if (!(await confirm({...}))) return;` |
| `Banner` | `banner-warning`, `kfin-notice`, `kap-note`, `kap-error`, `kusg-error`, `kchat-error`, `kbug-banner` | info / warn / error / view-only |
| `EmptyState`, `Skeleton`, `ErrorState` | "Loading…" text, emoji empties, `kskel` variants | |
| `StatStrip` | `kfin-kpis`, `kinv-kpis`, `stats-grid`, `kprod-ministat`, `kopl-kpis`, `krsp-4` | auto-fit grid of `KPI`s: 4 → 2 → 1 |
| `Stepper` | Production 10-step stepper, OrderManagement stepper | full on wide screens; "Stage 4 of 10 · Stitching" plus a progress bar on narrow |
| `Kanban` (board, column, card shell, move menu) | `ktasks-*`, `kprod-board`, MarketingCalendar inbox | desktop drag and a touch "Move to…" menu; the page supplies the persistence callbacks |
| `MonthGrid` / `Agenda` | Attendance `MonthCalendar`, `kcal-day-cell`, MarketingCalendar grid | month grid on wide screens, agenda list on phones |
| `FileDrop` | 4 upload SVG copies, `kazi-dropzone`, VAT upload with progress | single, multi and progress |
| `Popover` | FXPopover, EmbellishmentPicker, KeyboardSelect listbox | portalled; KeyboardSelect gets `aria-expanded` / `aria-activedescendant` and keeps its keyboard behaviour |
| `Statement` | `kfin-pl-*`, `kfin-bs` | section, label/value rows, subtotal, net; 2 → 1 columns |
| `BarList` | Sales stage bars, Customers top-5, Usage ranked list | |
| `ChartFrame` + chart theme | fixed-height Recharts and custom SVG viz | responsive height, tap tooltips, shared palette |
| `lib/status.js` | `statusBadge`, `STATUS_COLOR`, `STAGE_COLORS`, `CATEGORY_COLORS`, `toneStyles` | one status → tone and stage → colour map |
| `lib/people.js` | `hueFromName` / `initials`, copied in 5+ files | |

**Kit preview route:** `/__kit` is a dev-only page (guarded by `import.meta.env.DEV`, never in production builds). It renders every component in every state. That lets us screenshot the kit at phone and desktop widths without signing in.

---

## 7. CSS architecture

`styles.css` (6,743 lines, one global file) becomes:

```
src/styles/
  index.css        # imports, in order ↓
  tokens.css       # :root tokens (existing + §4.2 additions)
  base.css         # explicit reset replacing what Tailwind Preflight was silently providing
  shell.css        # sidebar, topbar, drawer, bottom nav, login, no-access
  kit.css          # all component-kit styles (.k-* classes)
  legacy.css       # the remainder of today's styles.css, shrinking every commit
src/pages/<Page>/
  index.jsx        # route entry (App.jsx import path is unchanged)
  <Page>.css       # page-scoped styles, one prefix per page
  …parts.jsx
```

- **One prefix per page, kept:** `kdash-`, `ktask-`, `katt-`, `kprod-`, `kqc-`, `kinv-`, `ksales-`, `kfin-`, `kbil-`, `kbud-`, `kemp-`, `kcust-`, `kmkt-`, `kchat-`, `kap-`, `kusg-`, `krole-`, `kbug-`, `kchg-`.
- **Each page's legacy CSS is deleted in the same commit that migrates the page,** so `legacy.css` should be empty by Phase 7.
- **Inline styles** are allowed only for runtime values (a progress width, a computed position, a hue from a name).
- **Tailwind CDN removal happens in Phase 7,** after `base.css` has replaced Preflight (Phase 1) and MarketingCalendar has been rewritten (Phase 6). Only then is `<script src="https://cdn.tailwindcss.com">` deleted from `index.html`.

---

## 8. Page-by-page plan

Each entry lists the key problems, the target layout on desktop and phone, and what must be preserved. "Split" means a behaviour-neutral file split commit comes first.

### 8.0 App shell — [AppLayout](src/components/AppLayout.jsx), [Sidebar](src/components/Sidebar.jsx), [Login](src/pages/Login.jsx), [RequireSection](src/components/RequireSection.jsx), [LandingRedirect](src/components/LandingRedirect.jsx)

- **Fixes:**
  - Remove `.kscroll { overflow-wrap: anywhere }`.
  - The topbar currency toggle is inline-styled; it becomes a `Segmented` control.
  - The user chip shows a chevron but opens nothing: either make it a real menu (profile, Bug report, Log out) or drop the chevron.
  - The sidebar search (`readOnly`, "⌘K") and the ⌘1–⌘5 shortcut hints need checking. If they aren't wired up, hide them rather than advertise them.
- **Desktop:** sidebar unchanged in identity. Topbar: breadcrumb (greeting on the dashboard), currency, user menu.
- **Phone:** sticky compact topbar (menu, page title, currency, avatar). The drawer gets Escape, a focus trap and scroll lock. The native app bottom nav stays as it is.
- **Login:** align inputs and buttons to the kit. Keep the synchronous `isRecoveryPending()` initialiser, all three modes, the `autoComplete` attributes and the Supabase → Firebase fallback exactly as they are.
- **No-access card:** kit `EmptyState`.

### 8.1 Dashboard — [Dashboard.jsx](src/pages/Dashboard.jsx) (1,663 lines) · Split

- **Split into** `Dashboard/{index, NepalAdminDash, UKAdminDash, EmployeeDash, cards/*}`. The cards include SalesTarget, OpsAlerts, ActiveOrders, DispatchQueue, ProductPnL, Points, BudgetApproval and AttendanceCalendar.
- **Problems:**
  - quick-actions bar doesn't wrap
  - active-orders grid is fixed 620 px; dispatch rows don't wrap
  - ProductPnL has 9-column inline editing
  - AreaChart is fixed 240 px × 800 viewBox, so labels shrink to ~4 px on phones
  - hover-only tooltips
  - navigation uses `window.location.href` (full reload)
- **Desktop:** RegionSwitch and quick actions in a toolbar, then an alert strip, a KPI `StatStrip`, and a 12-column card grid ordered by the same priorities as today.
- **Phone:** single column in this order: clock-in, alerts, KPIs 2-up, active orders as cards, then everything else. Charts become full-width responsive.
- **ProductPnL:** a `DataTable` with an edit sheet on phones. Keep the upsert on `code` and the seed-on-empty behaviour.
- **Preserve:**
  - the three role branches
  - `load()` metric maths and `subscribe()` live reloads
  - `getSalesTargetInfo`
  - budget `handleDecision`
  - BankBalanceWidget behaviour
- **Honesty (needs your call, §12):** hard-coded sparkline arrays and `delta={18.4}` on Revenue MTD; "Late this week" shows today's count; "Done · 7d" counts all time.

### 8.2 Tasks — [Tasks.jsx](src/pages/Tasks.jsx) (977)

- **Problems:**
  - drag-and-drop does nothing on touch
  - a 5th column wraps to a new row
  - New/Edit modals have 11 fields and no scrolling, so Save falls off-screen on phones
  - assignee chips are shown twice
  - delete × is 14 px and uses `window.confirm`
  - `ASSIGNEE_COLORS` hard-codes six people's names
- **Desktop:** header (region, Filters with an active count, New task), one filter bar (assignee, customer, category chips), then the `Kanban` board in a horizontal scroller with an "Add section" tile at the end.
- **Phone:** a column switcher (Segmented with counts) shows one column at a time. Cards get a "Move to…" menu. Filters open in a sheet.
- **Dialogs:** one shared `TaskForm` inside `Dialog`/`Sheet` for both New and Edit, with sections (Details / Assignment / Schedule). Colours come from `hueFromName`.
- **Preserve:**
  - `loadColumns` dedupe and seed
  - `handleDrop` and `handleEditSave` points awards
  - `handleColumnReorder`
  - `ownTasksOnly`
  - region default on add
- **Fix commit:** users without edit rights can currently open and save the Edit modal (§11).

### 8.3 Attendance — [Attendance.jsx](src/pages/Attendance.jsx) (692) + [ClockInCard](src/components/ClockInCard.jsx) (465)

- **Problems:**
  - 9-column staff log is 780 px wide
  - calendar column fixed at 350 px
  - status dots have hover-only tooltips
  - Daily/Report are loose buttons instead of a segmented control
  - hand-built confirm overlay
- **Admin desktop:** `PageHeader` (Save Changes) and a `Segmented` Daily log / Employee report. Two columns: `MonthGrid` (~320 px) and the staff log `DataTable`.
- **Admin phone:**
  - Calendar collapses to a week strip with a "Month" expander.
  - Each staff row is a card: avatar, name, status pill, in → out, hours.
  - Edit opens a sheet with Status and the Late-cut checkbox.
- **Report view:** `StatStrip` of 6 stats and a month `DataTable`, which becomes cards on phones.
- **Employee view:** clock-in hero and a "My status" card.
- **ClockInCard:** restyle every state (checking, idle, locating, success, far, low accuracy, GPS error, saving, clocked in, clocked out, Saturday). Move the 1-second clock into its own small component so the whole card doesn't re-render every second. Keep `startClock`, `confirmClockIn(isBypass)`, `handleClockOut`, `handleClockBackIn`, haptics and points.
- **Preserve:** `loadAll`, `setEmployeeScheduleOverrides`, the Late → confirm flow, `lateCutApplied`.
- **Fix commits:** per-row Save upserts every row; the `isDeepa` email check (§11).

### 8.4 Production — [Production.jsx](src/pages/Production.jsx) (2,257) + [ProductionCalendar](src/components/ProductionCalendar.jsx) (679) · Split

- **Split into** `Production/{index, PipelineTab, OrdersTab, CalendarTab, BatchesTab, OrderCard, StageStepper, OrderFormDialog, InvoiceDialog, OrderNotes, EmbellishmentPicker}`.
- **Problems:**
  - inline `gridColumn: span 2` breaks the single-column form
  - the 10-step stepper is crushed on phones
  - drag-only pipeline
  - the 5-setter modal reset is copy-pasted 3 times
  - calendar month grid is 650 px with no scroll wrapper, so the header misaligns
  - the month Gantt is ~2,170 px wide
  - `badge-warn` and `kprod-suggestion-banner` have no CSS
- **Pipeline:** `Kanban` with 6 columns. Touch gets Back/Next plus a "Move to…" menu, following the same advance rules as the buttons. Cards show a Pill, progress bar, quantity and due date; the expanded view becomes a `Sheet` on phones.
- **Orders tab:** `StatStrip`, then `OrderCard`s (header pills, `Stepper`, action footer with an overflow menu, expandable P&L grid and history). "Completed & Cancelled" is a collapsible group.
- **Order form:** `OrderFormDialog` in a full-screen sheet on phones, with sections: Customer & style / Quantities & pricing / Schedule & assignment / Invoice. It keeps the live order-value box and the "Issue invoice" sub-section.
- **Calendar:**
  - desktop: month grid inside its own scroll container
  - phone: an **agenda list** by default
  - Gantt: sticky order column, horizontal scroll, and a tap on a bar opens a detail sheet instead of a tooltip
  - stage colours come from `--stage-*`
- **Batches:** form card plus a `DataTable` (cards on phones).
- **Preserve:**
  - `advanceStage`, `reverseStage`, `moveOrderToCol` (Telegram notification, dispatch callable, points)
  - `submitOrder` (auto fabric insert, value maths, field remaps, `buildInvoiceDoc`)
  - `computeFabricCostProd`, `labourRatePerUnit`
  - `submitBatch` points
  - `OrderNotesSection` upload, compress and delete
  - `handleSaveReschedule`
- **Fix commits:** duplicate order IDs across regions; "+ Invoice" always shown; `issueInvoiceForOrder` gets stuck on error; calendar dates shifted by a day (§11).

### 8.5 Quality Control — [QualityControl.jsx](src/pages/QualityControl.jsx) (228)

- Form card with `FormGrid` (Batch, Date, Inspected / Passed / Rejected, Defect, Action, Region), then the logs `DataTable` (cards on phones) with a proper empty state.
- `RegionField` becomes disabled for view-only users. No new metrics unless you ask.
- **Preserve:** `addQcLog`, the rejection-rate display.

### 8.6 Inventory & Library — [Inventory.jsx](src/pages/Inventory.jsx) (4,146) · Split (largest risk)

- **Split into:**
  - `utils/imageUpload.js`
  - `Inventory/{index, constants, StockLevelsTab (+ LedgerPanel, SizeBreakdownPanel), ItemDetailsTab, ItemsCostTab (+ unitEconomics), StockLedgerReport, AddItemForms}`
  - `Inventory/library/{fabrics/*, techpacks/* (Card, Viewer, SpecModal, SpecPreview, SketchUpload), ProcessCard, SampleCard, ProcessSampleModal}`
  - shared `FileDrop`, `SheetCell`
- **Information architecture:** today there are 8 flat tabs. Proposed: two groups under one tab bar, **Stock** (Stock levels, Item details, Stock ledger, Items cost) and **Library** (Fabrics, Processes, Tech packs, Samples). Needs your OK (§12).
- **Stock levels:**
  - desktop: `DataTable`, low-stock rows tinted, expandable detail (movement log form, history, size breakdown, damage tags)
  - phone: cards (item, balance vs min, condition), with detail in a `Sheet`
  - the dirty-row Save state is shown clearly
- **Item details:** `DataTable` (cards on phones).
- **Items cost:** spreadsheet exception (§5.3). Sticky item column, `SheetCell` inputs with visible borders on touch, GP/margin pill. Phone: per-item card showing total, target and margin, with a cost-breakdown edit sheet.
- **Stock ledger report:** date range toolbar and Print. The report stays in its print area unchanged; only the screen chrome around it changes.
- **Library:**
  - grids use `repeat(auto-fill, minmax(min(280px, 100%), 1fr))`
  - media cards come from the kit
  - FabricDrawer → `Sheet`; AddFabric / Process / Sample → `Dialog`
  - TechPackSpecModal → full-screen sheet on phones with sections
  - TechPackSpecPreview: the document is frozen; restyle the chrome only
  - TechPackViewer: already mobile-aware; restyle its chrome
- **Preserve:**
  - `logMovement`, `saveRow`, the size and damage helpers
  - `computeFabricCost`, `saveEconomicsRow`, `addEconomicsItem`
  - image upload fallback, `nextStyleCode`
  - print IDs, `data-tour` anchors, datalist IDs
- **Fix commits:** broken delete (infinite recursion), the skeleton animation name, fabric datalist only on one tab; stock-value formula inconsistency needs a question (§11).

### 8.7 Sales — [Sales.jsx](src/pages/Sales.jsx) (212)

- Remove the doubled `padding: 28px 32px` and 39 inline styles.
- Layout: `PageHeader`, `StatStrip`, then two cards (pipeline by stage as a `BarList` with stage tokens; top customers as a `BarList`), then recent active orders as a `DataTable` (cards on phones) with formatted dates instead of raw ISO.
- **Preserve:** the stage breakdown and "this month / this week" definitions. The timezone bug is flagged in §11.

### 8.8 Finance — [Finance.jsx](src/pages/Finance.jsx) (2,202) · Split

- **Split into:** `Finance/{index, constants, useFinanceData (loadData), selectors (summary, ledger, cashBankLedger, pl, bs, orderPlRows), FinanceKpis, FinanceCharts, tabs/{Expenses, PurchaseEntry, VatBills, Journal (+ JournalEditRow), Ledger (AccountLedgerTable, AccountCard), PnL, BalanceSheet, Bank, OrderPnL (+ OrderCostSheet)}}`.
- **Tabs:** 9 tabs grouped as *Money in & out* (Expenses, Purchases, VAT bills, Bank) · *Books* (Journal, Ledger, P&L, Balance sheet) · *Orders* (Order P&L). They keep permission filtering and Shift+letter shortcuts, with shortcut hints shown only on fine pointers. Needs your OK (§12).
- **KPIs and charts:** `StatStrip` (4 → 2 → 1) using linked KPIs; `ChartFrame` for the donut and bars with responsive heights and no crushed angled labels.
- **Expenses:** collapsible "Add expense" form card (VAT upload with progress via `FileDrop`), then a `DataTable` (cards on phones) with Mark paid and Delete in row actions.
- **Purchases entry:** spreadsheet exception. On phones `PurchaseRowGroup` renders a stacked form: header fields, then line-item cards, then totals. The `data-role` hooks stay so Enter-to-advance keeps working on desktop.
- **VAT bills:** upload card and a `DataTable`.
- **Journal:** form (keeps `KeyboardSelect` Enter-to-advance) and a `DataTable`. The inline edit row stays on desktop and becomes an edit sheet on phones.
- **Ledger:** one card per account (accordion on phones) with the running-balance table, the clickable opening balance, a totals footer, and an "Other accounts" card grid.
- **P&L and Balance sheet:** `Statement` component, 2 columns → 1.
- **Bank:** collapsible form, a mini `StatStrip`, and a `DataTable`.
- **Order P&L:** `StatStrip`, filter bar, a 13-column `DataTable` (cards on phones: order, customer, revenue, profit, margin pill), and the cost editor as a `Sheet`.
- **KeyboardSelect:** portal the listbox so table scrollers can't clip it, and add ARIA. Keyboard behaviour is untouched.
- **Preserve:**
  - `loadData` one-off fixes (seeds, renames, dedupes)
  - `nextExpenseId`, `addPurchase` + `postPurchaseStockIn`
  - `addExpense` upload chain
  - Dr ≠ Cr and advance-account validation
  - `commitLedgerDraft`
  - Order P&L maths and labour prefill
  - `financeReturnState` return-to-tab
- **Fix commits:** bank KPI reads `amount` but the form saves `amountNPR`; the balance sheet float `===` check; `setActiveTab` called during render (§11).

### 8.9 Fiscal-year transactions — [FiscalYearTransactions.jsx](src/pages/FiscalYearTransactions.jsx) (303)

- `PageHeader` with back link, region switch and a Prev/Next FY stepper. Then `StatStrip`, type summary as chips, a filter bar (type, search), and the list as a `DataTable` (cards on phones) with signed amounts.
- **Preserve:** fiscal-year bucketing, payroll date synthesis, sign conventions, `financeTabAllowed` gating.

### 8.10 Purchases — [Purchases.jsx](src/pages/Purchases.jsx) (289) + [PurchaseRowGroup](src/components/PurchaseRowGroup.jsx) (334)

- Same responsive `PurchaseRowGroup` as Finance. Header gets back link, count and totals, and the region switch; search sits in a toolbar. The view-only notice becomes a `Banner`.
- **Preserve (carefully):**
  - blur-away autosave (`purchaseDrafts`, `commitPurchaseDraft`, `onBlurAway`)
  - the Delete button's `onMouseDown` stopPropagation
  - `deletePurchase` cascade
  - `applyItemChange`, `purchaseVatAmount`, `purchaseGrandTotal`, `itemsForEdit`
- **Fix commit:** the displayed EXP id uses list position instead of `expenseId` (§11).

### 8.11 Billing — [Billing.jsx](src/pages/Billing.jsx) (1,540) + [DocPreview](src/components/DocPreview.jsx) chrome · Split

- **Split into:** `Billing/{index, useBillingDocs, billingActions, BillingKpis, DocHeaderFields, LineItemsEditor (+ FXPopover), TotalsPanel, DocTable (+ DocRowActions, DateModeToggle), PaymentDialog (+ PaymentHistory)}`. One `DocTable` serves both active and cancelled.
- **Layout:** `PageHeader` (back to Finance, region, New document), then `Tabs` VAT Invoice / Challan / Quotation with counts, then `StatStrip`.
- **Document editor:**
  - desktop: a full-width card with a 3-column `FormGrid` for details, the line-items editor, and a totals panel beside notes and terms
  - phone: a full-screen `Sheet` with sections; line items become stacked cards; totals are a sticky summary
  - FX converter becomes a portalled `Popover`
  - all `data-role` and `[data-kb-select]` hooks stay
- **Document list:** `DataTable` with right-aligned money cells and one status Pill map. Up to 5 row actions become a primary action plus an overflow menu. Phone cards show number, client, total, credit due and status. The cancelled block is a collapsible `DataTable`.
- **Payment modal:** `Dialog` (sheet on phones), keeping the live "after payment" preview.
- **DocPreview:** restyle **only** the overlay and toolbar (Download PDF, Print, Back). On phones the fixed 794 px A4 page is visually scaled to fit using a screen-only transform on a wrapper. `.invoice-page`, its markup and the print pop-up are untouched.
- **Preserve:**
  - PAN-over-50,000 rule
  - edit-to-Paid settling payment
  - `fiscalYearForDate` + `getNextNumber`
  - type-field pruning, `postSaleStockOut`
  - `recordPayment` overpayment guard
  - `convertToInvoice`
  - pro-rata VAT in `summary`
  - Finance deep-link auto-edit
- **Fix commits:** empty-state and CSV labels say "Invoice" on every tab; invoices never set `customerId`, to verify; the print dialog opens twice (§11).

### 8.12 Budget — [Budget.jsx](src/pages/Budget.jsx) (537)

- `PageHeader` (region, New request) and `Tabs` Budget requests / Requirements with pending counts.
- **Requests tab:** `FilterBar` (status Segmented, urgency select), then request cards in an auto-fill grid with Approve/Reject for reviewers.
- **Requirements tab:** form card, then a `DataTable` (cards on phones).
- Urgency uses Pill tones (today `.priority-tag` has no CSS). `NewRequestModal` becomes a `Dialog`.
- **Preserve:** `nextBrId(allBudgetRows)`, the NPR ↔ GBP linkage, default "Pending" filter, reviewer role check.
- **Fix commit:** submit gets stuck on failure (§11).

### 8.13 Employees & HR — [Employees.jsx](src/pages/Employees.jsx) (1,167) + [SalarySlipModal](src/components/SalarySlipModal.jsx) (606)

- `PageHeader` (Salary slip, Add employee), `Tabs` Directory / Org chart / Payroll, back-to-Finance link when arriving from Finance.
- **Directory:**
  - `StatStrip`, then a `DataTable` with a proposed condensed column set: Name + email, Role, Department, Location, Status, Actions.
  - Clicking a row opens an **employee detail sheet** with the rest: phone, join date, salary (NPR + GBP), PAN, bank, reports-to, schedule and exceptions, production-worker flag.
  - Phone: cards. Needs your OK (§12).
- **Add / edit employee:** `Sheet`/`Dialog` with sections: Personal / Job & access (with the position hint) / Pay & bank / Work schedule (days, times, day exceptions) / Production worker.
- **Org chart:**
  - desktop: tree in a pannable scroll container
  - phone: indented list view
  - inline `ORG_CSS` string moves to CSS
- **Payroll:** form card with the attendance-driven late-deduction panel and salary calculation `Statement`, then a records `DataTable` (cards on phones).
- **SalarySlipModal:**
  - desktop: form left, slip preview right
  - phone: Segmented "Details | Preview"
  - the slip preview markup and print-window HTML are frozen
  - Escape and backdrop close
- **Preserve:**
  - `createEmployeeLogin` (throwaway signup client + reset email)
  - payroll `autoCalculate` from attendance
  - `calcPayroll`
  - `setEmployeeScheduleOverrides`
  - slip field mapping

### 8.14 Customers — [Customers.jsx](src/pages/Customers.jsx) (738) + [CustomerPicker](src/components/CustomerPicker.jsx) (162)

- `PageHeader` (currency, region, Add customer), `StatStrip`, then a collection split card (`SegBar` + legend) and a top customers `BarList`. `FilterBar`: search, "Only those who owe" switch, sort as Segmented on desktop / select on phones.
- **List:**
  - desktop: the existing row grid, restyled
  - phone: stacked cards (name, outstanding, collected bar, overflow menu) instead of the forced 760 px scroll
  - detail: inline expand on desktop, `Sheet` on phones
- Customer form and merge dialog become `Dialog`s.
- CustomerPicker: kit fields; keep `NEW` / `UNLINKED`, the clash check and Enter `preventDefault`.
- **Preserve:** `rollUp`, overdue and payment-speed maths, sort rules, `handleMerge` field names.

### 8.15 Marketing calendar — [MarketingCalendar.jsx](src/components/MarketingCalendar.jsx) (719)

- **Rewrite styling off Tailwind** onto the kit and a `kmkt-` prefix. Tailwind is 100% of its styling today and uses a zinc/emerald/violet palette of its own.
- **Desktop:** ideas inbox rail, toolbar (month nav, New idea, Today), month grid, legend.
- **Phone:** inbox as a tab or sheet; the month grid becomes an agenda list.
- **Detail drawer:** becomes a `Sheet` with Escape. `prompt()` for the media URL becomes an inline field. Hover-only delete and "+" become visible buttons.
- **Touch scheduling:** drag is the only way to schedule today, so the drawer gets a **date field**. This is the one small behaviour addition in the plan, and it's needed for touch (§12).
- **Preserve:** `subscribe()`, seed-on-empty, save-on-keystroke keyed by `selected.id`.
- Flagged in §11: `id: null` race, clicking a day inserts a row immediately, no permission checks.

### 8.16 Messenger, Admin Panel, Usage, Roles — reference pages, align only

- These define the style, so **little changes visually.** Their private primitives become kit components; the kit is built *from* them, so the look should stay the same:
  - `kap-btn`, `kap-seg`, `kap-search`, `kap-field`
  - `kusg-chip`, `kusg-select`
  - `kchat-ghost-btn`, `kchat-danger-btn`
  - the `ChatBits` `Dialog` on `kbrf-*` classes
- Admin's four `window.confirm` calls become `ConfirmDialog`.
- **Preserve:** Admin draft/save-bar/navigation guard; Messenger panes and realtime; Usage realtime coalescing; Roles RLS-aware rendering.

### 8.17 Bug Report & Changelog — [BugReport.jsx](src/pages/BugReport.jsx), [Changelog.jsx](src/pages/Changelog.jsx)

- Shared `PageHeader` (these two currently duplicate the icon/title/sub pattern under two prefixes), kit `Field`s, `FileDrop`, `Banner`, `EmptyState` and `Skeleton`.
- **Preserve:** the multipart field names posted to `/api/bug-report`; Changelog cache key, `fetchingRef` guard and sentinel.

### 8.18 Dead code to delete (Phase 0)

Nothing imports any of these. Three of them don't even compile.

| File | Why |
|---|---|
| [Accounting.jsx](src/pages/Accounting.jsx) (514) | `/accounting` redirects to Finance; sibling JSX roots, invalid syntax |
| [OrderManagement.jsx](src/pages/OrderManagement.jsx) (866) | `/orders` redirects to Production; invalid syntax; relies on columns that don't exist |
| [Content.jsx](src/pages/Content.jsx) (173) | `/content` renders Budget; invalid syntax |
| [StatCard.jsx](src/components/StatCard.jsx) (11) | unused |

Their CSS goes with them: `kacc-2col` and the `[style*="repeat(7"]` hack. (`stat-card` stays: Employees and Production still use it until their redesign. `secondary-button` never had any CSS.) `KANBAN_STAGES` and `ORDER_PRIORITIES` in `constants/enums.js` were only used by OrderManagement and go too.

---

## 9. Phases

Each phase ends with a **review stop.** You check the branch in your browser before the next phase starts. All work happens on `feat/responsive-redesign`, one commit per page or component, using the repo's conventional commit style (`feat(scope): …`, `fix(scope): …`, `refactor(scope): …`).

### Phase 0 — Prep
1. Create branch `feat/responsive-redesign`. Commit `PRODUCT.md` and `REDESIGN.md`.
2. `fix(layout)`: remove `overflow-wrap: anywhere` from `.kscroll` (the letter-splitting bug).
3. `chore`: delete the dead files in §8.18 and their CSS.
4. Set up verification (§10): `/__kit` route skeleton and the screenshot script.
5. Capture **before** screenshots and **baseline document output**: one of each document type (invoice, challan, quotation PDF and print), salary slip, spec sheet print, stock ledger print.

### Phase 1 — Foundations
1. `refactor(styles)`: split `styles.css` into `tokens / base / shell / kit / legacy` with zero visual change. Add `base.css` so nothing depends on Tailwind Preflight.
2. `feat(tokens)`: §4.2 semantic tokens, `lib/status.js`, `lib/people.js`.
3. `feat(ui)`: move `ui.jsx` into `ui/` with a re-exporting index and fix `Btn`, `Pill`, `KPI`, `Card`.
4. `feat(ui)`, one commit per group:
   - PageHeader / Toolbar / SearchInput
   - Tabs / Segmented
   - Field / FormGrid / inputs / Switch
   - DataTable / RowActions / Menu / Money
   - Dialog / Sheet / ConfirmDialog / toasts
   - Banner / EmptyState / Skeleton / StatStrip
   - Stepper / Kanban / MonthGrid / Agenda
   - FileDrop / Popover / Statement / BarList / ChartFrame
5. `/__kit` page showing every component in every state, screenshotted at 390 and 1440.

### Phase 2 — Shell
`AppLayout` topbar and user menu, `Sidebar` and mobile drawer, native `BottomNav` check, `Login`, `RequireSection` / `LandingRedirect`.

### Phase 3 — Workspace (daily-use pages)
Dashboard (split, then redesign), Tasks, Attendance + ClockInCard.

### Phase 4 — Operations
Production (split, then redesign) + ProductionCalendar, Quality Control, Inventory & Library (split, then redesign, probably several commits: stock tabs / cost tab / library / modals).

### Phase 5 — Money
Finance (split, then redesign, one commit per tab group), Fiscal-year transactions, Purchases + PurchaseRowGroup, Billing (split, then redesign) + DocPreview chrome, Budget, Sales.

### Phase 6 — People & comms
Employees + SalarySlipModal, Customers + CustomerPicker, MarketingCalendar (Tailwind rewrite).

### Phase 7 — System & finish
1. Align Messenger, Admin Panel, Usage and Roles to the kit; Bug Report and Changelog.
2. Remove the Tailwind CDN from `index.html`; delete the rest of `legacy.css`.
3. Full sweep at 360 / 390 / 768 / 1024 / 1440: no page-level horizontal scroll, tap targets, focus order, Escape, reduced motion.
4. Run the design detector over the changed files; fix what it finds; final review.
5. Compare document output against the Phase 0 baseline; it must be identical.
6. Rewrite `DESIGN.md` from the built system, since the current one is stale.

**Rough size:** ~45–60 commits.
- **Heaviest:** Inventory, Finance, Billing, Production, Dashboard.
- **Lightest:** QC, Sales, Budget, Bug Report, Changelog, and the reference pages.

---

## 10. Verification

**Every commit:**
- `npm run build` passes. There's no test suite in the repo, so the build is the automated gate.
- The diff is reviewed against §2: in design commits, handlers and calculations are moved, not edited.
- Grep the touched files: no new inline `style={{}}` except runtime values; no emoji icons; `data-tour` and `data-role` hooks still present.

**Every page, before its commit:**
- Screenshots at **390 × 844** and **1440 × 900**, plus 768 for table-heavy pages. Check:
  - `document.scrollingElement.scrollWidth <= innerWidth` (no page-level sideways scroll)
  - no clipped menus or popovers
  - every state reachable: empty, loading, error, view-only, full data
- Keyboard pass where the page has keyboard entry: Enter-to-advance, `KeyboardSelect`, tab shortcuts.
- A "Show me" tour step for the page still lands on its anchor.

**Documents:** after Billing, Employees and Inventory, re-generate the Phase 0 baseline documents and compare them. Any difference is a regression.

**Tooling:** headless Microsoft Edge is installed. The dev-only `/__kit` route can be screenshotted without logging in. Real pages sit behind Supabase auth, so page screenshots need a decision (§12, #1).

---

## 11. Bugs found while reading the code

These are **not** mixed into design commits. Unless you say otherwise, each becomes its own `fix(...)` commit on the branch, done just before the redesign of the page it lives on.

| # | Sev | Page | Bug |
|---|---|---|---|
| 1 | **High** | Inventory | Local `async function deleteRow` shadows the imported db `deleteRow` and calls itself forever. **Deleting stock items, processes, tech packs and samples fails.** |
| 2 | **High** | Production | `nextOrderId` counts only the region-filtered orders, so **order IDs can repeat across UK and Nepal.** |
| 3 | **High** | Production | The list checks `order.invoiceNumber`, but orders store `invoiceRef`. **"+ Invoice" always shows, so an order can be invoiced twice.** |
| 4 | **High** | Attendance | The per-row Save calls `saveRows`, which upserts **every** row, so saving one person writes Absent records for everyone without one. |
| 5 | Med | Tasks | Clicking a card always opens the Edit modal and can save, even for roles without tasks edit rights (RLS may still block the write). |
| 6 | Med | Finance | The bank form saves `amountNPR`, but the Bank KPI strip reads `t.amount`, so manually added transactions count as 0. |
| 7 | Med | Purchases | The displayed ID is `EXP${index+1}` instead of `row.expenseId`, so it doesn't match what the ledger searches for. |
| 8 | Med | ProductionCalendar | Dates are built with `toISOString()` from local midnight, so in Nepal and UK summer time orders likely show one day early. |
| 9 | Med | Dashboard | Hard-coded sparklines and `delta={18.4}`; "Late this week" shows today; "Done · 7d" counts all time. |
| 10 | Med | Production | `issueInvoiceForOrder` has no try/catch (saving state gets stuck) and sets no region on the invoice. |
| 11 | Med | Billing | Invoices never set `customerId` (free-text client), which may explain invoices missing from Customers totals. Needs checking against the database first. |
| 12 | Med | MarketingCalendar | New items start with `id: null`, so edits made before the insert returns are lost; clicking any day inserts a row; no permission checks. |
| 13 | Low | Finance | Balance-sheet check compares floats with `===`; `setActiveTab` is called during render. |
| 14 | Low | QC | `QC${allLogs.length+1}` IDs collide if a log is ever deleted. |
| 15 | Low | Attendance | Employee report access is gated by one hard-coded email (`isDeepa`), not a permission. |
| 16 | Low | BankBalanceWidget | Visibility is a hard-coded name allowlist (`zen`, `finn`, `wilson`, `admin`), not a permission. |
| 17 | Low | Budget | `submitBudget` / `submitReq` have no try/finally, so the button sticks on "Submitting…" after a failure. |
| 18 | Low | Billing | Empty state and CSV header say "Invoice" on the Challan and Quotation tabs. |
| 19 | Low | DocPreview, SalarySlip | `print()` fires twice (onload and timeout), so the print dialog may open twice. SalarySlip also writes unescaped values into the print window. |
| 20 | Low | Inventory | Skeleton uses a non-existent `pulse` animation; the `kinv-fabric-names` datalist only renders on the Items cost tab, so the tech-pack fabric autocomplete is empty. |
| 21 | Low | Dashboard | Navigation uses `window.location.href`, a full page reload instead of router navigation. |
| ? | Question | Inventory | Stock value is `closing × COGS` on Items cost but `closing × unitCostNPR` on Item details. Which is intended? |

---

## 12. Decisions

### Answered 2026-09-11

| # | Decision |
|---|---|
| 1 | **(a)** Signed-in screenshots with headless Edge. It uses the owner's own account, not a separate test account; the credentials live only in the git-ignored `.env.local`. Screenshot runs only navigate and open read-only views, never save. |
| 2 | Fix the §11 bugs on this branch, one `fix:` commit each, just before the page's redesign. |
| 3 | Employees directory: 6 columns plus a detail sheet. |
| 4 | Group Finance's and Inventory's tabs. |
| 5 | Remove Dashboard's invented sparklines and delta; correct the mislabelled counts. |
| 6 | Add a date field to the marketing idea drawer. |
| 7 | Delete the dead files in §8.18. |
| 8 | Rewrite `DESIGN.md` only. `README.md`, `PERMISSIONS.md` and `PRODUCT_BRIEF.md` are left alone. |

### The questions as asked

1. **How should I verify pages behind login?**
   - **(a)** You put a test account's email and password in a git-ignored `.env.local`. A dev-only script signs in with Supabase, and headless Edge screenshots each page at phone and desktop widths. This adds `puppeteer-core` as a dev dependency.
   - **(b)** I screenshot only the `/__kit` page, and you check real pages yourself at each phase stop.
2. **The bugs in §11:** fix them on this branch as separate `fix:` commits before each page's redesign (recommended), or leave them as a list for later?
3. **Employees directory:** move salary, PAN, bank and schedule into a detail sheet and keep the table to 6 columns (recommended), or keep all 15 columns in a horizontally scrolling table?
4. **Grouped tabs:** OK to group Finance's 9 tabs (Money in & out / Books / Orders) and Inventory's 8 tabs (Stock / Library)? The tabs stay the same; they're just visually grouped.
5. **Dashboard's fake numbers (bug #9):** remove the invented sparklines and delta until real data exists (recommended), or keep them for now?
6. **Marketing calendar:** OK to add a date field to the idea drawer so phone users can schedule without drag-and-drop?
7. **Delete the dead files** in §8.18?
8. **Stale docs:** rewrite `DESIGN.md` at the end (planned). Also refresh `README.md`, `PERMISSIONS.md` and `PRODUCT_BRIEF.md`, which still describe the Firebase / hard-coded-role app?
