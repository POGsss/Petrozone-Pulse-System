# Sprint 3 – Module-by-Module Copilot Prompts
---

## Module 1: Inventory Item Master

```text
You are implementing the Inventory Item Master module for Sprint 3.

Authoritative references:
- docs/PHASE1.md
- docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC45–UC48)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-6)

Scope:
- Create, view, update, and deactivate inventory items
- Track stock-controlled products only (not services)
- Enforce mandatory fields at frontend, backend, and database level
- Enforce branch isolation and RBAC
- Record audit logs for all mutations

Mandatory fields:
- item_name
- sku_code (unique per branch)
- category
- unit_of_measure
- cost_price
- status
- branch_id

Rules:
- SKU uniqueness must be enforced per branch
- Soft delete only (set status to inactive)
- All actions must be audit-logged

User Stories:
As a HM, POC, or JS, I want to add inventory items so parts and supplies can be tracked accurately
As a HM, POC, or JS, I want to view inventory levels to monitor stock availability
As a HM, POC, or JS, I want to update inventory details to reflect stock changes and adjustments
As a HM, POC, or JS, I want to delete inventory items that are obsolete or invalid

Tasks:
1. Design inventory_items schema with constraints
2. Implement backend CRUD APIs with validation
3. Apply Supabase RLS policies
4. Build Inventory Items management page (same table style as User Management)
5. Add Inventory sidebar item after Catalog
6. Maintain consistent styling of components and use available modal component for all actions

Do not implement stock movement logic yet.
```

---

## Module 2: Stock Entry (Stock-In / Procurement)

```text
You are implementing the Stock Entry (Stock-In) module for Sprint 3.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC49–UC52)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-6)

Scope:
- Record stock-in transactions (purchase order driven)
- Increase on-hand quantity
- Maintain movement history
- Enforce branch scope
- Audit all stock changes

Mandatory fields:
- inventory_item_id
- quantity_received
- unit_cost
- reference_number
- received_date
- branch_id

Rules:
- Stock levels must update atomically
- No negative quantities allowed
- Every stock change must create a stock_movement record
- Transactions must be database-atomic

User Stories:
As an HM, POC, JS, or R, I want to create a purchase order so inventory items can be procured.
As an HM, POC, JS, or R, I want to view purchase orders for tracking and reference.
As an HM, POC, JS, or R, I want to update purchase orders to keep inventory records current.
As an HM, POC, JS, or R, I want to delete purchase orders to remove invalid or cancelled entries.

Tasks:
1. Design stock_movements schema
2. Implement transactional stock update logic
3. Prevent race conditions
4. Build Stock-In UI form and list view
5. Display updated on-hand quantity in real time
6. Audit logging
```

---

## Module 3: Stock Deduction (Stock-Out via Job Orders)

```text
You are implementing automatic stock deduction via Job Orders.

Authoritative references:
- docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-3, FR-6)

Scope:
- Deduct inventory when stock-controlled product is used in job order
- Prevent negative stock
- Maintain movement history
- Enforce branch isolation
- Ensure consistency with job order lifecycle

Mandatory fields:
- job_order_id
- inventory_item_id
- quantity_used
- branch_id

Rules:
- Stock deduction occurs when job order is marked APPROVED or FULFILLED (based on system rule)
- If insufficient stock, block approval
- No silent stock adjustments
- Every deduction must create stock_movement record
- Must be reversible if job order is cancelled (if allowed by workflow)
- FR-3: "Parts usage auto-deducts from branch inventory upon status change, triggering low-stock notifications"

User Stories:
As a POC, JS, or R, I want inventory to deduct automatically when products are used in job orders.
As a HM or POC, I want the system to block approval if stock is insufficient.

Tasks:
1. Integrate inventory deduction into job order lifecycle
2. Implement stock validation before approval
3. Create atomic transaction logic
4. Handle rollback logic if job order is cancelled
5. Audit all stock deductions

Do not allow manual override of stock during deduction.
```

---

## Module 4: Inventory Adjustment

