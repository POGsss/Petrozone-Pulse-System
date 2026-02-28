# SYSTEM ARCHITECTURE REVISION – Catalog + Pricing Matrix + Job Order + Inventory

> **Generated:** 2026-02-28
> **Scope:** Catalog, Pricing Matrix, Job Order computation, Inventory deduction

---

## 1️⃣ CURRENT IMPLEMENTATION ANALYSIS

### Catalog Module (`catalog_items` table)

**Schema fields (current):**
`id`, `name`, `type` (service | product | package), `description`, `base_price`, `status` (active | inactive), `branch_id`, `is_global`, `created_by`, `created_at`, `updated_at`

**How `base_price` is used:**

- `base_price` is a **mandatory numeric field** on every catalog item (validated ≥ 0 on both backend and frontend).
- The Create form (`CatalogManagement.tsx` line ~269) requires `base_price` and validates it as a non-negative number.
- The Edit form (`CatalogManagement.tsx` line ~350) allows editing `base_price`.
- Catalog cards in the grid display `formatPrice(item.base_price)` (`CatalogManagement.tsx` line ~560).
- Backend **POST /api/catalog** (`catalog.routes.ts` line ~175) validates `base_price` is required and non-negative, then stores it.
- Backend **PUT /api/catalog/:itemId** (`catalog.routes.ts` line ~330) allows updating `base_price`.

**Branch scoping:**

- Catalog items are either **global** (`is_global = true`, `branch_id = null`) or **branch-scoped**.
- HM sees all items; non-HM users see global items + items in their assigned branches.
- Only HM can create/edit/delete global items.

**Inventory links (current):**

- `catalog_inventory_links` table links catalog items to inventory items with a `quantity` field.
- Backend CRUD endpoints exist at `GET/POST/PUT/DELETE /api/catalog/:itemId/inventory-links`.
- The quantity on the link defines how many units of that inventory item are needed **per one unit of the catalog item**.
- Frontend has both read-only inventory list modal and editable inventory links modal.

### Pricing Matrix (`pricing_matrices` table)

**Schema fields (current):**
`id`, `catalog_item_id`, `pricing_type` (labor | packaging), `price`, `status` (active | inactive), `branch_id`, `description`, `created_by`, `created_at`, `updated_at`

**How pricing currently works:**

- Each pricing matrix record adds a **labor** or **packaging** price **on top of** the catalog item's `base_price`.
- Pricing is **branch-scoped**: each rule is tied to a specific `branch_id`.
- There is a **unique constraint**: only one active rule per `(catalog_item_id, pricing_type, branch_id)`.
- **Resolve endpoint** (`GET /api/pricing/resolve/:catalogItemId?branch_id=...`) returns:
  ```json
  {
    "catalog_item": { "id", "name", "type", "base_price" },
    "pricing_rules": [...],
    "resolved_prices": {
      "base_price": <catalog base_price>,
      "labor": <labor rule price or null>,
      "packaging": <packaging rule price or null>
    }
  }
  ```
- Bulk resolve (`POST /api/pricing/resolve-bulk`) does the same for multiple items.

**Frontend (`PricingManagement.tsx`):**

- Add/Edit forms require: `catalog_item_id`, `pricing_type` (labor/packaging), `price`, `branch_id`, `status`, optional `description`.
- Filters by status, pricing type, and branch.

### Job Order Module

**Schema (`job_orders` table):**
`id`, `order_number`, `customer_id`, `vehicle_id`, `branch_id`, `status`, `total_amount`, `notes`, `is_deleted`, `created_by`, `approved_at`, `approved_by`, `approval_notes`, `created_at`, `updated_at`

**Schema (`job_order_items` table):**
`id`, `job_order_id`, `catalog_item_id`, `catalog_item_name`, `catalog_item_type`, `quantity`, `base_price`, `labor_price`, `packaging_price`, `inventory_cost`, `line_total`, `created_at`

