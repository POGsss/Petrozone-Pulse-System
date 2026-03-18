# PRE-REVISION SYSTEM ANALYSIS REPORT

Migration safety emphasis: minimize production breakage, preserve current behavior during transition, and isolate high-risk schema/API changes.

## 1. Current System Analysis

### 1.1 Job Order Module

#### A. Current schema and relationships

Primary JO tables and relationships are defined in backend database types:

- `job_orders` with lifecycle/status, customer, vehicle, branch, totals, approval/cancellation metadata
  - Source: `backend/src/types/database.types.ts` (around `job_orders` table definition)
- `job_order_items` where each line item references `package_items`
  - FK: `job_order_items.package_item_id -> package_items.id`
  - Stores `package_item_name`, `package_item_type`, `labor_price`, `inventory_cost`, `line_total`, `quantity`
- `job_order_item_inventories` as per-line inventory snapshots
  - FK: `job_order_item_inventories.job_order_item_id -> job_order_items.id`
  - FK: `job_order_item_inventories.inventory_item_id -> inventory_items.id`

Key evidence:
- `job_order_items` schema: `backend/src/types/database.types.ts`
- `job_order_item_inventories` schema: `backend/src/types/database.types.ts`
- `job_orders` schema: `backend/src/types/database.types.ts`

#### B. How services are attached today

Services are attached as package-linked line items only:

- JO create requires each item to provide `package_item_id`
- Backend resolves package via `package_items`
- `package_item_type` is hardcoded to `labor_package` when inserting JO line items
- Pricing is resolved from active `pricing_matrices` row for the package

Evidence:
- JO create validation and package resolution: `backend/src/routes/joborders.routes.ts` (create flow)
- Hardcoded `package_item_type: "labor_package"`: `backend/src/routes/joborders.routes.ts`
- Frontend create payload requires `items[].package_item_id`: `frontend/src/lib/api.ts`
- Frontend JO item type shape is package-centric: `frontend/src/types/index.ts`

Conclusion: current JO line model is package-first and does not support standalone labor or standalone inventory lines.

#### C. Total calculation logic

Current total model:

- For each JO item:
  - `labor_price` resolved by vehicle class from pricing matrix (`light/heavy/extra_heavy`)
  - `inventory_cost` computed from selected inventory quantities and unit costs
  - `line_total = (labor_price + inventory_cost) * quantity`
- JO total recomputation:
  - sum of all `job_order_items.line_total`
  - plus sum of `third_party_repairs.cost` where not deleted

Evidence:
- Create/add-item line formula and cost assembly: `backend/src/routes/joborders.routes.ts`
- Recalculate total after item add/update/remove: `backend/src/routes/joborders.routes.ts`
- Frontend mirrors this mixed package+inventory draft model: `frontend/src/pages/subpages/JobOrderManagement.tsx`

#### D. Status lifecycle and transitions

Observed lifecycle in backend routes:

- `draft` -> `pending_approval` via `PATCH /:id/request-approval`
- `pending_approval` -> `approved` or `rejected` via `PATCH /:id/record-approval`
- `approved` -> `in_progress` via `PATCH /:id/start-work`
- `in_progress` -> `ready_for_release` via `PATCH /:id/mark-ready`
- `ready_for_release` -> `pending_payment` via `PATCH /:id/record-payment`
- `pending_payment` -> `completed` via `PATCH /:id/complete`
- `draft` or `pending_approval` -> `cancelled` via `PATCH /:id/cancel`
- Soft delete model uses `is_deleted` and maps to `deactivated` in list/detail responses

Evidence:
- JO route transitions and role checks: `backend/src/routes/joborders.routes.ts`
- Frontend action menu and modals map exactly to same transitions: `frontend/src/pages/subpages/JobOrderManagement.tsx`

#### E. Inventory deduction trigger

Inventory deduction happens during approval (`record-approval`, when decision is `approved`):

- Route calls `deductStockForJobOrder(...)`
- Deduction uses `job_order_item_inventories` snapshots
- Aggregates quantities by inventory item
- Inserts `stock_movements` rows with `movement_type = stock_out`, `reference_type = job_order`

Evidence:
- Trigger call at approval flow: `backend/src/routes/joborders.routes.ts`
- Deduction helper implementation: `backend/src/routes/inventory.routes.ts`

Notable safety finding:
- `restoreStockForJobOrder` exists but does not appear to be called by JO cancel flow.
- This can create stock inconsistency if cancellation should reverse prior JO deductions.

Evidence:
- Helper defined: `backend/src/routes/inventory.routes.ts`
- No invocation found in JO routes: `backend/src/routes/joborders.routes.ts`

#### F. API endpoints and responsibilities (JO)

Primary JO endpoints:

