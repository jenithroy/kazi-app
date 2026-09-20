# Smart tech packs → automatic stock deduction (planning notes)

Written 2026-09-20 from a design conversation. Nothing in this file has been built yet.

## 1. The goal

Make the tech pack the single source of truth for a product, so that:

1. **Purchases add stock** (already mostly works, see §3.4).
2. **Creating an order** in `src/pages/Production.jsx` is just: pick a tech pack, pick a colour, type quantities per size.
3. **When the order reaches a certain stage**, stock reduces on its own, using the materials and per-size amounts stored on the tech pack.
4. The **Recipes tab is removed**. Tech packs replace it.

Inspiration: https://mrch.tech/ (seen on reels; not opened or verified). From the screenshot, it splits a garment (a bomber jacket) into 12 labelled parts: CF zipper, inner neck, rib collar, chest logo, right/left pocket, R/L shoulder, right/left cuff, rib hem, zip puller. Each part is effectively one material/BOM line. A later phase could propose a tech pack's material list from an uploaded photo (draft only, a human must check it).

The user said they don't know much about the factory floor, so anything that needs factory numbers (grams per piece per size) must be collected from whoever runs cutting. The code comments say a person called Anusha builds tech packs by hand today.

## 2. Decisions made so far

- **Remove the Recipes tab and fold everything into tech packs.** Agreed.
- **The `product_recipes` table holds no data**, per the user, so it can be dropped outright. No copy or migration of recipe rows is needed. (Earlier suggestion of a staged drop is superseded.)
- Stock is added from Purchases, reduced by Production when an order reaches a stage.
- Users want deduction to be **automatic** ("it just reduces the stocks on its own").

## 3. What exists today (verified by reading the code)

### 3.1 Recipes feature (commits a38b832 and 7612e48, 2026-09-18)

- `supabase/migrations/0039_product_recipes.sql`
  - table `product_recipes` (`name`, `wastage_pct`, `lines` jsonb, `notes`); unique on `lower(name)`.
  - `lines` is `[{kind: fabric|trim|packaging, label, itemId, qty, qtyLarge, unit: g|kg|m|pcs}]`. `qty` is S to XL, `qtyLarge` is XXL and above. Wastage applies to fabric lines only.
  - RLS: read for inventory or production viewers (`production_read`), write for inventory editors.
  - `orders.recipe_id uuid references product_recipes(id) on delete set null`; `fs_orders` view re-issued to expose `"recipeId"`.
  - `stock_movements.source` check widened to include `'production'`.
- `src/components/RecipesTab.jsx` (recipe editor and list), mounted in `src/pages/Inventory.jsx` (tab `recipes`, `canEditRecipes`, `newRecipeRequest`, import at line 4, tab registered around line 2528, header button around 3200, render around 3632).
- `src/components/MaterialsUsedModal.jsx`, popup that pre-fills from the recipe and posts the deductions. Has two inputs: standard pieces and XXL+ pieces.
- `src/components/StockItemSelect.jsx`, inventory item picker (reusable).
- `src/utils/productionConsumption.js`, pure helpers: `plannedLineQty`, `resolveRows`, `matchRecipe` (matches recipe to style name by string), `suggestItem` (guesses fabric item by name containing fabric type and colour), `convertQty` (g/kg only; metres to grams is unsupported without width and GSM), `materialItems`, `orderRefOf`.
- `src/utils/stockLedger.js`, `logStockMovement`, `postPurchaseStockIn`, `postSaleStockOut`, and production movements (`source: "production"`, `source_id` = order ref like `ORD-051`; there is a lookup and delete by order ref around line 146, probably used for undo).
- `src/pages/Production.jsx`
  - `MATERIALS_STAGE = "Quality Check"` (line ~63). Comment: materials come out when finished pieces leave QC, not at Cutting, because a piece spoiled in stitching gets re-cut and deducting at Cutting would mean entering that fabric twice. `STAGES_AWAITING_STOCK_DEDUCTION = ["Packing", "Shipped"]`.
  - Loads `recipes` via `fetchAll("recipes")` (~line 1028) and `deductionRows`.
  - `selectOrderRecipe` (~1208) sets `orderForm.recipeId` and defaults `styleName` from the recipe name.
  - Order save writes `recipeId` (~1279, ~1312); edit loads it (~1356).
  - `handleAdvance`-style flow at ~1376–1390: leaving QC opens `MaterialsUsedModal` if `canDeductStock` and the order hasn't been deducted (`deductedRefs`).
  - "Materials used" buttons at ~538 and ~1807; modal mounted via `materialsModal` state (~946).
  - Order form (~2195–2240) has: Fabric type, Colorway, **Sample** select (`sampleId`, from `samples`), **Quantity (pcs)** as a single number, Price per piece, **Fabric Used (grams / pc)** as a manual field, Fabric cost/pc.