**Schema (`job_order_item_inventories` table):**
`id`, `job_order_item_id`, `inventory_item_id`, `inventory_item_name`, `quantity_per_unit`, `unit_cost`, `created_at`

**How the job order total is currently computed (backend `POST /api/job-orders`):**

```
For each item in the order:
  1. Fetch catalog_item → get base_price
  2. Fetch pricing_matrices for (catalog_item_id, branch_id, status=active)
     → get labor_price, packaging_price
  3. Fetch catalog_inventory_links for catalog_item_id
     → filter to active items in same branch
     → compute inventory_cost = SUM(link.quantity × inventory_item.cost_price)
  4. line_total = (base_price + inventory_cost + labor_price + packaging_price) × quantity

total_amount = SUM(all line_totals)
```

- **Third-party repairs** are stored separately (`third_party_repairs` table) and managed via a separate API, but their costs are **not currently included** in the `total_amount` field on `job_orders`. They are shown in the view modal alongside the order total.

**Frontend (`JobOrderManagement.tsx`):**

- `DraftItem` interface: `{ catalog_item_id, catalog_item_name, catalog_item_type, quantity, base_price, inventory_cost, labor_price, packaging_price, line_total }`
- When adding an item: calls `pricingApi.resolve()` to get base_price, labor, packaging; then calls `catalogApi.getInventoryLinks()` to compute inventory cost preview.
- Draft total = `SUM(draftItems.line_total)`
- Draft repairs total shown separately.
- On create, sends `{ customer_id, vehicle_id, branch_id, notes, items: [{ catalog_item_id, quantity }] }` — backend resolves actual pricing.

**Status flow (current):** created → pending → approved/rejected → cancelled

- Approval triggers inventory deduction.
- Cancellation of approved order restores stock.

### Inventory Deduction (current)

**Trigger:** On approval (`PATCH /api/job-orders/:id/record-approval` with `decision = "approved"`).

**`deductStockForJobOrder()` function (`inventory.routes.ts`):**

1. Fetches all `job_order_items` with their `job_order_item_inventories` snapshots.
2. For items with inventory snapshots: uses snapshot `inventory_item_id` and `quantity` (the `quantity_per_unit` field).
3. For legacy product-type items without snapshots: falls back to name-matching in inventory.
4. Aggregates deductions per inventory item.
5. Checks stock availability via `getOnHandSingle()` (computes from `stock_movements` ledger).
6. Creates `stock_out` movements with `reference_type = "job_order"`.

**`restoreStockForJobOrder()` function:** Reverses all `stock_out` movements for the JO by creating corresponding `stock_in` movements.

**Key observation:** The deduction uses the **snapshot quantities** stored in `job_order_item_inventories`, NOT the catalog link quantities at the time of approval. This is correct — quantities are captured at JO creation time.

---

## 2️⃣ REQUIRED DATABASE CHANGES

### A. `catalog_items` table

| Change                                                                             | Detail                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REMOVE** `base_price` column                                                     | No longer applicable. Catalog is a labor package template only.                                                                                                                                 |
| **REMOVE** `type` column                                                           | The "service / product / package" distinction is removed. All catalog items are now labor package templates. _(If you want to keep `type` for backward compat, make it optional with default.)_ |
| **REMOVE** `branch_id` column                                                      | Catalog items are now global-only (no branch scoping).                                                                                                                                          |
| **REMOVE** `is_global` column                                                      | No longer needed — all catalogs are global.                                                                                                                                                     |
| **KEEP** `name`, `description`, `status`, `created_by`, `created_at`, `updated_at` |                                                                                                                                                                                                 |

**Migration SQL (suggested):**

```sql
-- Step 1: Remove base_price, branch_id, is_global, type from catalog_items
ALTER TABLE catalog_items DROP COLUMN IF EXISTS base_price;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS branch_id;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS is_global;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS type;

-- If you prefer safe rollback, rename instead:
-- ALTER TABLE catalog_items RENAME COLUMN base_price TO _deprecated_base_price;
```