```text
You are implementing the Inventory Adjustment module for Sprint 3.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-6)

Note: Inventory adjustment is not explicitly defined as a separate use case in the
requirements but is a necessary operational feature for inventory accuracy and
compliance. It is derived from FR-6 (Record Stock-In) and NFR-10 (Audit Trail Logging).

Scope:
- Allow controlled manual adjustments
- Record reason for adjustment
- Maintain full audit trail
- Enforce RBAC

Mandatory fields:
- inventory_item_id
- adjustment_type (increase | decrease)
- quantity
- reason
- branch_id

Rules:
- Only HM and POC can perform adjustments
- Cannot reduce stock below zero
- Every adjustment must generate stock_movement record
- Adjustment must require a reason
- Fully audit-logged

User Stories:
As a HM or POC, I want to adjust inventory quantities to correct discrepancies.
As an auditor, I want to see adjustment history for accountability.

Tasks:
1. Implement inventory_adjustments schema
2. Enforce validation rules
3. Update stock levels atomically
4. Build Adjustment UI page
5. Audit logging

Do not implement approval workflow for adjustments.
```

---

## Module 5: Supplier Management

```text
You are implementing the Supplier Management module for Sprint 3.

Authoritative references:
- docs/SYSTEM_CONCEPT.md (Section 2.2: Inventory Replenishment)
- docs/requirements/UseCase&UserStories.xlsx (UC53–UC60)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-13, FR-14)

Scope:
- Create, view, update, and delete supplier profiles
- Create, view, update, and delete supplier products (one-to-one supplier-product mapping)
- Link suppliers to inventory items for procurement
- Enforce RBAC and branch isolation
- Record audit logs for all mutations

Supplier Profile mandatory fields:
- supplier_name
- contact_details (phone, email)
- status
- branch_id

Supplier Product mandatory fields:
- supplier_id
- inventory_item_id (or product reference)
- unit_cost
- status

Rules:
- Supplier-product relationship is one-to-one (FR-14)
- Soft delete only
- All actions must be audit-logged (FR-17)

User Stories:
As an HM, POC, or JS, I want to create a supplier profile to register suppliers in the system.
As an HM, POC, or JS, I want to view supplier profiles for reference and management.
As an HM, POC, or JS, I want to edit supplier profiles to keep supplier information updated.
As an HM, POC, or JS, I want to delete supplier profiles to remove inactive suppliers.
As an HM, POC, or JS, I want to create supplier products to link items with suppliers.
As an HM, POC, or JS, I want to view supplier products for inventory reference.
As an HM, POC, or JS, I want to edit supplier products to reflect pricing or item changes.
As an HM, POC, or JS, I want to delete supplier products that are no longer offered.

Tasks:
1. Design suppliers and supplier_products schemas with constraints
2. Implement backend CRUD APIs with validation for both entities
3. Apply Supabase RLS policies
4. Build Supplier Management page (same card/table style as other management pages)
5. Build Supplier Products sub-section or linked view
6. Add Supplier sidebar item in the Inventory section
7. Maintain consistent styling and use available modal components
```

---

## Module 6: Inventory Reporting & Visibility

```text
You are implementing Inventory Visibility features for Sprint 3.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-4, FR-6)

Scope:
- Display real-time stock on-hand
- Display low-stock indicators
- Show stock movement history
- Enforce branch-level isolation

Mandatory fields (display context):
- item_name
- sku_code
- current_quantity
- reorder_threshold
- status

Rules:
- Stock levels must be calculated from movement ledger
- No hard-coded quantities
- Low-stock warning must trigger when below threshold
- Only branch-visible data allowed
- FR-4: "Critical Low Stock items" must appear on operational dashboard

User Stories:
As a HM, POC, JS, R, or T, I want to see current stock levels so I know product availability.
As a HM or POC, I want to be alerted when items fall below reorder level.

Tasks:
1. Implement stock summary view
2. Compute on-hand from movement ledger
3. Add low-stock indicator UI
4. Add Inventory Dashboard section
5. Maintain consistent UI styling

Do not implement forecasting or analytics.
```

---

## Module 7: Sprint 3 End-to-End Testing

```text
You are validating Sprint 3 Inventory modules end-to-end.

Scope:
- Inventory item creation (UC45–UC48)
- Stock-in transactions (UC49–UC52)
- Supplier profiles and products (UC53–UC60)
- Job order stock deduction (FR-3)
- Inventory adjustments
- Low-stock visibility (FR-4)
- Audit log validation (FR-17)

Tasks:
1. Verify RBAC and branch isolation per use case matrix
2. Verify mandatory field enforcement
3. Verify stock accuracy after multiple movements
4. Verify negative stock prevention
5. Verify rollback logic (if job order cancelled)
6. Verify supplier profile and product CRUD
7. Verify audit log entries for all stock mutations
8. Update docs/checklist/sprint-3-checklist.md

Do not add new features. Fix only Sprint 3 scope issues.
```

---
