# Sprint 3 – Module-by-Module Copilot Prompts

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
5. Stock Deduction — auto-deduct from branch inventory when a Job Order is approved (FR-3)
6. Stock Restoration — restore deducted stock when an approved Job Order is cancelled
7. Inventory Adjustment — manual corrections by authorized roles
8. Direct Stock-In — record stock received outside of purchase orders
9. Low-Stock Visibility — stats indicator on Inventory page for critical low-stock items (FR-4)
10. Stock Movement History — ledger of all stock-in, stock-out, and adjustments

RBAC (from UC45–UC48):
- Add / View / Update / Delete Inventory: HM, POC, JS
- Stock Deduction/Restoration: system-triggered on JO approval/cancellation
- Inventory Adjustment: HM, POC only
- Direct Stock-In: HM, POC, JS
- Low-Stock View: HM, POC, JS, R, T (via /low-stock endpoint)

Mandatory fields (Inventory Item):
- item_name
- sku_code (unique per branch, auto-uppercased)
- category
- unit_of_measure
- cost_price (non-negative)
- branch_id

Optional fields:
- reorder_threshold (defaults to 0)
- initial_stock (if > 0, creates a stock_in movement on creation)
- status (defaults to "active")

Stock quantity computation:
- Quantity is NOT stored on the inventory item — it is computed from the stock_movements ledger
- current_quantity = sum of all stock_in movements minus sum of all stock_out movements
- is_low_stock = current_quantity <= reorder_threshold

Stock Deduction rules (FR-3):
- Deduction occurs when a Job Order status changes to "approved" via deductStockForJobOrder()
- Matches catalog "product" items to inventory items by name (ilike) in the same branch
- If insufficient stock, approval is blocked with 400 error
- Every deduction creates a stock_movement record with reference_type = "job_order"
- Reversible: cancellation of approved orders restores stock via restoreStockForJobOrder()

Inventory Adjustment rules:
- Only HM and POC can perform adjustments
- adjustment_type: increase | decrease
- quantity: minimum 1
- reason: required (trimmed)
- Cannot reduce stock below zero (validated against computed on-hand quantity)
- Every adjustment creates a stock_movement record with reference_type = "adjustment"

Direct Stock-In rules:
- HM, POC, JS can record stock-in
- quantity: minimum 1
- reason: optional (defaults to "Stock received")
- Creates a stock_movement record with reference_type = "purchase_order"

Low-Stock Visibility rules (FR-4):
- Low-stock count is displayed in the Inventory page stats cards
- Warning triggers when current_quantity falls below reorder_threshold
- Low-stock endpoint (/low-stock) accessible by all roles (HM, POC, JS, R, T)
- Only branch-visible data allowed

Stock Movement record fields:
- inventory_item_id
- movement_type (stock_in | stock_out)
- quantity
- reference_type (purchase_order | job_order | adjustment)
- reference_id
- reason
- branch_id
- created_by
- created_at

Category presets:
- Oil & Lubricants, Filters, Brake Parts, Engine Parts, Tires, Batteries, Accessories, Cleaning Supplies, Other

Unit of measure options:
- pcs, liters, kg, bottles, sets, rolls, boxes

User Stories:
As a HM, POC, or JS, I want to add inventory items so parts and supplies can be tracked accurately.
As a HM, POC, or JS, I want to view inventory levels to monitor stock availability.
As a HM, POC, or JS, I want to update inventory details to reflect stock changes and adjustments.
As a HM, POC, or JS, I want to delete inventory items that are obsolete or invalid.
As a POC, JS, or R, I want inventory to deduct automatically when products are used in approved job orders.
As a HM or POC, I want the system to block approval if stock is insufficient.
As a HM or POC, I want to see low-stock indicators on the Inventory page.
As a HM, POC, JS, R, or T, I want to see current stock levels so I know product availability.

Acceptance Criteria:
- Inventory item is added with 100% mandatory fields validated and a unique SKU per branch assigned
- Inventory list loads with computed on-hand quantities from the movement ledger
- Inventory updates are reflected immediately in the item details
- Deleted inventory items are soft-deleted (status set to "inactive") and excluded from active transactions
- Stock levels are computed from the movement ledger, never hard-coded quantities
- SKU uniqueness is enforced per branch
- Soft delete only (set status to "inactive")
- All actions are audit-logged via log_admin_action RPC
- No negative stock allowed
- Adjustment and stock-in operations are database-atomic

