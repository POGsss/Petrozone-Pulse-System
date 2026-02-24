# Sprint 3 – Inventory Module Prompts (4 Modules)

---

## Module 1: Inventory Management

```text
You are implementing the Inventory Management module for Sprint 3.

Authoritative references:
- docs/PHASE1.md, docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC45–UC48)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-3, FR-4, FR-6)
- docs/requirements/UseCase&UserStories.xlsx → "Roles & Permissions" sheet

Scope:
1. Add Inventory (UC45)
2. View Inventory (UC46)
3. Update Inventory (UC47)
4. Delete Inventory (UC48)
5. Stock Deduction — auto-deduct from branch inventory when a Job Order status changes (FR-3)
6. Inventory Adjustment — manual corrections by authorized roles
7. Low-Stock Visibility — dashboard indicator for critical low-stock items (FR-4)
8. Stock Movement History — ledger of all stock-in, stock-out, and adjustments

RBAC (from UC45–UC48):
- Add / View / Update / Delete Inventory: HM, POC, JS
- Stock Deduction: system-triggered on JO status change (POC, JS, R approve)
- Inventory Adjustment: HM, POC only
- Low-Stock View: HM, POC, JS, R, T

Mandatory fields (Inventory Item):
- item_name
- sku_code (unique per branch)
- category
- unit_of_measure
- cost_price
- reorder_threshold
- status (active | inactive)
- branch_id

Stock Deduction rules (FR-3):
- "Parts usage auto-deducts from branch inventory upon status change, triggering low-stock notifications"
- Deduction occurs when JO moves to approved (or equivalent fulfillment status)
- If insufficient stock, block the status change
- Every deduction must create a stock_movement record
- Must be reversible if JO is cancelled (stock restored)

Inventory Adjustment rules:
- Only HM and POC can perform adjustments
- adjustment_type: increase | decrease
- Cannot reduce stock below zero
- Must require a reason field
- Every adjustment must create a stock_movement record

Low-Stock Visibility rules (FR-4):
- "Critical Low Stock items" must appear on operational dashboard
- Warning triggers when current_quantity falls below reorder_threshold
- Only branch-visible data allowed

Stock Movement record fields:
- inventory_item_id
- movement_type (stock_in | stock_out | adjustment)
- quantity
- reference_type (purchase_order | job_order | adjustment)
- reference_id
- branch_id
- created_by
- created_at

User Stories:
- UC45: As a HM, POC, or JS, I want to add inventory items so parts and supplies can be tracked accurately
- UC46: As a HM, POC, or JS, I want to view inventory levels to monitor stock availability
- UC47: As a HM, POC, or JS, I want to update inventory details to reflect stock changes and adjustments
- UC48: As a HM, POC, or JS, I want to delete inventory items that are obsolete or invalid
- FR-3: As a POC, JS, or R, I want inventory to deduct automatically when products are used in job orders
- FR-3: As a HM or POC, I want the system to block approval if stock is insufficient
- FR-4: As a HM or POC, I want to be alerted when items fall below reorder level
- FR-6: As a HM, POC, JS, R, or T, I want to see current stock levels so I know product availability

Acceptance Criteria:
- Inventory item is added within ≤5 seconds with 100% mandatory fields validated and a unique item ID assigned
- Inventory list loads within ≤3 seconds with ≥99% quantity accuracy
- Inventory updates are saved successfully in ≥98% of valid updates and reflected in real time
- Deleted inventory items are removed from active stock and cannot be selected in 100% of transactions
- Stock levels must be calculated from the movement ledger, not hard-coded quantities
- SKU uniqueness must be enforced per branch
- Soft delete only (set status to inactive)
- All actions must be audit-logged (FR-17)
- No negative stock allowed
- Transactions must be database-atomic

Tasks:
1. Design inventory_items and stock_movements schemas with constraints
2. Implement backend CRUD APIs for inventory items with validation
3. Implement stock deduction logic integrated into JO lifecycle (approval endpoint)
4. Implement manual inventory adjustment endpoint (HM, POC only)
5. Compute on-hand quantity from movement ledger
6. Apply Supabase RLS policies for branch isolation
7. Build Inventory Management page (table style same as other table style pages)
8. Add low-stock indicator on dashboard
9. Add Inventory sidebar item after Catalog
10. Audit log all mutations
11. Maintain consistent styling and use available modal components
```

