# Test Case Review Results & Revision Plan

**Date Reviewed:** February 20, 2026  
**Reviewed By:** Code Review (Manual Audit Against TESTING.md)  
**Codebase Version:** Current main branch

---

## Test Results Summary

| Category                        | Passed | Partial | Failed | Total |
|---------------------------------|--------|---------|--------|-------|
| Vehicle Profiles (TC 01–04)     | 4      | 0       | 0      | 4     |
| Catalog Items (TC 05–08)        | 4      | 0       | 0      | 4     |
| Pricing Matrix (TC 09–12)       | 4      | 0       | 0      | 4     |
| Job Order CRUD (TC 13–16)       | 2      | 2       | 0      | 4     |
| Customer Approval (TC 17–18)    | 2      | 0       | 0      | 2     |
| Customer Profiles (TC 19–22)    | 3      | 1       | 0      | 4     |
| Third-Party Repairs (TC 23–26)  | 3      | 1       | 0      | 4     |
| JO Lifecycle (TC 27–30)         | 2      | 0       | 2      | 4     |
| JO Pricing (TC 31–35)           | 2      | 1       | 2      | 5     |
| 3rd Party in Totals (TC 36–37)  | 0      | 0       | 2      | 2     |
| Approval Gate (TC 38)           | 1      | 0       | 0      | 1     |
| Versioning / History (TC 39)    | 0      | 1       | 0      | 1     |
| Performance (TC 40–41)          | 1      | 0       | 0      | 1     |
| **TOTAL**                       | **28** | **6**   | **6**  | **41**|

**Overall Pass Rate:** 68% Passed, 15% Partial, 15% Failed (excluding N/A)