> ⚠️ **IMPORTANT:** Before dropping `base_price`, ensure no existing data is lost. Consider a data migration to populate the new `pricing_matrix` records from existing `base_price + pricing_matrices` values.

### B. `catalog_inventory_links` table

| Change                                                   | Detail                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **REMOVE** `quantity` column                             | Catalog no longer defines quantity — quantity is set per job order. The link now only defines _which_ inventory items are required (template). |
| Or **rename** to `default_quantity` and make it optional | For backward compat suggestion only.                                                                                                           |

**Migration SQL:**

```sql
-- Remove the preset quantity from catalog_inventory_links
-- (quantity will be set at JO creation time by the user)
ALTER TABLE catalog_inventory_links DROP COLUMN IF EXISTS quantity;
```

### C. `pricing_matrices` table — **MAJOR RESTRUCTURE**

| Change                                                                               | Detail                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------- |
| **REMOVE** `pricing_type` column                                                     | No more "labor" / "packaging" distinction.  |
| **REMOVE** `price` column                                                            | Replaced by vehicle-type columns.           |
| **REMOVE** `branch_id` column                                                        | Pricing is no longer branch-scoped.         |
| **REMOVE** `description` column                                                      | Optional — can keep if useful.              |
| **ADD** `light_price` (numeric, NOT NULL)                                            | Total labor price for Light vehicles.       |
| **ADD** `heavy_price` (numeric, NOT NULL)                                            | Total labor price for Heavy vehicles.       |
| **ADD** `extra_heavy_price` (numeric, NOT NULL)                                      | Total labor price for Extra Heavy vehicles. |
| **KEEP** `id`, `catalog_item_id`, `status`, `created_by`, `created_at`, `updated_at` |                                             |

**New unique constraint:** One active pricing matrix per `catalog_item_id`:

```sql
-- Drop old table or restructure
ALTER TABLE pricing_matrices
  DROP COLUMN IF EXISTS pricing_type,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS description;

ALTER TABLE pricing_matrices
  ADD COLUMN light_price NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN heavy_price NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN extra_heavy_price NUMERIC NOT NULL DEFAULT 0;

-- Enforce one active pricing matrix per catalog item
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_matrices_catalog_active
  ON pricing_matrices (catalog_item_id) WHERE status = 'active';

-- Drop old partial unique index (catalog_item_id, pricing_type, branch_id)
DROP INDEX IF EXISTS idx_pricing_matrices_unique_active;
```

### D. `job_order_items` table

| Change                                    | Detail                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| **REMOVE** `base_price`                   | No longer used.                                                          |
| **REMOVE** `packaging_price`              | No longer used.                                                          |
| **RENAME** `labor_price` to `labor_price` | Keep — this now comes directly from pricing matrix for the vehicle type. |
| **KEEP** `inventory_cost`                 | Still computed as SUM(unit_cost × quantity).                             |
| **KEEP** `line_total`                     | Recalculated with new formula.                                           |
| **KEEP** `quantity`                       | Still user-defined.                                                      |

**Migration SQL:**

```sql
ALTER TABLE job_order_items DROP COLUMN IF EXISTS base_price;
ALTER TABLE job_order_items DROP COLUMN IF EXISTS packaging_price;
```

### E. `job_order_item_inventories` table

| Change              | Detail                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **KEEP** as-is      | Still stores snapshot of inventory items used, quantities, and unit costs.                             |
| `quantity_per_unit` | This now stores the **user-entered quantity** for each inventory item (not derived from catalog link). |

### F. `vehicles` table

**NO CHANGES.** The vehicles table and schema remain untouched. Vehicle type classification (Light / Heavy / Extra Heavy) is selected by the user **inside the Job Order form**, not derived from the vehicle record.

### G. `job_orders` table