---

## Module 2: Purchase Orders for Inventory

```text
You are implementing the Purchase Orders for Inventory module for Sprint 3.

Authoritative references:
- docs/PHASE1.md, docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC49–UC52)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-6)
- docs/requirements/UseCase&UserStories.xlsx → "Roles & Permissions" sheet

Scope:
1. Create purchase orders for inventory (UC49)
2. View purchase orders for inventory (UC50)
3. Update purchase orders for inventory (UC51)
4. Delete purchase orders for inventory (UC52)
5. Stock-In Recording — receiving inventory from purchase orders increases on-hand quantity
6. Link purchase orders to inventory items and suppliers (if Module 3 & 4 are done)

RBAC (from UC49–UC52 and Roles & Permissions matrix):
- Create / View / Update / Delete Purchase Orders: HM, POC, JS, R

FR-6 Description:
"The system shall allow for managing (creating, updating, reading, deleting) Purchase Orders (POs), including the creation of templates for inventory replenishment, directly linked to real-time inventory monitoring, and deletion of specific order steps if necessary."

Mandatory fields (Purchase Order):
- po_number (auto-generated or manual)
- supplier_id (optional until Module 3 is implemented)
- status (draft | submitted | received | cancelled)
- order_date
- expected_delivery_date
- branch_id

Purchase Order Item fields:
- purchase_order_id
- inventory_item_id
- quantity_ordered
- unit_cost
- quantity_received (updated on stock-in)

Stock-In rules:
- When PO status changes to "received", increase on-hand quantity for each item
- Stock levels must update atomically
- No negative quantities allowed
- Every stock-in must create a stock_movement record with reference_type = "purchase_order"
- Race conditions must be prevented (use transactions)

User Stories:
- UC49: As an HM, POC, JS, or R, I want to create a purchase order so inventory items can be procured
- UC50: As an HM, POC, JS, or R, I want to view purchase orders for tracking and reference
- UC51: As an HM, POC, JS, or R, I want to update purchase orders to keep inventory records current
- UC52: As an HM, POC, JS, or R, I want to delete purchase orders to remove invalid or cancelled entries

Acceptance Criteria:
- Purchase order is saved within ≤3 seconds with 100% mandatory field validation enforced
- Purchase order details load within ≤2 seconds with 100% data accuracy
- Updates are saved successfully in ≥99% of valid submissions and reflected immediately
- Deleted purchase orders are removed from active records in 100% of deletion attempts
- Stock-in is recorded atomically per PO item
- All actions must be audit-logged (FR-17)
- Soft delete only

Tasks:
1. Design purchase_orders and purchase_order_items schemas with constraints
2. Implement backend CRUD APIs for purchase orders with validation
3. Implement stock-in logic when PO status changes to "received"
4. Create stock_movement records for each stock-in event
5. Apply Supabase RLS policies for branch isolation
6. Build Purchase Orders management page (Same styling as Inventory Management, Table style.)
7. Add Purchase Orders sidebar item under Job Orders section
8. Audit log all mutations
9. Maintain consistent styling and use available modal components
```

---

## Module 3: Supplier Profile Management