Tasks:
1. Design inventory_items and stock_movements schemas with constraints
2. Implement backend CRUD APIs for inventory items with validation
3. Implement on-hand quantity computation from movement ledger (getOnHandQuantities)
4. Implement stock deduction logic (deductStockForJobOrder) integrated into JO approval endpoint
5. Implement stock restoration logic (restoreStockForJobOrder) for cancelled approved orders
6. Implement manual inventory adjustment endpoint (HM, POC only)
7. Implement direct stock-in endpoint (HM, POC, JS)
8. Implement low-stock endpoint for all roles
9. Apply Supabase RLS policies for branch isolation
10. Build Inventory Management page with stats cards (All Items, Active, Low Stock)
11. Add Inventory sidebar item after Catalog
12. Audit log all mutations
13. Maintain consistent styling and use available modal components
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
5. Submit purchase orders for processing
6. Receive purchase orders and record stock-in
7. Cancel purchase orders

RBAC (from UC49–UC52 and Roles & Permissions matrix):
- Create / View / Update / Delete / Submit / Receive / Cancel Purchase Orders: HM, POC, JS, R

FR-6 Description:
"The system shall allow for managing (creating, updating, reading, deleting) Purchase Orders (POs), including the creation of templates for inventory replenishment, directly linked to real-time inventory monitoring, and deletion of specific order steps if necessary."

Mandatory fields (Purchase Order):
- branch_id
- order_date
- items (non-empty array)

Optional fields:
- po_number (auto-generated by database trigger if left empty)
- supplier_name (text field)
- expected_delivery_date
- notes

Purchase Order Item fields:
- inventory_item_id (required)
- quantity_ordered (minimum 1)
- unit_cost (minimum 0)
- quantity_received (updated on receive)

Status lifecycle:
- draft -> submitted (via submit endpoint)
- submitted -> received (via receive endpoint, triggers stock-in)
- draft | submitted -> cancelled (via cancel endpoint)
- No "approved" status — POs go directly from submitted to received

Rules:
- POs always start as "draft" on creation
- Only "draft" or "submitted" POs can be edited
- Cannot delete received POs (returns 400 error)
- Soft delete: sets is_deleted = true AND status = "cancelled"
- All list and get queries filter by is_deleted = false
- Items are full-replacement on update (existing items deleted, new items inserted)
- total_amount is auto-computed from items (quantity_ordered × unit_cost)
- All mutations are audit-logged via log_admin_action RPC

Stock-In rules (on receive):
- When PATCH /:id/receive is called:
  1. Validates PO status is "submitted"
  2. For each purchase_order_item, calculates qtyToReceive = quantity_ordered - quantity_received
  3. If qtyToReceive > 0, inserts a stock_movements record: movement_type = "stock_in", reference_type = "purchase_order", reference_id = PO ID
  4. Updates quantity_received = quantity_ordered on the PO item
  5. Sets PO status to "received" with received_at and received_by
- Stock-in is recorded atomically per PO item
- Race conditions prevented via database transactions

User Stories:
As a HM, POC, JS, or R, I want to create a purchase order so inventory items can be procured.
As a HM, POC, JS, or R, I want to view purchase orders for tracking and reference.
As a HM, POC, JS, or R, I want to update purchase orders to keep inventory records current.
As a HM, POC, JS, or R, I want to delete purchase orders to remove invalid or cancelled entries.

Acceptance Criteria:
- Purchase order is saved with 100% mandatory field validation enforced
- Purchase order details load with 100% data accuracy including items
- Updates are applied only to draft or submitted POs
- Deleted purchase orders are soft-deleted and excluded from active queries
- Received POs cannot be deleted
- Stock-in is recorded atomically per PO item on receive
- All actions are audit-logged via log_admin_action RPC

Tasks:
1. Design purchase_orders and purchase_order_items schemas with is_deleted flag
2. Implement auto-generated po_number via database trigger
3. Implement backend CRUD APIs with status-based edit restrictions
4. Implement submit endpoint (draft -> submitted)
5. Implement receive endpoint (submitted -> received) with stock-in recording
6. Implement cancel endpoint (draft/submitted -> cancelled)
7. Implement soft delete with received-PO protection
8. Create stock_movement records for each stock-in event
9. Apply Supabase RLS policies for branch isolation
10. Build Purchase Orders management page with stats cards (Total, Submitted, Received) and status filter
11. Add Purchase Orders sidebar item under Inventory section
12. Audit log all mutations
13. Maintain consistent styling and use available modal components
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
4. Build Supplier Management page (grid card style consistent with other management pages[use Branch Management as the reference, exact layout styling and implementation])
5. Add Supplier sidebar item under Purchase Orders section
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