| Change | Detail |
|--------|--------|
| **ADD** `vehicle_class` column | `TEXT NOT NULL DEFAULT 'light'` with `CHECK (vehicle_class IN ('light', 'heavy', 'extra_heavy'))`. This stores the user-selected vehicle classification at JO creation time. |

```sql
ALTER TABLE job_orders ADD COLUMN vehicle_class TEXT
  NOT NULL DEFAULT 'light'
  CHECK (vehicle_class IN ('light', 'heavy', 'extra_heavy'));
```

### H. New constraints summary

| Constraint                        | Table              | Detail                                                                     |
| --------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| Unique active pricing per catalog | `pricing_matrices` | `UNIQUE (catalog_item_id) WHERE status = 'active'`                         |
| Vehicle class required on JO      | `job_orders`       | `vehicle_class NOT NULL CHECK (vehicle_class IN ('light', 'heavy', 'extra_heavy'))` |
| No negative prices                | `pricing_matrices` | `CHECK (light_price >= 0 AND heavy_price >= 0 AND extra_heavy_price >= 0)` |

---

## 3️⃣ BACKEND REFACTOR PLAN

### A. `catalog.routes.ts` — Simplify

| Area                              | Change                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **POST /api/catalog**             | Remove `base_price` validation and field. Remove `type` validation. Remove `branch_id` / `is_global` logic. Insert only: `name`, `description`, `status`, `created_by`. |
| **PUT /api/catalog/:itemId**      | Remove `base_price`, `type`, `branch_id`, `is_global` from update payload. Remove branch access checks (catalogs are now global).                                       |
| **GET /api/catalog**              | Remove branch scoping logic (all users see all catalogs). Remove `type`, `is_global` filters.                                                                           |
| **GET /api/catalog/:itemId**      | Remove branch access check.                                                                                                                                             |
| **DELETE /api/catalog/:itemId**   | Remove branch/global access checks.                                                                                                                                     |
| **Inventory links endpoints**     | Keep CRUD for links. **Remove** `quantity` field from POST/PUT — links now only define _which_ inventory items are required.                                            |
| **REMOVE** `VALID_TYPES` constant | No longer needed.                                                                                                                                                       |

### B. `pricing.routes.ts` — Major rewrite

| Area                                        | Change                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GET /api/pricing**                        | Remove `branch_id` filter, `pricing_type` filter. Select new columns: `light_price`, `heavy_price`, `extra_heavy_price`. Remove branch scoping.                                         |
| **GET /api/pricing/:id**                    | Remove branch access check. Return new price columns.                                                                                                                                   |
| **GET /api/pricing/resolve/:catalogItemId** | **REWRITE.** Remove `branch_id` query param. Return `{ catalog_item, pricing: { light_price, heavy_price, extra_heavy_price } }`.                                                       |
| **POST /api/pricing/resolve-bulk**          | **REWRITE.** Remove `branch_id` from body. Resolve pricing per catalog item without branch.                                                                                             |
| **POST /api/pricing**                       | Remove `pricing_type`, `price`, `branch_id`. Accept `catalog_item_id`, `light_price`, `heavy_price`, `extra_heavy_price`, `status`. Conflict check: one active record per catalog item. |
| **PUT /api/pricing/:id**                    | Same field changes. Update conflict detection.                                                                                                                                          |
| **DELETE /api/pricing/:id**                 | Remove branch access check.                                                                                                                                                             |
| **REMOVE** `VALID_PRICING_TYPES` constant   | No longer needed.                                                                                                                                                                       |

### C. `joborders.routes.ts` — Critical logic change

