# Smart tech packs → automatic stock (planning notes)

Started 2026-09-20, rewritten 2026-09-21 after a second design conversation and a
read-only audit of the live database. **Build steps 1–3 and 5 are done (2026-09-22).
Migrations 0043 and 0044 are written and rehearsed but NOT APPLIED — see §8.
Still to build: the order form and the deduction itself.**

## 1. The goal

Make the tech pack the single source of truth for a product, so that:

1. **Purchases add stock** (today this barely works — see §3, it is the biggest problem in the chain).
2. **Creating an order** in `src/pages/Production.jsx` is: pick a tech pack, pick a colour, type quantities per size.
3. **After QC**, stock reduces on its own from the tech pack's material list.
4. The tech pack is built by **clicking dots on the front/back photo**, not by filling a table.

Inspiration: https://mrch.tech/ — it splits a garment photo into ~12 labelled zones
(CF zipper, inner neck, rib collar, chest logo, pockets, shoulders, cuffs, rib hem,
zip puller) with tabs for callouts, points of measure, artwork, placement, BOM and
sign-off. Its zones are found automatically from an uploaded image, and it has
**no stock or inventory side at all** — that half is ours to build.

## 2. Decisions locked in

From the 2026-09-21 conversation (staff transcript + user's answers):

| Question | Decision |
|---|---|
| Dots found by AI or placed by hand? | **By hand.** AI suggestions are a later phase, if ever. |
| What does a dot label pick from? | A **dropdown of real stock / materials**, not free text. |
| Who uses the dot editor? | **Staff only.** Website customers can't see our stock. |
| Measurements from pixels? | **No.** Staff measure the real garment and type the number. The two dots only draw *where* the measurement is taken. |
| Reusable measurement sets? | **Yes — measurement templates** ("T-Shirt", "Hoodie") that pre-fill the label column. |
| When does stock drop? | **After QC / when finished pieces come out.** Not at cutting. |
| Existing 32 tech packs? | **Left alone.** They keep working; dots can be added later, one at a time. |
| Recipes | Already removed from the app (2026-09-21). DB leftovers still to drop. |

### Why stock drops after QC, not at cutting

Staff, verbatim: *"Stock drop चाहिँ cutting पछि हिसाब गर्न सजिलो हुन्छ। तर … cutting
भइसकेर stitching मा गइसकेर अनि कति दुई-तीन वटा चाहिँ बिग्रिन्छ, अनि फेरि काट्नुपर्ने हुन्छ।
त्यही भएर फेरि दुई चोटि entry गर्नुपर्‍यो। त्यही भएर बरु piece निस्किसकेपछि stock drop गर्दा
राम्रो हुन्छ होला।"*

Counting at cutting is easier arithmetic, but pieces spoil during stitching and get
re-cut, which would mean entering the same fabric twice. QC-failed pieces have their
material reused (scrap also goes to test embroidery). So: **deduct what passed QC.**
This keeps today's `MATERIALS_STAGE = "Quality Check"` in `Production.jsx`.

### Other factory rules that drive the data model

- **10% wastage on fabric**, flat, every order. Fabric lines only.
- **S–XL use much the same material** (industry standard, pricing unchanged). **XXL / 3XL / 4XL use more and cost more.**
- **Buttons are never bought or stocked** — the button-attaching vendor supplies them. They belong on the tech pack (the factory needs to see them) but must never deduct.
- **Thread**: common colours (black, white, red) are stocked; unusual colours are bought per order.
- **Packaging**: plastic is stocked in bulk and re-ordered when it runs out. Printed paper packaging is **UK only**, already bought in quantity.
- **Fabric**: a little is kept in stock, but bulk orders buy fresh, because colour and seasonal variation means old stock rarely matches. Stock is tracked per colour.
- **Substitutions happen**: if a fabric or colour is short, the client is asked to change. The deduction step must let a person swap the item before posting.
- Costing lives in an **Excel sheet** (fabric, rib, trims, labour, embroidery) — user is sending it; the per-size gram numbers should come from there rather than being invented.

## 3. What the live database actually shows (audited 2026-09-21, read-only)

This is the part that changes the build order.

### 3.1 Purchases are almost never adding stock

| | |
|---|---|
| Purchases recorded | 233 |
| Purchase lines with a quantity | 447 |
| Lines that added stock | **6** |
| Lines that added nothing | **441**, worth **NPR 1,239,571** |
| Stock movements in the entire database | **3** |

All 3 movements are "Cotton Terry", from EXP205 / EXP214 / EXP215. Every other
purchase line silently did nothing, because `postPurchaseStockIn`
([stockLedger.js:59](src/utils/stockLedger.js#L59)) only posts when a line's
`particulars` text **exactly equals** an inventory item's name.

Plenty of the 441 are correctly skipped — HP Victus, Samsung Phone, Table, Printer,
Carpet, Histon Cooker are not stock. But the fabric is, and it was all missed. The
same fabric is typed a different way nearly every time:

```
Polister Fabric Without Brushes          ×9     NPR  99,411
Polister  Fabric Without Brushes         ×1     NPR  35,822   (double space)
polister knitted fabrics without brushes ×1     NPR  24,017
Polyster Knitted Fabrics                 ×7     NPR  45,395
Polyster Knitted Fabric                  ×2     NPR  33,054
polister knitted fabric                  ×1     NPR  25,840
Polister knitted                         ×1     NPR  21,981
Polysterr Knitted Fabrics                ×1     NPR  16,838
Lycra Terry                              ×6     NPR  34,624
lycra Terry                              ×2     NPR  43,250
```

Roughly **NPR 590,000 of fabric** in the top 25 alone never touched stock. No
amount of fuzzy matching fixes this reliably — the fix is a picker (§5.4).

### 3.2 The Dashboard's stock numbers are stale by design

All 11 inventory items have `stock_in = 0` and `stock_used = 0`; those columns were
abandoned when the dated ledger came in. But the Dashboard still computes
`openingStock + stockIn − stockUsed` at [Dashboard.jsx:651](src/pages/Dashboard.jsx#L651),
743, 951 and 1197 — so it shows nothing but the hand-typed opening figure and
ignores every real movement.

Proof: **Cotton Terry** — Dashboard says **10**, the ledger says **21.1**.

Inventory.jsx already does this correctly via `movementTotals`, so the two pages
disagree today.

### 3.3 The ledger will break silently as it grows

`fetchAll` ([db.js:180](src/lib/db.js#L180)) issues a plain `select *` with no
paging. Supabase caps a request at 1000 rows, so once `stock_movements` passes
1000 the balances quietly go wrong — no error, just numbers that drift. There are
3 rows today, and automating purchases + production will pass 1000 quickly.

### 3.4 Stock and the fabric library are not connected

| | |
|---|---|
| Inventory items | **11** (6 Finished Goods, 5 Raw Materials) |
| Materials & Fabrics library rows | **59** |
| …of which have colours filled in | **3** |
| Tech packs | **32** (17 with a front image, 16 with a back) |

Nothing joins the 59 fabrics to the 11 stock items, and stock items carry no
colour. So "fabric + colour → the exact roll to deduct from" has nothing to
resolve against. Also note the `Fabric`, `Thread & Accessories` and `Packaging`
categories exist in `STOCK_CATEGORIES` but are unused — everything is filed as
Raw Materials or Finished Goods.

### 3.5 Recipes leftovers

`product_recipes`, `fs_product_recipes`, `orders.recipe_id` and the `"recipeId"`
column in `fs_orders` still exist, plus their entries in `src/lib/schemaMap.js`.
Nothing in `src` reads them. Dropping them means re-issuing `fs_orders`, so it
belongs in a real migration. Migrations are at **0042**, so the next is **0043**.

## 4. The design

### 4.1 Dots on the photo ("callouts")

The tech pack already stores `front_sketch_url` and `back_sketch_url`. The editor
gains a front/back canvas: tap the image to drop a numbered dot, then label it.

New column `patterns.callouts jsonb`, one object per dot:

```js
{
  id: "uuid",
  side: "front" | "back",
  x: 0.42, y: 0.31,          // fraction of the image, never pixels — works on any screen
  n: 1,                       // display number, matches the list beside the image
  label: "CF zipper",
  kind: "fabric" | "trim" | "packaging",

  // what it draws from — one of these two:
  itemId:   "uuid" | null,   // a stock item directly (plastic bag, printed packaging)
  fabricId: "uuid" | null,   // a Materials & Fabrics row; colour comes from the order

  qtyBySize: { S: 0.28, M: 0.30, L: 0.32, XL: 0.34, XXL: 0.40, "3XL": 0.44 },
  unit: "g" | "kg" | "m" | "pcs",
  fromStock: true,            // false = vendor supplies it (buttons) → shown, never deducted
  colorHex: "#1a1a1a",        // sampled from the pixel under the dot, a suggestion only
  note: ""
}
```

Storing positions as fractions is how the website's Atelier editor already does it
(`app/lib/design-layers.js` in `jenithroy/kazi-platform`), so the two stay consistent.

**The dropdown.** Labelling a dot opens a picker of real stock and library
materials — reuse `StockItemSelect`, with `materialItems()` from
`productionConsumption.js` ordering the sensible categories first. Free text stays
possible for things that aren't stock (buttons), but the default is to pick.

**One dot = one BOM line.** The list beside the image *is* the material list; there
is no second table to keep in sync.

### 4.2 Measurements as two dots

`patterns.measurements` today is `[{label, inch}]` — one size only. It becomes:

```js
{
  label: "Chest",
  bySize: { S: 20, M: 21, L: 22, XL: 23 },   // typed from the real garment
  inch: "21",                                 // kept for old rows and the print sheet
  line: { side: "front", x1: 0.3, y1: 0.4, x2: 0.7, y2: 0.4 } | null
}
```

Two taps draw the line; the numbers are typed, never measured from pixels, because
photos distort. `line` is optional — an old tech pack with numbers and no line is
still valid.

### 4.3 Measurement templates

New table `measurement_templates`: `id`, `name` ("T-Shirt", "Hoodie", "Bomber"),
`product_type`, `labels jsonb` (the ordered label list), `market`, timestamps.

Applying one fills the label column so staff only type numbers. Saving the current
grid as a new template is one button. Templates carry **labels only**, not
positions — dot positions depend on the photo.

### 4.4 Linking stock to fabrics and colour

The rule: **the Materials & Fabrics library is the catalogue of *kinds*; an
inventory item is a *kind in one colour*** — the physical thing you deduct from.

- Add `inventory_items.fabric_id` (→ `fabrics.id`) and `inventory_items.color` (+ `color_hex`).
- Thread and rib move into the Materials & Fabrics library too, with their colours — the tab is already named for it, and thread varies by colour exactly like fabric.
- A fabric dot points at the **fabric**, not a stock item, because the colour isn't known until an order exists.
- At order time, fabric + chosen colour resolves to the stock item. More than one match → the person picks. No match → offer to create the item. **Never guess silently** — a wrong guess deducts from the wrong roll.
- Trims and packaging that don't vary (plastic bags, printed paper packaging) point straight at a stock item.

Back-filling colours on the 59 library rows is data entry someone has to do; only 3
have colours today.

### 4.5 Order form

- Replace the single **Quantity** with a **size grid**, limited to the tech pack's sizes. `quantity` stays as the sum.
- Add `orders.pattern_id` and `orders.size_breakdown jsonb`.
- **"Needs vs in stock" panel** while typing: fabric kg including the 10% wastage, trims, packaging, against stock on hand, flagged short/OK. Nothing is deducted here.
- **Snapshot the resolved materials onto the order when it is saved**, so editing the tech pack later never changes what an in-flight order deducts.

### 4.6 Deduction

- Fires when the order leaves QC, using the snapshot × pieces that passed.
- Tagged `source: "production"`, `source_id` = order ref (`ORD-051`), reversible — `undoProductionStockOut` already does this.
- `MaterialsUsedModal` shrinks to a confirm/correct step, pre-filled: *"planned 38 kg, used ___"*. Swapping an item or amount stays possible (substitutions are normal). Planned-vs-actual variance is how the gram numbers improve over time.
- Warn, don't block, if a deduction takes an item below zero.
- Lines with `fromStock: false` are listed but never posted.

### 4.7 Colour palette from the image

Sampling the pixel under a dot is reliable and nearly free. Extracting a whole
palette from the photo picks up background and shadow, so it stays a suggestion
next to the colour picker, never an automatic assignment. Low priority.

## 5. Build order

Plumbing first — the dots are worthless if stock numbers are wrong underneath.

1. ~~**Fix the Dashboard**~~ **— done 2026-09-22.** ([Dashboard.jsx:651](src/pages/Dashboard.jsx#L651), 743, 951, 1197): fetch `stock_movements` and use the same `stockClosing` helper Inventory uses. Delete the `stockIn`/`stockUsed` arithmetic.
2. ~~**Page `fetchAll`**~~ **— done 2026-09-22.** ([db.js:180](src/lib/db.js#L180)) with a `.range()` loop so no caller can silently lose rows. Later, a `fs_stock_balances` view so the client stops pulling the whole ledger at all.
3. ~~**Purchase line item picker**~~ **— done 2026-09-22.** — `stockItemId` on `line_items`, reusing `StockItemSelect`, exactly as sales invoices already do. Keep the name match as a fallback for old rows.
4. **Migration 0043 — written, rehearsed, NOT YET APPLIED.** The fabric/colour half is done and is the file in the repo; the rest below stays for a later migration: `inventory_items.fabric_id` / `color` / `color_hex`; `patterns.callouts`, `wastage_pct`, new `measurements` shape; `measurement_templates`; `orders.pattern_id` / `size_breakdown` / materials snapshot; `production_read` policy on `patterns`; drop the recipes leftovers and re-issue `fs_orders` + `fs_patterns` (re-set `security_invoker` after `create or replace view`, as 0039 did). Then regenerate `src/lib/schemaMap.js`.
5. ~~**Tech pack editor**~~ **— done 2026-09-22.** Dot canvas, stock/fabric dropdown, per-size quantities, per-size measurements, measurement templates.
6. **Order form**: tech pack picker, size grid, colour → stock item resolution, needs-vs-stock panel, snapshot on save.
7. **Deduction at QC** from the snapshot; shrink `MaterialsUsedModal` to confirm/correct.
8. Colour sampling; AI-drafted dots much later, if at all.

## 6. Constraints that must not be broken

- **Printed sheets are compliance artefacts** ([PRODUCT.md:39](PRODUCT.md#L39)). The tech-pack spec print sheet keeps its exact current output — dots and per-size grids are screen-only, and structured materials must still render into the existing fabric rows and trims boxes.
- Business logic (stock balances) must not change as a side effect of UI work.
- UK / Nepal region split: `orders.region`, `patterns.market`, `filterByRegion`.
- Permissions are enforced by Supabase RLS; the UI must match what the DB allows.
- Migrations must be safe to re-run (`if not exists`, `drop policy if exists`).
- Stack: React 18 + Vite, Supabase, Capacitor. Migrations in `supabase/migrations/`, latest **0042**.

## 7. Still open

1. ~~Backfill or fresh start?~~ **Decided 2026-09-22: physical count, clean start.** Count what is in the store, set that as opening stock on a chosen date, automate from there. Past purchases stay accounting records only; no historical movements are created. Manual stock editing stays as it is — it is how the count gets entered (the per-item ledger panel in Inventory, and the item's Opening Stock field).
2. **Per-size gram numbers** have to come from the costing Excel sheet the user is sending, or from whoever runs cutting. Estimating from measurements × GSM is 10–15% off because it ignores marker layout.
3. Should the "Fabric Used (grams / pc)" idea come back as a read-only derived figure on the order, now that the tech pack can compute it?
4. Do the 59 library rows get their colours filled in by hand, or only as each one is first purchased?

## 8. Status

### Done 2026-09-22 (build steps 1–3, plus the 0043 file)

- **Dashboard now reads the real ledger.** Both dashboards load `stock_movements` and use `stockClosing`; the dead `stockIn`/`stockUsed` arithmetic is gone from all four places. The ledger is deliberately not region-filtered (the item carries the region, not the movement).
- **`fetchAll` pages.** A full first page triggers a stable, id-ordered page-through; anything under 1000 rows issues the same single query as before, in the same order.
- **Purchase lines can name their stock item.** A quiet "Not stock / …" dropdown under each Particulars box, on both the Finance new-purchase row and the Purchases list. `postPurchaseStockIn` prefers that link and keeps the old exact-name match as a fallback. New `syncPurchaseStockIn` re-posts a purchase's movements after an edit — previously, editing a purchase left its old movements untouched, so linking an item to an existing purchase did nothing at all.
- **Migration `0043_stock_fabric_colour_link.sql`** adds `inventory_items.fabric_id` / `color` / `color_hex`, indexes the fabric, and re-issues `fs_inventory`. Rehearsed twice in pglite: re-runnable, existing rows byte-identical, and deleting a fabric nulls the link instead of deleting the stock item.
- **The Inventory UI for it is gated on the migration.** `supportsFabricLink` checks whether a loaded row actually has `fabricId`, so before 0043 is applied the fields simply do not appear and nothing tries to write them; afterwards they appear with no redeploy. `schemaMap.js` was hand-edited with the three entries the generator will produce, because `toRow()` silently drops unmapped keys.
- Verified with the esbuild + headless-Edge harness: 15 checks over the picker and `postPurchaseStockIn`, including that an explicit link beats a conflicting name and that a misspelt name still posts nothing. `vite build` clean.

### Done 2026-09-22 (build step 5 — the tech pack editor)

- **`src/utils/techPackMaterials.js`** — the material maths, pure and testable: per-size quantities, the 10% fabric wastage, order totals, which callouts can actually be deducted and which are set aside (vendor-supplied, or not finished). 32 checks pass.
- **`src/components/TechPackCallouts.jsx`** — the board. Tap the front or back sketch to drop a numbered dot; each dot is one BOM line with a label, a kind, a source (Materials & Fabrics row / a specific stock item / vendor-supplied), a per-piece quantity and a colour sampled from the pixel under the dot. Dots drag to move, are numbered per side, and turn amber until they could actually deduct something. Positions are fractions of the image, not pixels. Quantities are entered as two buckets (S–XL, XXL+) with a per-size view for exceptions — that is how the factory costs them.
- **Measurement lines** — two taps on the photo mark where a measurement is taken. The inches are always typed from the real garment; nothing is derived from pixel distance.
- **`src/components/MeasurementGrid.jsx`** — one column per size, with the column the printed sheet quotes highlighted and named underneath. Templates fill the point NAMES only, and only the ones missing, so applying one over a part-filled grid cannot wipe measured numbers.
- **The printed spec sheet is untouched** — `TechPackSpecPreview` has no diff at all. `syncMeasurementInch` keeps `inch` equal to the spec size's column on save, so per-size data never changes what comes out of the printer. A hand-typed `inch` with no per-size number is left alone.
- **Fabrics/Linings and Trims keep their own wording.** A "Fill from photo points" button is offered next to each, never applied automatically, because those two boxes are what the sheet prints.
- **Migration `0044_techpack_callouts_and_measurements.sql`** — `patterns.callouts` + `wastage_pct`, a `measurement_templates` table with its RLS and view, `production_read` on `patterns`, and `fs_patterns` re-issued. Rehearsed twice in pglite: re-runnable, a legacy tech pack comes back byte-identical, duplicate template names rejected.
- Verified: 27 checks in the headless-Edge harness over the board and the grid, 32 over the maths, plus a screenshot against the real stylesheet. `vite build` clean.
- One real bug the tests caught: picking "a specific stock item" flipped straight back to "fabric", because the chosen source was derived from whichever id happened to be set and neither was, yet. The editor now holds that choice in its own state.

### Not done

- **0043 and 0044 have not been applied.** Migrations here are pasted into the Supabase SQL editor by hand. Until then the fabric/colour fields and the dot board stay hidden behind their capability checks, and the rest of the tech pack sheet behaves exactly as it does today.
- **The order form and the deduction** (build steps 6–7) are not built: no tech pack picker on an order, no size grid, no "needs vs in stock" panel, no automatic deduction at QC. `MaterialsUsedModal` is still the manual dialog.
- Nobody has entered a per-size gram figure yet — see §7.2.
- 2026-09-21: recipes UI removed (`RecipesTab.jsx` deleted, recipe picker gone from the order form, `MaterialsUsedModal` is now a manual dialog). DB leftovers remain — see §3.5.
- Migration 0039 must be applied for production deductions to save at all.
- `fabricGramsUsed` / `fabricCostPerPcNPR` / `materialCostTotalNPR` stay in the database and are carried through when an older order is saved, though the form no longer asks for them.