- CRUD/list/detail: `/api/job-orders`
- Item operations: `/api/job-orders/:id/items`, `/api/job-orders/:id/items/:itemId`
- Approval lifecycle: `/request-approval`, `/record-approval`, `/cancel`
- Execution lifecycle: `/start-work`, `/mark-ready`, `/record-payment`, `/complete`
- History: `/api/job-orders/:id/history`

Source:
- `backend/src/routes/joborders.routes.ts`
- Route registration: `backend/src/index.ts`

#### G. UI workflow (JO)

Current UI flow in JO page:

- Create modal requires branch/customer/vehicle, odometer, bay, and at least one package-based item
- User adds package item, UI resolves pricing via `/api/pricing/resolve/:packageItemId`
- UI builds inventory selections based on package `inventory_types` or package template links
- Actions by status shown in card dropdown: request approval, approve/reject, cancel, start work, mark ready, record payment, complete

Evidence:
- JO management implementation: `frontend/src/pages/subpages/JobOrderManagement.tsx`
- API client mappings: `frontend/src/lib/api.ts`

---

### 1.2 Catalog Module (current Packages implementation)

#### A. Current structure

Catalog is already represented as `package_items` with:

- `id, name, description, status`
- `inventory_types: string[]` (category-driven inventory requirement)
- Optional legacy template links via `package_inventory_links`

Evidence:
- Schema: `backend/src/types/database.types.ts`
- CRUD routes: `backend/src/routes/packages.routes.ts`

#### B. How catalog links to job orders

- JO lines reference `package_items` through `job_order_items.package_item_id`
- JO add/create always resolves a package item and embeds snapshot values

Evidence:
- FK in schema: `backend/src/types/database.types.ts`
- JO create/add item flow: `backend/src/routes/joborders.routes.ts`

#### C. Does catalog mix labor and inventory?

Yes, functionally:

- Labor pricing is externalized in `pricing_matrices` by package + vehicle class
- Inventory usage is selected per package item (via inventory categories or legacy template links)
- JO line persists both labor and inventory costs in same line record

#### D. Constraints/assumptions in design

- Package-centric: JO items cannot exist without package ID
- Package deletion is blocked/soft-deactivated if referenced by JO/pricing
- Package inventory links are quantity-less templates (selection aid), not direct costed BOM rows

Evidence:
- Package delete reference checks: `backend/src/routes/packages.routes.ts`
- Template link behavior: `backend/src/routes/packages.routes.ts`

---

### 1.3 Pricing Matrix Module

#### A. Current schema and purpose

`pricing_matrices` table:

- FK to `package_items`
- stores `light_price`, `heavy_price`, `extra_heavy_price`
- `status` active/inactive

Purpose: per-package labor pricing by vehicle class.

Evidence:
- Schema: `backend/src/types/database.types.ts`
- Routes: `backend/src/routes/pricing.routes.ts`

#### B. How pricing is applied

- JO create/add item resolves active matrix by `package_item_id`
- picks price by JO `vehicle_class`
- if missing, labor can fall back to 0

Evidence:
- JO create/add logic: `backend/src/routes/joborders.routes.ts`
- Resolve endpoints: `backend/src/routes/pricing.routes.ts`

#### C. Relationship with JO and catalog

- Pricing tightly bound to package IDs
- JO labor component depends on package+vehicle_class matrix
- Pricing APIs are called directly in JO frontend when building draft items

Evidence:
- JO frontend pricing resolve calls: `frontend/src/pages/subpages/JobOrderManagement.tsx`
- Pricing API client: `frontend/src/lib/api.ts`

#### D. Embedded package logic

- One-active-matrix-per-package constraint enforced in route logic
- Cannot currently represent reusable labor entity independent of package

Evidence:
- Conflict checks in pricing create/update: `backend/src/routes/pricing.routes.ts`

---

### 1.4 Inventory Flow

#### A. Current stock movement model

- Inventory on-hand is ledger-derived from `stock_movements`
- JO deduction posts `stock_out` rows with reference to JO
- Purchase and adjustments share same movement ledger

Evidence:
- Inventory ledger and movement enums: `backend/src/types/database.types.ts`
- On-hand computation and movement APIs: `backend/src/routes/inventory.routes.ts`
- JO deduction helper: `backend/src/routes/inventory.routes.ts`

#### B. Deduction trigger

- Triggered at JO approval decision `approved` (not at completion)
- Uses snapshots from `job_order_item_inventories` to determine exact deductions

Evidence:
- Approval route + helper call: `backend/src/routes/joborders.routes.ts`
- Deduction helper: `backend/src/routes/inventory.routes.ts`

#### C. Edge cases in current logic

Handled:

- Aggregation when same inventory item appears across multiple JO lines
- Insufficient stock check before deduction
- Per-item and per-slot inventory quantity editing in JO UI