| Area                                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **POST /api/job-orders**                                            | **REWRITE total computation.** New flow: (1) Get catalog → load inventory template items. (2) User selects `vehicle_class` (light / heavy / extra_heavy) — stored on the JO, NOT read from the vehicle record. (3) Get pricing matrix for catalog → select price column by vehicle class. (4) User provides quantities per inventory item (not auto-derived from link). (5) Compute: `line_total = labor_price + SUM(inv_unit_cost × user_qty)`. (6) `total_amount = SUM(line_totals) + third_party_repairs_cost`. |
| **Request body change**                                             | Must now include `vehicle_class` (light/heavy/extra_heavy) at the order level. Items array must include `inventory_quantities: [{ inventory_item_id, quantity }]` instead of just `catalog_item_id + quantity`. User specifies qty per inventory item.                                                                                                                                                                                      |
| **POST /api/job-orders/:id/items**                                  | Same rewrite for adding items to existing order.                                                                                                                                                                                                                                                                                                                                                                                           |
| **PUT /api/job-orders/:id/items/:itemId**                           | Recalculate with new formula: `labor_price + SUM(inv_cost × qty)`.                                                                                                                                                                                                                                                                                                                                                                         |
| **Validation**                                                      | User CANNOT add inventory items outside catalog template. User CANNOT remove items from template. Quantity must be ≥ 0, not ≥ 1.                                                                                                                                                                                                                                                                                                           |
| **Remove** `base_price` and `packaging_price` from JO item creation | These fields no longer exist.                                                                                                                                                                                                                                                                                                                                                                                                              |

### D. `inventory.routes.ts` — Deduction logic

| Area                            | Change                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`deductStockForJobOrder()`**  | Update to use `job_order_item_inventories` snapshots (quantity comes from user input, not catalog link). Core flow remains the same — already reads from snapshots. Minor: remove legacy name-matching fallback. |
| **`restoreStockForJobOrder()`** | No change needed — already works from `stock_movements` ledger.                                                                                                                                                  |
| **Stock validation**            | Ensure `quantity >= 0` check on user quantities. Ensure deduction only happens for items with `quantity > 0`.                                                                                                    |

### E. Validation changes summary

| Removed validation                     | Location                      |
| -------------------------------------- | ----------------------------- |
| `base_price` required / non-negative   | `catalog.routes.ts` POST, PUT |
| `type` must be service/product/package | `catalog.routes.ts` POST, PUT |
| `pricing_type` must be labor/packaging | `pricing.routes.ts` POST, PUT |
| `branch_id` required for pricing       | `pricing.routes.ts` POST, PUT |
| `branch_id` / `is_global` for catalog  | `catalog.routes.ts` POST, PUT |

| New validation                                            | Location                      |
| --------------------------------------------------------- | ----------------------------- |
| `light_price` / `heavy_price` / `extra_heavy_price` ≥ 0   | `pricing.routes.ts` POST, PUT |
| `vehicle_class` must be light/heavy/extra_heavy           | `joborders.routes.ts` POST (user-selected, stored on `job_orders`) |
| Inventory items in JO must match catalog template exactly | `joborders.routes.ts` POST    |
| Per-item quantity ≥ 0 (not ≥ 1)                           | `joborders.routes.ts` POST    |

---

## 4️⃣ FRONTEND REFACTOR PLAN

### A. `CatalogManagement.tsx`

| Area                      | Change                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Add form**              | Remove `base_price` input. Remove `type` dropdown. Remove `branch_id` selector. Remove `is_global` toggle. Keep: `name`, `description`. |
| **Edit form**             | Same removals. Keep: `name`, `description`, `status`.                                                                                   |
| **Card display**          | Remove price display (`formatPrice(item.base_price)`). Remove type badge. Remove branch/global badge.                                   |
| **View modal**            | Remove base_price, type, branch fields.                                                                                                 |
| **Filter groups**         | Remove "Type" filter. Remove "Branch" filter (all catalogs global). Keep "Status" filter.                                               |
| **Inventory links modal** | Remove `quantity` input on add/edit — link is now just a boolean association (item is in template).                                     |
| **State**                 | Remove `base_price` from `addForm` and `editForm`. Remove `type` from forms. Remove `branch_id`, `is_global` from forms.                |