```text
You are implementing the Supplier Profile Management module for Sprint 3.

Authoritative references:
- docs/PHASE1.md, docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md (Section 2.2: Inventory Replenishment)
- docs/requirements/UseCase&UserStories.xlsx (UC53–UC56)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-13)
- docs/requirements/UseCase&UserStories.xlsx → "Roles & Permissions" sheet

Scope:
1. Create Supplier Profile (UC53)
2. View Supplier Profile (UC54)
3. Edit Supplier Profile (UC55)
4. Delete Supplier Profile (UC56)

RBAC (from UC53–UC56):
- Create / View / Edit / Delete Supplier Profile: HM, POC, JS

FR-13 Description:
"System should allow the administrator, receptionist, and supervisor to create, read, update, and delete supplier profiles. These profiles should include supplier name, contact details, emails, phone numbers, and Petrozone Pulse users connected (system and operational roles), and supplier products connected."

Mandatory fields (Supplier Profile):
- supplier_name
- contact_person
- email
- phone
- address
- status (active | inactive)
- branch_id

Rules:
- Soft delete only (set status to inactive)
- All actions must be audit-logged (FR-17)
- Branch isolation enforced via RLS
- Supplier profiles should show linked supplier products (from Module 4)

User Stories:
- UC53: As an HM, POC, or JS, I want to create a supplier profile to register suppliers in the system
- UC54: As an HM, POC, or JS, I want to view supplier profiles for reference and management
- UC55: As an HM, POC, or JS, I want to edit supplier profiles to keep supplier information updated
- UC56: As an HM, POC, or JS, I want to delete supplier profiles to remove inactive suppliers

Acceptance Criteria:
- Supplier profile is saved within ≤3 seconds with 100% mandatory field validation
- Supplier profile details load within ≤2 seconds with 100% data accuracy
- Supplier profile updates are saved successfully in ≥99% of valid submissions
- Supplier profile is removed from active records in 100% of deletion attempts
- All actions must be audit-logged (FR-17)

Tasks:
1. Design suppliers schema with constraints
2. Implement backend CRUD APIs for supplier profiles with validation
3. Apply Supabase RLS policies for branch isolation
4. Build Supplier Management page (card/table style consistent with other management pages)
5. Add Supplier sidebar item under Inventory section
6. Audit log all mutations
7. Maintain consistent styling and use available modal components
```

---

## Module 4: Supplier Product Management

```text
You are implementing the Supplier Product Management module for Sprint 3.

Authoritative references:
- docs/PHASE1.md, docs/PHASE2.md
- docs/SYSTEM_CONCEPT.md (Section 2.2: Inventory Replenishment)
- docs/requirements/UseCase&UserStories.xlsx (UC57–UC60)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx (FR-14)
- docs/requirements/UseCase&UserStories.xlsx → "Roles & Permissions" sheet

Scope:
1. Create Supplier Product (UC57)
2. View Supplier Product (UC58)
3. Edit Supplier Product (UC59)
4. Delete Supplier Product (UC60)

RBAC (from UC57–UC60):
- Create / View / Edit / Delete Supplier Product: HM, POC, JS

FR-14 Description:
"System should allow supervisors, administrators, to create, update, and delete supplier product profiles. Products and suppliers have a one-to-one relationship, wherein one product can only belong to one supplier."

Mandatory fields (Supplier Product):
- supplier_id (FK to suppliers)
- inventory_item_id (FK to inventory_items) — or product_name if not linked to inventory
- unit_cost
- lead_time_days (optional)
- status (active | inactive)

Rules:
- One-to-one relationship: one product belongs to exactly one supplier (FR-14)
- Soft delete only (set status to inactive)
- All actions must be audit-logged (FR-17)
- Branch isolation enforced via RLS
- Supplier products should be viewable from the parent Supplier Profile (Module 3)
- Can be used in Purchase Orders (Module 2) to auto-fill unit cost

User Stories:
- UC57: As an HM, POC, or JS, I want to create supplier products to link items with suppliers
- UC58: As an HM, POC, or JS, I want to view supplier products for inventory reference
- UC59: As an HM, POC, or JS, I want to edit supplier products to reflect pricing or item changes
- UC60: As an HM, POC, or JS, I want to delete supplier products that are no longer offered

Acceptance Criteria:
- Supplier product is created within ≤3 seconds with full validation of required fields
- Supplier product details load within ≤2 seconds with 100% accuracy
- Supplier product updates are saved successfully in ≥99% of valid submissions
- Supplier product is removed from active records in 100% of deletion attempts
- One-to-one constraint enforced: a product cannot be assigned to multiple suppliers
- All actions must be audit-logged (FR-17)

Tasks:
1. Design supplier_products schema with constraints (unique constraint on inventory_item_id)
2. Implement backend CRUD APIs for supplier products with validation
3. Enforce one-to-one supplier-product constraint at DB and API level
4. Apply Supabase RLS policies for branch isolation
5. Build Supplier Products sub-section within Supplier Management page (or linked view)
6. Audit log all mutations
7. Maintain consistent styling and use available modal components
```

---