- Also touched: `src/lib/schemaMap.js`, `scripts/gen-schema-map.cjs`, `src/lib/activity.js`, `src/utils/stockLedger.js`, `src/lib/roles.js` (grep hits for recipe).

### 3.2 Tech packs (table `patterns`, view `fs_patterns`)

Columns: `style_no`, `name`, `product_type`, `category`, `season`, `market`, `designer_name`, `sizes_available text[]`, `available_colors`, `spec_size`, `spec_date`, `trims` (free text), `wash_care`, `remarks`, `notes`, `measurements jsonb` (array of `{label, inch}`, **one size column only**), `fabric_rows jsonb` (up to 3 rows of `{fabricName, description}`, free text), `front_sketch_url`, `back_sketch_url`, `tech_pack_url`, `tech_pack_images text[]`.
RLS: `sect_read` / `sect_write` gated to the inventory section. **No production read policy**, which Production will need.

UI: `TechPackSpecModal` in `src/pages/Inventory.jsx` (~line 1161), `emptyTechPackSpec` (~188), `nextStyleCode` (`#KAZI001` style). The tech pack spec is also a **printed sheet**.

### 3.3 Constraints from `PRODUCT.md`

- Printed and PDF documents, including **tech-pack spec print sheets**, are compliance artefacts. Their output stays exactly as it is; only the UI around them may change. So the new structured materials must render into the existing fabric and trims boxes and not change the printed layout.
- Business logic (stock balances etc.) must not change as a side effect of UI work.
- A UK / Nepal region switch splits most records (`filterByRegion`). `orders.region`, patterns have `market`.
- Permissions are enforced by Supabase RLS; the UI must match what the DB allows.
- Stack: React 18 + Vite, Supabase, Capacitor wrapper. Migrations live in `supabase/migrations/` (last is `0039`; next is `0040`).

### 3.4 Purchases → stock

`postPurchaseStockIn` in `src/utils/stockLedger.js` posts an "in" movement **only when a purchase line's `particulars` exactly equals an inventory item's name** (case-insensitive, trimmed). Anything else is skipped silently. This works, but is fragile: "Black jersey 180gsm" vs "Black Jersey 180 GSM" adds no stock and gives no error. Deleting a purchase also removes its linked stock entries (`Purchases.jsx` ~119–127).

## 4. Gaps identified

1. **Tech pack and recipe are two separate things** joined only by a typed name string. Orders link to `recipe_id` and `sample_id` but not to a tech pack.
2. **An order has a single `quantity`.** Real orders are split by size (e.g. 20 S / 40 M / 30 L). Today, someone re-types two buckets (S–XL, XXL+) at QC time.
3. **No look-ahead.** Stock effect is only visible after the fact; the useful moment is at order creation ("needs 38 kg black jersey, stock 25, short 13").
4. **Tech pack measurements only cover one size.** Fabrics and trims are free text, so they can't drive inventory.

## 5. Proposed design

### 5.1 Tech pack gets structured materials, per size

- New jsonb on `patterns` (name TBD, e.g. `materials`), one object per material line:
  `{ kind: fabric|trim|packaging, label, itemId (nullable for fabric), qtyBySize: {S, M, L, XL, XXL, ...}, unit, deductAt (optional stage) }`
- Plus `wastage_pct` on the tech pack (applies to fabric lines).
- **Per-size quantities, single inventory item per line.** Two zipper lengths = two lines, each with 0 for the sizes it doesn't apply to. This avoids needing per-size item overrides.
- Measurement grid gets **one column per size** (currently one `inch` value).
- **Fabric is special:** stock is tracked per colour but the tech pack doesn't know the colour. The tech pack line names the fabric type (ideally linked to the fabric library, which has `available_colors`), and the **order form resolves it to the actual stock item once the colour is chosen**. If more than one item matches, the person picks before saving. Don't silently guess: a wrong pre-selection deducts from the wrong roll (existing `suggestItem` already follows this principle).
- Keep the printed sheet identical: render structured materials into the existing fabric rows and trims boxes.

### 5.2 Order form (Production.jsx)