### B. `PricingManagement.tsx`

| Area                   | Change                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add form**           | Remove `pricing_type` dropdown. Remove `price` input. Remove `branch_id` selector. Add: `light_price`, `heavy_price`, `extra_heavy_price` inputs. |
| **Edit form**          | Same changes.                                                                                                                                     |
| **List/table display** | Remove pricing type column. Remove branch column. Show three price columns (Light / Heavy / Extra Heavy).                                         |
| **View modal**         | Show all three prices. Remove branch, pricing type.                                                                                               |
| **Filter groups**      | Remove "Branch" filter. Remove "Pricing Type" filter. Keep "Status".                                                                              |
| **State**              | Replace `addForm.price` / `addForm.pricing_type` / `addForm.branch_id` with `light_price`, `heavy_price`, `extra_heavy_price`.                    |
| **Stats**              | Update to reflect new data structure.                                                                                                             |

### C. `JobOrderManagement.tsx`

| Area                          | Change                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Add modal — item sub-form** | **MAJOR REWRITE.** New flow: (1) Select catalog item. (2) System loads inventory template items. (3) Vehicle type determines labor price from pricing matrix. (4) User manually sets quantity for each inventory item (≥ 0). (5) Line total auto-calculated. |
| **Vehicle class selector**    | Add a new dropdown: "Vehicle Class" (Light / Heavy / Extra Heavy). User selects this manually — it is NOT auto-derived from the vehicle record. This selection determines which pricing matrix column to use and is stored on the `job_orders` record.          |
| **DraftItem interface**       | Remove `base_price`, `packaging_price`. Keep `labor_price`, `inventory_cost`, `line_total`. Add `inventory_quantities: [{ inventory_item_id, name, quantity, unit_cost }]`.                                                                                  |
| **Price resolution**          | Replace `pricingApi.resolve()` call (which was branch-scoped) with new resolve endpoint (no branch). Use `vehicle_class` to pick `light_price` / `heavy_price` / `extra_heavy_price`.                                                                        |
| **Total calculation**         | `line_total = labor_price + SUM(inv_unit_cost × user_qty)`. Grand total = `SUM(line_totals) + SUM(repair costs)`.                                                                                                                                            |
| **Edit modal item editing**   | Same changes as add. User edits per-inventory-item quantities.                                                                                                                                                                                               |
| **Remove**                    | Remove `base_price` and `packaging_price` display from item breakdown.                                                                                                                                                                                       |
| **Constraint enforcement**    | User CANNOT add/remove inventory items (locked to catalog template). User CAN only change quantities.                                                                                                                                                        |

### D. `types/index.ts`