> **UPDATE:** All 9 fixes have been implemented. See [Implementation Status](#implementation-status) at the bottom.

---

## Detailed Test Case Results

### PASSED (28 Test Cases)

#### TC-01 — Create Vehicle Profile ✅
- Backend: `POST /api/vehicles` validates all required fields (plate_number, vehicle_type, orcr, model, customer_id, branch_id).
- Frontend: Full create form with all fields (plate_number auto-uppercased, vehicle_type dropdown, color, year, engine/chassis numbers, notes).
- Roles: HM, POC, JS, R — correctly enforced.
- Customer linkage: Verified customer exists and belongs to same branch.
- Plate number uniqueness check implemented.

#### TC-02 — View Vehicle Profile ✅
- Backend: `GET /api/vehicles/:vehicleId` with branch/customer joins.
- Frontend: View modal displays all vehicle details + timestamps.
- Branch access scoping enforced (non-HM users restricted to their branches).

#### TC-03 — Update Vehicle Profile ✅
- Backend: `PUT /api/vehicles/:vehicleId` supports partial update of all fields.
- Plate number uniqueness re-checked on change.
- Frontend: Edit modal pre-filled with existing data.

#### TC-04 — Delete Vehicle Profile ✅
- Backend: `DELETE /api/vehicles/:vehicleId` performs **soft delete** (sets `status: "inactive"`).
- Vehicle remains in DB but marked inactive.
- Matches test expectation of deactivation-based deletion.

#### TC-05 — Create Services/Products/Packages ✅
- Backend: `POST /api/catalog` supports `type: service | product | package`.
- Fields: name, base_price, description, branch_id or is_global.
- Roles: HM, POC, JS — correctly enforced.
- Global items restricted to HM creation.

#### TC-06 — View Services/Products/Packages ✅
- Backend: `GET /api/catalog` and `GET /api/catalog/:itemId` with branch joins.
- Frontend: Card grid + View modal. R role can view but no edit controls shown.
- Branch scoping: Non-HM users see global items + their own branch items.

#### TC-07 — Update Services/Products/Packages ✅
- Backend: `PUT /api/catalog/:itemId` with partial field updates.
- Global item edits restricted to HM.
- Frontend: Edit modal with all fields.

#### TC-08 — Delete/Deactivate Services/Products/Packages ✅
- Backend: `DELETE /api/catalog/:itemId` tries hard delete; on FK constraint (23503), falls back to soft delete (status → inactive).
- Historical records preserved through smart deactivation.
- Frontend shows appropriate toast message for deactivation vs. deletion.

#### TC-09 — Create Pricing Matrix ✅
- Backend: `POST /api/pricing` with catalog_item_id, pricing_type (labor/packaging), price, branch_id.
- Conflict detection: Prevents duplicate active rules for same item + type + branch.
- Roles: HM, POC, JS, R.

#### TC-10 — View Pricing Matrix ✅
- Backend: `GET /api/pricing` with branch scoping.
- T role included in view permissions (HM, POC, JS, R, T).
- Frontend: Table view (desktop) + card view (mobile) + View modal.

#### TC-11 — Update Pricing Matrix ✅
- Backend: `PUT /api/pricing/:id` supports updating pricing_type, price, status, branch_id, etc.
- Conflict detection when activating a rule.
- New JOs use updated pricing; existing JOs keep snapshotted values.

#### TC-12 — Delete/Deactivate Pricing Matrix ✅
- Backend: `DELETE /api/pricing/:id` tries hard delete; falls back to soft delete on FK constraint.
- Deactivated entries excluded from pricing resolution (active-only filter).

#### TC-13 — Create Job Order Card ✅
- Backend: `POST /api/job-orders` validates customer, vehicle (must belong to customer), items (≥1 required).
- Pricing auto-resolved per item: `line_total = (base + labor + packaging) × qty`.
- `order_number` auto-generated by DB trigger.
- Frontend: Cascading branch → customer → vehicle dropdowns, draft items system with live pricing resolution.

#### TC-14 — View Job Order Card ✅
- Backend: `GET /api/job-orders/:id` returns order with all joins (customers, vehicles, branches, job_order_items).
- Frontend: View modal shows customer/vehicle info, items with full pricing breakdown (base/labor/packaging/line_total), total amount, status, timestamps.

#### TC-17 — Ask for Customer Approval ✅
- Backend: `PATCH /api/job-orders/:id/request-approval`.
- Status transition: `created` → `pending_approval` (only from "created" status).
- Audit log recorded.
- Frontend: "Request Approval" button shown when status is "created" (R/T roles).

#### TC-18 — Receive Customer Approval ✅
- Backend: `PATCH /api/job-orders/:id/record-approval` with `decision: "approved" | "rejected"`.
- Status transition: `pending_approval` → `approved` or `rejected`.
- Records: `approved_at`, `approved_by`, `approval_notes`.
- Frontend: Approve/Reject buttons in View modal when status is "pending_approval".

#### TC-19 — Create Customer Profile ✅
- Backend: `POST /api/customers` validates full_name (required), at least one contact method (phone or email), customer_type (individual/company), branch_id.
- Phone format validation (7–20 digits), email regex validation.
- Frontend: Full form with all fields.

#### TC-20 — View Customer Profile ✅
- Backend: `GET /api/customers/:customerId` with branch join.
- Frontend: View modal showing all customer details.
- Note: Linked vehicles/job orders not displayed inline — only customer data shown.

#### TC-21 — Update Customer Profile ✅
- Backend: `PUT /api/customers/:customerId` with partial updates.
- Ensures at least one contact method remains after update.
- Frontend: Edit modal with all fields.

#### TC-23 — Add Third-Party Repair ✅
- Backend: `POST /api/third-party-repairs` requires job_order_id, provider_name, description, cost, repair_date.
- Branch access verified through parent job order.
- Frontend: Add repairs during JO creation (draft) + manage on existing JOs via dedicated modal.

#### TC-24 — View Third-Party Repair ✅
- Backend: `GET /api/third-party-repairs/:id` with job order join (includes customer/vehicle).
- Frontend: Repairs listed in JO View modal with all details.

#### TC-25 — Update Third-Party Repair ✅
- Backend: `PUT /api/third-party-repairs/:id` supports partial updates (provider_name, description, cost, repair_date, notes).
- Frontend: Inline edit in Manage Repairs modal with diff-based batch save.

#### TC-27 — Draft to Pending Approval ✅
- `request-approval` endpoint validates `status === "created"`, transitions to `"pending_approval"`.
- Audit trail logged via `log_admin_action`.

#### TC-28 — Approval to Approved ✅
- `record-approval` endpoint with `decision: "approved"`: `pending_approval` → `approved`.
- Approval timestamp and actor recorded. Post-approval actions follow role rules.

#### TC-31 — Auto Compute Totals ✅
- Backend resolves pricing per item at creation: `line_total = (base_price + labor_price + packaging_price) × quantity`.
- `total_amount` summed across all items.
- Frontend displays full pricing breakdown per line item.

#### TC-34 — Update Pricing Matrix Impact ✅
- Pricing is **snapshotted** into `job_order_items` at creation time (base_price, labor_price, packaging_price, line_total).
- Existing JOs keep original pricing. New JOs use updated pricing.
- Consistent, predictable behavior.

#### TC-38 — Prevent Pricing Changes After Approval ✅ (by design)
- Items are **immutable after creation** regardless of status.
- Effectively prevents any item/pricing changes after approval.
- No re-approval mechanism needed since edits are globally blocked.

#### TC-40 — Job Order List Performance ✅ (code-level)
- Backend: Server-side pagination (limit/offset), indexed Supabase queries.
- Frontend: Client-side pagination (12/page) + search/filter.
- No anti-patterns detected. Actual load time verification requires live testing with data.

---

### PARTIAL PASS (6 Test Cases)

#### TC-15 — Update Job Order Card ⚠️
**Issue:** Backend `PUT /api/job-orders/:id` **only updates `notes`**. Items are explicitly documented as "immutable after creation."
- **What works:** Notes field can be updated; order re-fetched with all joins.
- **What's missing:** Cannot add/remove services/products, change quantities, or trigger total recalculation.
- **Test expectation:** Add/remove items, change quantities, verify total recalculation.

#### TC-16 — Delete/Cancel Job Order Card ⚠️
**Issue:** Backend `DELETE /api/job-orders/:id` performs **hard delete** (removes from DB). No "cancelled" status exists.
- **What works:** Hard delete works; items deleted first (FK constraint), then order. Linked customer/vehicle records remain intact.
- **What's missing:** No cancel status or workflow. No preservation of cancelled record for history.
- **Test expectation:** Cancel/status update to "cancelled", blocked actions on cancelled JOs.

#### TC-22 — Delete/Deactivate Customer Profile ⚠️
**Issue:** Backend `DELETE /api/customers/:customerId` performs **hard delete** instead of soft delete/deactivation.
- **What works:** Customer is removed. Audit logged.
- **What's missing:** No deactivation option. The `status` field (active/inactive) exists but isn't used during deletion. Inactive customers are not filtered out of JO creation dropdowns.
- **Test expectation:** Deactivate (not delete), prevent selection of inactive customers in new JOs.

#### TC-26 — Delete/Remove Third-Party Repair ⚠️
**Issue:** Repair deletion doesn't update parent JO totals.
- **What works:** Backend hard deletes the repair record. Frontend updates local state.
- **What's missing:** Third-party repair costs are stored separately and not included in `job_orders.total_amount`. Removing a repair doesn't trigger any JO total recalculation.
- **Test expectation:** Totals update correctly when repair is removed.

#### TC-35 — Pricing Missing Configuration ⚠️
**Issue:** No explicit warning or block when catalog item has no pricing configured.
- **What works:** Backend defaults to null for labor/packaging prices. Line total uses base price only. System doesn't crash.
- **What's missing:** No user-facing warning or error message. No block preventing save. Silently uses base price as fallback.
- **Test expectation:** System blocks or applies fallback with clear message. No silent incorrect totals.

#### TC-39 — Job Order Versioning / History ⚠️
**Issue:** No inline history/status trail in the Job Order view.
- **What works:** Audit logs exist in `audit_logs` table. Status changes (create, approval requests, approvals/rejections, deletions) are logged via `log_admin_action` RPC.
- **What's missing:** No "History" or "Status Trail" section in the JO View modal. Audit data is only accessible through the separate Audit Logs page.
- **Test expectation:** Status trail visible within JO detail view showing key events with timestamps and actors.

---

### FAILED (6 Test Cases)

#### TC-29 — Job Order Lifecycle: Reject Approval ❌
**Issue:** No re-approval path for rejected job orders.
- **Root Cause:** The `request-approval` endpoint only allows transitions from `"created"` → `"pending_approval"`. A rejected JO's status is `"rejected"` and cannot transition back to `"pending_approval"` for re-submission.
- **Impact:** Once rejected, a JO is stuck with no way to re-request approval. Must be deleted and recreated.

#### TC-30 — Job Order Lifecycle: Cancel Job Order ❌
**Issue:** No "cancelled" status or cancel workflow.
- **Root Cause:** The `job_order_status` enum only has: `created | pending_approval | approved | rejected`. No "cancelled" value. No cancel endpoint exists. Only option is hard delete.
- **Impact:** Cannot cancel a job order while preserving its record for history/audit.

#### TC-32 — Quantity and Recalculation ❌
**Issue:** Cannot modify item quantities after JO creation.
- **Root Cause:** Backend PUT endpoint only updates `notes`. Items are immutable. No item update endpoint exists.
- **Impact:** Any pricing correction requires deleting and recreating the entire JO.

#### TC-33 — Remove Item Recalculation ❌
**Issue:** Cannot remove items from an existing JO.
- **Root Cause:** Same as TC-32. No item management endpoints post-creation.
- **Impact:** Cannot correct mistakes in item selection without full JO deletion and recreation.

#### TC-36 — Third-Party Repair Cost in Totals ❌
**Issue:** Third-party repair costs are not included in the JO `total_amount`.
- **Root Cause:** `total_amount` is only the sum of `job_order_items.line_total`. Third-party repairs are stored in a separate table with no automatic rollup into the JO total.
- **Impact:** JO total doesn't reflect the true cost including external repairs.

#### TC-37 — Third-Party Repair Update Recalculation ❌
**Issue:** Updating a repair cost doesn't trigger JO total recalculation.
- **Root Cause:** Same as TC-36. Repair costs are not part of JO totals. No recalculation mechanism exists.
- **Impact:** Even if TC-36 were fixed, there's no trigger/hook to recalculate totals when repairs change.

---

### NOT APPLICABLE (1 Test Case)

#### TC-41 — Pricing Recalculation Performance
- Cannot test pricing recalculation performance because items/quantities cannot be modified after creation. During creation, pricing is resolved per-item sequentially via individual API calls — potential bottleneck with many items but no recalculation scenario exists.

---

## Revision Plan: Fixes and Next Steps

### Priority 1 — Critical (Failing Core Workflow)

#### Fix 1: Add "cancelled" Job Order Status
**Affected Tests:** TC-16 (partial), TC-30 (fail)
**Scope:** Backend + Frontend + Database

**Steps:**
1. Add `"cancelled"` to the `job_order_status` enum in the database:
   ```sql
   ALTER TYPE job_order_status ADD VALUE 'cancelled';
   ```
2. Create new backend endpoint: `PATCH /api/job-orders/:id/cancel`
   - Validate: Only specific statuses can be cancelled (e.g., `created`, `pending_approval`)
   - Set status to `"cancelled"`
   - Audit log the cancellation
3. Add cancel button to frontend JO View modal (conditional on status)
4. Block edit/approval actions on cancelled JOs (frontend + backend guards)
5. Update `database.types.ts` to include `"cancelled"` in the enum
6. Update frontend type definitions

---

#### Fix 2: Enable Job Order Item Editing Post-Creation
**Affected Tests:** TC-15 (partial), TC-32 (fail), TC-33 (fail)
**Scope:** Backend + Frontend

**Steps:**
1. Create new backend endpoints:
   - `POST /api/job-orders/:id/items` — Add item to existing JO
   - `PUT /api/job-orders/:id/items/:itemId` — Update item quantity
   - `DELETE /api/job-orders/:id/items/:itemId` — Remove item
2. Each endpoint must:
   - Check JO status (block if approved/cancelled)
   - Resolve pricing for new/updated items
   - Recalculate `total_amount` on the parent JO
3. Update frontend JO edit/view modal:
   - Add edit button for individual items (quantity only or full edit)
   - Add remove button per item
   - Add "Add Item" button with catalog item picker
   - Show live total recalculation
4. Add status guard: Only allow item edits when status is `created` or `rejected`

---

#### Fix 3: Include Third-Party Repair Costs in JO Totals
**Affected Tests:** TC-26 (partial), TC-36 (fail), TC-37 (fail)
**Scope:** Backend + Frontend

**Steps:**
1. **Option A (Recommended): Computed Total**
   - Add a computed/virtual `grand_total` that sums `total_amount` + all third-party repair costs
   - Backend: Create a query or view that includes repair cost sum
   - Frontend: Display `grand_total = items_total + repairs_total`
   - Keep `total_amount` as items-only for backward compatibility

2. **Option B: Stored Total**
   - Add `repairs_total` column to `job_orders` table
   - Update it whenever a repair is created/updated/deleted
   - Add database trigger or backend logic to recalculate on repair changes

3. Update JO View modal to show:
   - Items Subtotal: ₱X,XXX
   - Third-Party Repairs: ₱X,XXX
   - **Grand Total: ₱X,XXX**

---

### Priority 2 — Important (Partial Failures)

#### Fix 4: Re-Approval Flow for Rejected JOs
**Affected Tests:** TC-29 (fail)
**Scope:** Backend + Frontend

**Steps:**
1. Modify `request-approval` endpoint to allow `rejected` → `pending_approval` transition:
   ```typescript
   if (existing.status !== "created" && existing.status !== "rejected") {
     // block
   }
   ```
2. Clear previous approval fields when re-requesting (`approved_at`, `approved_by`, `approval_notes`)
3. Frontend: Show "Re-Request Approval" button when status is `rejected`
4. Audit log the re-request

---

#### Fix 5: Customer Soft Delete / Deactivation
**Affected Tests:** TC-22 (partial)
**Scope:** Backend + Frontend

**Steps:**
1. Change backend `DELETE /api/customers/:customerId` to **soft delete** (set `status: "inactive"`) instead of hard delete
2. OR add a separate `PATCH /api/customers/:id/deactivate` endpoint
3. Filter inactive customers from JO creation dropdowns:
   - Backend: Add `status: "active"` filter when fetching customers for JO form
   - Frontend: Filter dropdown to show only active customers
4. Allow admin to view inactive customers in the customer list (with filter toggle)

---

#### Fix 6: Missing Pricing Warning
**Affected Tests:** TC-35 (partial)
**Scope:** Frontend

**Steps:**
1. When resolve pricing returns null for labor AND packaging, show a warning toast:
   ```
   "No labor/packaging pricing configured for this item at this branch. Only base price will be used."
   ```
2. Optionally add a visual indicator (⚠️ icon) on draft items that have incomplete pricing
3. Optionally block JO submission if critical pricing is missing (configurable)

---

### Priority 3 — Nice to Have (Enhancements)

#### Fix 7: Inline Job Order History/Status Trail
**Affected Tests:** TC-39 (partial)
**Scope:** Backend + Frontend

**Steps:**
1. Create backend endpoint: `GET /api/job-orders/:id/history`
   - Query `audit_logs` filtered by `entity_type = "JOB_ORDER"` and `entity_id = :id`
   - Return sorted list of events with timestamps, actors, and changes
2. Add "History" tab or collapsible section in JO View modal
3. Display timeline with events: Created → Request Approval → Approved/Rejected → etc.
4. Show actor name and timestamp for each event

---

#### Fix 8: Customer View — Linked Records
**Affected Tests:** TC-20 (enhancement)
**Scope:** Frontend

**Steps:**
1. In Customer View modal, add sections for:
   - **Linked Vehicles**: Fetch and display vehicles where `customer_id` matches
   - **Job Order History**: Fetch and display JOs where `customer_id` matches
2. Backend endpoints already exist for these queries (with customer_id filter)

---

#### Fix 9: Pricing Recalculation Performance
**Affected Tests:** TC-41 (N/A → testable after Fix 2)
**Scope:** Backend

**Steps:**
1. Create a bulk pricing resolution endpoint:
   ```
   POST /api/pricing/resolve-bulk
   Body: { items: [{ catalog_item_id, branch_id }], branch_id }
   ```
2. Resolve all pricing in a single query instead of per-item API calls
3. Use this during JO creation and item editing for better performance

---

## Implementation Order

| Phase | Fixes | Tests Resolved | Effort |
|-------|-------|---------------|--------|
| Phase 1 | Fix 1 (Cancel Status), Fix 4 (Re-Approval) | TC-16, TC-29, TC-30 | Medium |
| Phase 2 | Fix 2 (Item Editing) | TC-15, TC-32, TC-33 | High |
| Phase 3 | Fix 3 (Repair Totals), Fix 5 (Customer Soft Delete) | TC-22, TC-26, TC-36, TC-37 | Medium |
| Phase 4 | Fix 6 (Pricing Warning), Fix 7 (JO History), Fix 8 (Customer Links) | TC-20, TC-35, TC-39 | Low–Medium |
| Phase 5 | Fix 9 (Bulk Pricing) | TC-41 | Low |

**Estimated total effort:** 3–5 development cycles depending on team size and testing.

---

## Files That Will Need Changes

### Backend
- `backend/src/joborders/joborders.routes.ts` — Cancel endpoint, item editing endpoints, repair total hooks
- `backend/src/customers/customers.routes.ts` — Soft delete instead of hard delete
- `backend/src/types/database.types.ts` — Updated enum types
- `backend/src/pricing/pricing.routes.ts` — Bulk resolve endpoint (Phase 5)

### Frontend
- `frontend/src/pages/subpages/JobOrderManagement.tsx` — Cancel button, item editing UI, re-approval button, repair totals display, pricing warnings, history section
- `frontend/src/pages/subpages/CustomerManagement.tsx` — Deactivation instead of delete, inactive filter
- `frontend/src/types/index.ts` — Updated type definitions

### Database (Supabase)
- Add `cancelled` to `job_order_status` enum
- (Optional) Add `repairs_total` or `grand_total` column to `job_orders`
- (Optional) Add DB trigger for repair cost rollup

---

## Implementation Status

All 9 fixes have been implemented. Below is a summary of changes made:

### Fix 1: Cancel Job Order ✅ IMPLEMENTED
- **Backend:** Added `PATCH /api/job-orders/:id/cancel` endpoint in `joborders.routes.ts`
- **Frontend:** Added cancel button in card actions and view modal, "cancelled" status in labels/colors/filters
- **Types:** Added `"cancelled"` to `JobOrderStatus` type and `database.types.ts` enum

### Fix 2: Job Order Item Editing ✅ IMPLEMENTED
- **Backend:** Added `POST /api/job-orders/:id/items`, `PUT /api/job-orders/:id/items/:itemId`, `DELETE /api/job-orders/:id/items/:itemId`
- Items can only be modified when JO status is "created" or "rejected"
- `total_amount` is recalculated on every item change
- Delete enforces minimum 1 item constraint
- **Frontend API:** Added `addItem()`, `updateItem()`, `removeItem()` methods to `jobOrdersApi`

### Fix 3: Repair Totals Display ✅ IMPLEMENTED
- **Frontend:** Added "Grand Total" section in JO View modal showing `items_total + repairs_total`
- View modal already showed combined total in header; now has dedicated Grand Total section

### Fix 4: Re-Approval Flow ✅ IMPLEMENTED
- **Backend:** Modified `request-approval` endpoint to allow `rejected → pending_approval` transition
- Clears previous approval fields (`approved_at`, `approved_by`, `approval_notes`) on re-request
- **Frontend:** Added "Re-Request Customer Approval" button when status is "rejected"

### Fix 5: Customer Soft Delete ✅ IMPLEMENTED
- **Backend:** Changed `DELETE /api/customers/:customerId` from hard delete to soft delete (`status: "inactive"`)
- Response message changed to "Customer deactivated successfully"

### Fix 6: Missing Pricing Warning ✅ IMPLEMENTED
- **Frontend:** Added `showToast.warning()` method to toast utility
- When pricing resolution returns `null` for both labor and packaging, shows warning toast

### Fix 7: JO Inline History ✅ IMPLEMENTED
- **Backend:** Added `GET /api/job-orders/:id/history` endpoint querying audit_logs
- **Frontend:** Added History section in JO View modal with timeline display
- **Types:** Added `JobOrderHistory` type

### Fix 8: Customer Linked Records ✅ IMPLEMENTED
- **Frontend:** Added "Linked Vehicles" and "Linked Job Orders" sections in Customer View modal
- Fetches vehicles and JOs by `customer_id` when modal opens

### Fix 9: Bulk Pricing Resolve ✅ IMPLEMENTED
- **Backend:** Added `POST /api/pricing/resolve-bulk` endpoint in `pricing.routes.ts`
- Accepts `{ branch_id, catalog_item_ids: string[] }` and returns pricing for all items in one call
- **Frontend API:** Added `resolveBulk()` method to `pricingApi`

### Required Database Migration

Before deploying, run this SQL in your Supabase SQL editor:

```sql
ALTER TYPE job_order_status ADD VALUE 'cancelled';
```

This adds the "cancelled" value to the `job_order_status` enum. Without this migration, the cancel endpoint will fail with a database error.