- Replace the **Recipe** picker and the **Sample**-driven flow with a **Tech pack** picker (filtered by region/market).
- Replace the single **Quantity** with a **size grid** (only sizes the tech pack offers). `quantity` = sum. Store the breakdown, e.g. `orders.size_breakdown jsonb`.
- Add `orders.pattern_id` (references `patterns`, on delete set null).
- Live **"Needs vs in stock" panel**: fabric kg (incl. wastage), trims, packaging vs stock on hand, with short/OK flags. No deduction at this point.
- **Snapshot the materials onto the order at creation** (resolved item ids plus per-size totals) so editing the tech pack later doesn't change what an in-flight order deducts.
- The manual "Fabric Used (grams / pc)" field could be derived from the tech pack (decide whether to keep as an override).

### 5.3 Deduction

- Automatic, tagged `source: "production"`, `source_id` = order ref (`ORD-xxx`), reversible/adjustable (existing ledger helpers look up and delete by order ref).
- Suggested timing (pending user's answer, see §6):
  - **Fabric at Cutting**: fabric physically leaves the store then, so stock isn't overstated for weeks.
  - **Trims and packaging at Packing.**
  - A re-cut/spoilage is a manual adjustment on the order, not a blocker.
  - Alternative: a single stage for everything (one constant like today's `MATERIALS_STAGE`).
- The current **QC popup (`MaterialsUsedModal`)** either goes away or shrinks to a correction step: "planned 38 kg, used 41 kg". The planned-vs-actual variance is how the numbers improve over time.
- Show a warning (don't block) if a deduction takes an item below zero, e.g. because purchases weren't logged.

### 5.4 Purchases → stock

Make purchase lines **pick from inventory** (reuse `StockItemSelect`) instead of relying on exact name match. Store `stockItemId` on the line, like sales invoices already do (`postSaleStockOut` uses `stockItemId`). Without this the whole chain can quietly drift. (Undecided whether in scope, see §6.)

### 5.5 Database

New migration `0040_...`:
- `patterns`: add `materials` jsonb, `wastage_pct`, per-size measurements shape if needed.
- `orders`: add `pattern_id`, `size_breakdown`, materials snapshot column; **drop `recipe_id`**; re-issue `fs_orders` (a view can only gain columns at the END; `create or replace view` drops reloptions so re-run `alter view fs_orders set (security_invoker = on)` as 0039 does).
- `fs_patterns`: re-issue with the new columns, again re-set `security_invoker`.
- RLS: add a `production_read` policy on `patterns` (mirror 0039's on `product_recipes`) so Production users can read tech packs.
- **Drop `product_recipes` and `fs_product_recipes`** (no data, confirmed by the user). Keep the `stock_movements.source` `'production'` value.
- Update `src/lib/schemaMap.js` (generated by `scripts/gen-schema-map.cjs`).
- Migration must be safe to re-run (0039 style: `if not exists`, `drop policy if exists`).

## 6. Open questions (not answered yet)

1. **When does stock reduce?** Fabric at Cutting + trims/packaging at Packing (recommended), or a single stage for all? Today it's Quality Check.
2. **Purchase picker in scope now, or later?** (Recommended: soon, because the chain is unreliable without it.)
3. **Who owns the per-size grams numbers?** Ask whoever runs cutting (likely Anusha) for grams per piece per size for the top 3–5 styles. The software can't invent these. Estimating from measurements × GSM is ~10–15% off because it ignores marker layout; a real cutting run (weigh fabric, count pieces per size) is the reliable source.
4. Do zippers or rib differ by size? Assumed yes and handled via separate lines with 0 qty on non-applicable sizes (no data-model change needed).

## 7. Suggested build order

1. Migration 0040 (columns, policies, views, drop recipes) + schemaMap regeneration.
2. Tech pack editor: structured materials (per-size), per-size measurements; keep printed sheet unchanged.
3. Production order form: tech pack picker, size grid, colour to stock-item resolution, "needs vs in stock" panel, snapshot on save.
4. Automatic deduction at the chosen stage(s); shrink or remove `MaterialsUsedModal`; variance display.
5. Remove the Recipes tab: `RecipesTab.jsx`, Inventory.jsx wiring, `matchRecipe`, `recipes` fetch and `recipeId` handling in Production.jsx, `recipe` references in `roles.js` / `activity.js` as applicable.
6. (Optional) purchase line item picker.
7. (Later) AI-drafted material list from an uploaded tech pack photo (human-reviewed).

## 8. Status

- No code changed yet. Git working tree was clean at the start of the conversation (branch `master`, HEAD `7612e48`).
- User instruction received: **remove the recipes table/feature outright** (it has no data). Not yet executed.