| Type                     | Change                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CatalogItem`            | Remove `base_price`, `type`, `branch_id`, `is_global`, `branches?`                                                                                |
| `PricingMatrix`          | Remove `pricing_type`, `price`, `branch_id`, `description`, `branches?`, `catalog_items?`. Add `light_price`, `heavy_price`, `extra_heavy_price`. |
| `ResolvedPricing`        | Restructure to `{ catalog_item, pricing: { light_price, heavy_price, extra_heavy_price } }`.                                                      |
| `JobOrderItem`           | Remove `base_price`, `packaging_price`. Keep `labor_price`, `inventory_cost`, `line_total`.                                                       |
| `DraftItem` (in JO page) | Remove `base_price`, `packaging_price`. Add `inventory_quantities` array.                                                                         |
| `CatalogInventoryLink`   | Remove `quantity`.                                                                                                                                |
| Add `VehicleClass` type  | `'light' \| 'heavy' \| 'extra_heavy'`                                                                                                             |
| `Vehicle`                | **No changes** — vehicle schema is untouched.                                                                                                     |
| `JobOrder`               | Add `vehicle_class: VehicleClass` field.                                                                                                          |

### E. `api.ts`

| API                                | Change                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `catalogApi.create()`              | Remove `base_price`, `type`, `branch_id`, `is_global` from data param.                               |
| `catalogApi.update()`              | Same removals.                                                                                       |
| `catalogApi.addInventoryLink()`    | Remove `quantity` from data param.                                                                   |
| `catalogApi.updateInventoryLink()` | Remove entirely — no more quantity to update.                                                        |
| `pricingApi.create()`              | Replace `pricing_type`, `price`, `branch_id` with `light_price`, `heavy_price`, `extra_heavy_price`. |
| `pricingApi.update()`              | Same.                                                                                                |
| `pricingApi.resolve()`             | Remove `branchId` param. Return new shape.                                                           |
| `pricingApi.resolveBulk()`         | Remove `branchId`. Return new shape.                                                                 |
| `jobOrdersApi.create()`            | Update items payload to include per-item inventory quantities.                                       |

---

## 5️⃣ OLD LOGIC → NEW LOGIC COMPARISON

### Catalog

| Aspect          | OLD                                      | NEW                                             |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| Purpose         | Service/product/package with base price  | Labor package template (no pricing)             |
| `base_price`    | Required field (≥ 0)                     | **REMOVED**                                     |
| `type`          | service / product / package              | **REMOVED**                                     |
| Branch scoping  | Per-branch or global                     | **Global only** (all users see all)             |
| Inventory links | Defines items + preset quantity per link | Defines items only (template) — **no quantity** |

### Pricing Matrix

| Aspect            | OLD                                            | NEW                                                                |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| Structure         | One record per (catalog, pricing_type, branch) | One record per catalog item                                        |
| Price model       | Single `price` field added to base_price       | Three columns: `light_price`, `heavy_price`, `extra_heavy_price`   |
| Branch dependency | **Branch-scoped** — each branch has own rules  | **No branch** — pricing is universal                               |
| Pricing types     | "labor" and "packaging"                        | **REMOVED** — replaced by vehicle-type pricing                     |
| Resolution        | `base_price + labor + packaging`               | Direct lookup: `pricing_matrix[vehicle_class]` = total labor price |

### Job Order Total Computation

| Aspect                   | OLD                                                       | NEW                                                       |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------- |
| Formula per item         | `(base_price + inventory_cost + labor + packaging) × qty` | `labor_price + SUM(inv_unit_cost × user_qty)`             |
| `base_price` source      | From catalog item                                         | **REMOVED**                                               |
| `labor_price` source     | From pricing matrix (labor type, branch-scoped)           | From pricing matrix column matching vehicle class         |
| `packaging_price` source | From pricing matrix (packaging type, branch-scoped)       | **REMOVED**                                               |
| `inventory_cost` source  | Auto-computed from catalog link quantities × unit costs   | User-entered quantities × unit costs                      |
| Inventory quantities     | Pre-defined in catalog links (fixed per catalog item)     | **User enters** at JO creation time                       |
| Inventory items          | Auto-included from catalog links for matching branch      | Locked to catalog template — user cannot add/remove items |
| Third-party repairs      | Stored separately, not in total_amount                    | Should be **included** in final total_amount              |
| Grand total              | `SUM(line_totals)`                                        | `SUM(line_totals) + SUM(third_party_repair_costs)`        |

### Inventory Deduction

| Aspect            | OLD                                                                                       | NEW                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Trigger           | On approval                                                                               | On approval (no change)                                                   |
| Quantity source   | From `job_order_item_inventories` snapshots (derived from catalog link qty × JO item qty) | From `job_order_item_inventories` snapshots (**user-entered quantities**) |
| Stock validation  | Checks on-hand via stock_movements ledger                                                 | Same (no change)                                                          |
| Stock restoration | On cancel of approved order                                                               | Same (no change)                                                          |

---

## 6️⃣ SAFE IMPLEMENTATION ORDER

### Step 1: Database Migration

1. **Add new columns to `pricing_matrices`:** `light_price`, `heavy_price`, `extra_heavy_price` (with defaults).
2. **Add `vehicle_class`** column to `job_orders` table (user-selected at JO creation, not on vehicles).
3. **Migrate existing pricing data:** For each existing pricing matrix record, map `price` value into the appropriate new column (default all three to the same value, or leave as manual fix).
4. **Remove deprecated columns** from `pricing_matrices`: `pricing_type`, `price`, `branch_id`, `description`.
5. **Remove `base_price`** from `catalog_items` (after data backup).
6. **Remove `type`**, `branch_id`, `is_global` from `catalog_items`.
7. **Remove `quantity`** from `catalog_inventory_links`.
8. **Remove `base_price`**, `packaging_price` from `job_order_items`.
9. **Create new unique index** on `pricing_matrices (catalog_item_id) WHERE status = 'active'`.
10. **Drop old indexes** that reference removed columns.

> ⚠️ Run on a **test environment first**. Back up all production data before running destructive migrations.

### Step 2: Backend Logic Update

1. **Update `catalog.routes.ts`** — Remove all `base_price`, `type`, `branch_id`, `is_global` logic from all endpoints.
2. **Rewrite `pricing.routes.ts`** — New schema fields, remove branch scoping, remove pricing_type.
3. **Rewrite `joborders.routes.ts`** — New total computation logic, new item creation payload, vehicle class resolution.
4. **Update `inventory.routes.ts`** — Minor: remove legacy name-matching fallback in `deductStockForJobOrder()`.
5. **Update `database.types.ts`** — Regenerate from Supabase schema (run `supabase gen types typescript`).
6. **Test all API endpoints** with new data shapes.

### Step 3: Frontend Update

1. **Update `types/index.ts`** — New type definitions matching new schema.
2. **Update `api.ts`** — New API call signatures matching backend changes.
3. **Rewrite `CatalogManagement.tsx`** — Simplified form (name + description + inventory template).
4. **Rewrite `PricingManagement.tsx`** — Three price columns, no branch/type.
5. **Rewrite `JobOrderManagement.tsx`** — New item creation flow with vehicle class, user-entered inventory quantities; new total computation.
6. **Update `InventoryManagement.tsx`** — No changes expected (inventory CRUD is independent).

### Step 4: Regression Testing

1. **Catalog CRUD** — Create, edit, delete catalog items without base_price or type.
2. **Catalog inventory links** — Add/remove items (no quantity).
3. **Pricing matrix CRUD** — Create with three price columns, enforce unique active per catalog.
4. **Job order creation** — Select catalog → verify inventory template loads → select vehicle → verify labor price resolves → set inventory quantities → verify total is correct.
5. **Job order approval** — Verify inventory deduction uses correct quantities.
6. **Job order cancellation** — Verify stock restoration works.
7. **Edge cases** — Zero-quantity inventory items, missing pricing matrix, inactive catalog items.

### Step 5: Cleanup

1. Remove unused API endpoints (`resolve-bulk` if not needed, old resolve with branch).
2. Remove unused frontend components and state variables.
3. Remove unused backend constants (`VALID_TYPES`, `VALID_PRICING_TYPES`).
4. Clean up any `// TODO` or deprecated comments.
5. Update documentation and testing files in `docs/testing/`.

---

## ⚠️ MODULES NOT AFFECTED (DO NOT TOUCH)

- **RBAC** — No changes.
- **Audit logging** — No structural changes (audit triggers remain).
- **Authentication / Authorization** — No changes.
- **Customer Management** — No changes.
- **Vehicle Management** — No changes.
- **Purchase Orders** — No changes.
- **Supplier Management** — No changes.
- **Branch Management** — No changes.
- **System Settings** — No changes.
- **User Management** — No changes.
- **Third-Party Repairs** — Existing CRUD unchanged; only change is inclusion in JO total.