Potential gaps:

- No `is_customer_provided` flag, so all selected inventory is deduction-eligible
- Cancellation path does not clearly restore prior stock deductions
- Snapshot dependence means incorrect/empty snapshots can bypass intended deductions

---

### 1.5 Cross-Module Dependencies and Coupling

#### A. JO <-> Catalog (Packages)

- Hard FK and payload dependency on `package_item_id`
- JO API and UI assume package-first item creation

#### B. JO <-> Pricing Matrix

- JO labor price resolution strictly via `pricing_matrices.package_item_id`
- No abstraction for direct labor selection

#### C. JO <-> Inventory

- Package determines inventory expectations (`inventory_types` or template links)
- JO line snapshots become source of truth for deduction

#### D. Hardcoded assumptions likely to break in redesign

- `package_item_type` hardcoded as `labor_package`
- Mandatory package item on create/add-item APIs
- Pricing endpoint naming and semantics tied to package IDs
- Dashboard top-services aggregates by `job_order_items.package_item_name` only

Evidence:
- JO item insert logic: `backend/src/routes/joborders.routes.ts`
- Dashboard aggregation: `backend/src/routes/dashboard.routes.ts`

---

## 2. Identified Limitations

### 2.1 Structural limitations in current JO design

- JO line item model cannot represent:
  - standalone labor line
  - standalone inventory line
  - mixed direct + package composition in one JO without package indirection
- Payment tracking fields are partially implemented in route logic but not surfaced consistently in typed models

Safety-critical mismatch observed:

- Backend route writes `payment_recorded_at/payment_recorded_by`
- These fields are not present in scanned typed schema/model surfaces

Evidence:
- Write in route: `backend/src/routes/joborders.routes.ts`
- No corresponding typed matches in scans for backend/frontend type files

### 2.2 Why current system forces package-only behavior

- API input contract requires `package_item_id` for each JO item
- FK `job_order_items.package_item_id` enforces package linkage
- UI add-item flow only allows selecting a package item, then deriving inventory and labor from it

### 2.3 Risks in modifying existing schema

- High blast radius due to shared dependencies:
  - JO routes
  - pricing routes
  - package routes
  - dashboard/reports aggregations
  - frontend types and JO management page
- Existing foreign keys and route validations encode package-centric assumptions

### 2.4 Technical debt / fragile logic

- Schema/type drift indicators:
  - enum inconsistency: `job_order_status` includes `pending_payment` in enum type, but constants list omits it
- Potential inventory reversal gap on cancellation
- Mixed legacy/new package inventory validation paths increase behavioral complexity

### 2.5 Gap to desired flexibility

Desired target needs independent optional lists for packages, labor, inventory. Current architecture provides only package lines with embedded labor+inventory components.

---

## 3. Gap Analysis (Current vs Required New Behavior)

### 3.1 Schema gaps

Required:

- JO support for optional independent collections:
  - packages
  - direct labor
  - direct inventory
- Package definition with:
  - fixed base components
  - vehicle-specific selectable components
- Pricing Matrix refactor to reusable Labor table
- Rework job fields in `job_orders`
- Payment mode/reference required before completion
- `is_customer_provided` flag per inventory usage
- Vehicle External History module

Current gaps:

- No standalone labor table; pricing tied to package
- No JO direct inventory line structure
- No explicit payment mode/reference fields in JO surface
- No `is_customer_provided`
- No vehicle external history module/table/routes/UI in current scan
- No rework-specific fields in JO model

### 3.2 API gaps

Current JO APIs are package-first and do not accept independent labor/inventory line types.

Missing APIs (or payload support) for:

- direct labor line add/update/remove
- direct inventory line add/update/remove
- package component variant selection by vehicle
- rework creation flow from completed JO with HM approval rules
- payment detail capture (`payment_mode`, `payment_reference`)
- external vehicle history CRUD

### 3.3 UI/UX gaps

Current JO UI supports package selection and inventory quantities, but not:

- direct labor picker independent of package
- direct inventory picker independent of package
- explicit payment mode/reference form fields in payment modal
- rework-from-completed action and approval path
- external vehicle history views/forms

### 3.4 Business logic gaps

Missing business rules in current implementation:

- block completion until payment mode/reference captured
- inventory deduction skip when `is_customer_provided = true`
- rework governance in JO lifecycle
- package component model with fixed + selectable vehicle-specific component sets

### 3.5 Risk areas (breaking changes)

Highest risk areas:

1. JO item schema changes (core transactional data)
2. pricing->labor migration while preserving existing JO calculations
3. stock deduction logic rewrite (financial + inventory integrity risk)
4. dashboard/report assumptions on package name fields
5. frontend JO page and type model rewrite

---

## 4. Risk Assessment

### 4.1 Severity-ranked risks

High:

1. Data integrity risk in JO migration
- Existing JO line data embeds package/labor/inventory snapshots; naive refactor can lose historical pricing traceability.

2. Inventory correctness risk
- Deduction currently snapshot-driven at approval; introducing direct inventory and customer-provided logic can cause double-deduction or missed deduction if not versioned carefully.

3. Workflow regression risk
- Existing status lifecycle and role gates are distributed across frontend + backend; partial rollout can dead-end orders.

4. Schema/type drift risk
- Observed payment field/type mismatches suggest migration could silently diverge between DB, backend types, and frontend types.

Medium:

5. Reporting/dashboard semantic drift
- Existing analytics aggregate package item names; introducing labor/inventory lines can distort KPIs unless reporting contracts are revised.

6. Backward compatibility risk for old JO records
- Legacy records rely on current package-centric assumptions.

### 4.2 Migration safety assumptions that must be validated first

- Confirm actual DB columns for `job_orders` (especially payment fields) vs generated types
- Confirm whether cancelled approved JOs must restore stock automatically
- Confirm whether historical JO totals must remain immutable after migration
- Confirm whether pricing matrix history must be preserved as legal/financial audit data

---

## 5. Recommended Next Steps (Migration-Safety First)

### 5.1 Migration strategy recommendation

Recommended approach: safe staged refactor, not full big-bang redesign.

Reason:

- Current modules are tightly coupled around package-centric JO lines.
- Big-bang schema/API/UI replacement creates high operational and data risks.
- Dual-read/dual-write transitional patterns reduce production risk.

### 5.2 High-level implementation order

Phase A: Stabilize and baseline

1. Freeze current JO/Pricing/Package contracts and document exact DB reality.
2. Add migration guards/tests around JO lifecycle and stock deduction.
3. Resolve known schema/type drift (payment fields, enum consistency).

Phase B: Expand schema compatibly

1. Introduce new labor structures and JO line typing without removing old columns yet.
2. Add payment mode/reference fields and constraints in nullable-safe way first.
3. Add `is_customer_provided` and external history schema.

Phase C: Dual-path APIs and UI

1. Extend JO APIs to accept old + new line formats behind feature flags.
2. Add new UI sections for direct labor/direct inventory while retaining package flow.
3. Keep existing package flow operational during transition.

Phase D: Business rule hardening

1. Enforce completion gate on payment mode/reference.
2. Implement deduction rules for customer-provided inventory.
3. Validate rework creation and HM approval path.

Phase E: Cutover and cleanup

1. Migrate legacy pricing_matrices to labor entities.
2. Migrate reports/dashboard queries to unified service line abstraction.
3. Deprecate legacy columns/routes only after full parity and UAT signoff.

### 5.3 Critical blockers to resolve first

1. Authoritative schema verification (actual DB vs generated types)
2. Decision on historical pricing/audit preservation strategy
3. Finalized target JO line model (single polymorphic table vs split tables)
4. Clear inventory deduction policy by line type and `is_customer_provided`
5. Rework process rules (field list, status transitions, HM approval checkpoints)

### 5.4 Suggested DB migration approach

Safety-first DB strategy:

1. Additive migrations first
- Add new columns/tables nullable/defaulted.
- Keep legacy fields and FKs intact initially.

2. Backfill + verification
- Backfill new structures from old JO/package/pricing records.
- Build verification queries comparing old and new computed totals.

3. Transitional constraints
- Add partial/check constraints in soft mode first (or via app-level validation), then harden after data passes.

4. Dual-write period
- Write to old and new representations for a controlled window.
- Reconcile regularly.

5. Controlled cutover
- Flip reads to new model via feature flag.
- Keep rollback path until UAT acceptance.

### 5.5 Clarifications needed before implementation

1. For rework: exact fields on `job_orders` and allowed source statuses.
2. Payment: required allowed values for mode and required format rules for reference.
3. Labor model: whether labor price can vary by branch and/or effective date.
4. Package composition: exact definition of fixed vs vehicle-specific components.
5. Inventory policy: whether customer-provided inventory should still be costed, and how that impacts total.
6. Historical reports: whether old completed JOs must remain query-compatible with current dashboard metrics.

---

## Appendix: Key Files Scanned

Backend core:
- `backend/src/routes/joborders.routes.ts`
- `backend/src/routes/packages.routes.ts`
- `backend/src/routes/pricing.routes.ts`
- `backend/src/routes/inventory.routes.ts`
- `backend/src/types/database.types.ts`
- `backend/src/index.ts`
- `backend/src/routes/dashboard.routes.ts`

Frontend core:
- `frontend/src/pages/subpages/JobOrderManagement.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/types/index.ts`

This report is analysis-only, with no implementation changes applied.
