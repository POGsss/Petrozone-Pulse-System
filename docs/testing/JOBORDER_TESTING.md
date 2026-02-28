# Job Order Management — Testing Guide & Process Documentation

---

## How Job Order Management Works in the System

### Overview

The Job Order (JO) module is the central workflow in the system. It manages service requests tied to a customer vehicle, tracking catalog items with vehicle-class-based pricing, inventory consumption, third-party repairs (TPR), and a multi-step approval workflow. When a JO is approved, the system automatically deducts stock from inventory based on the inventory template snapshots captured during JO creation. The module supports full CRUD for both JO items and third-party repairs, with conditional hard/soft delete logic depending on the JO's lifecycle stage.

### Key Business Rules

1. **Vehicle class pricing** — each JO has a `vehicle_class` (light / heavy / extra\_heavy). When a catalog item is added, the system resolves its pricing matrix and selects the price column matching the vehicle class (e.g., `light_price`, `heavy_price`, or `extra_heavy_price`).
2. **Pricing formula** — `line_total = (labor_price + inventory_cost) × quantity`, where:
   - `labor_price` = the vehicle-class-specific price from the pricing matrix (0 if no active pricing exists)
   - `inventory_cost` = `Σ(unit_cost × quantity_per_unit)` for all linked inventory items on that catalog item
3. **Inventory snapshots** — when a catalog item is added to a JO, the system fetches its inventory template (from `catalog_inventory_links`) and creates `job_order_item_inventories` snapshots. Each snapshot records `inventory_item_id`, `inventory_item_name`, `quantity_per_unit`, and `unit_cost` at the time of creation.
4. **Editable inventory quantities** — during JO item creation and editing, users can modify `quantity_per_unit` for each inventory snapshot, which recalculates the `inventory_cost` and `line_total`.
5. **Stock deduction on approval** — when a JO is approved, the system aggregates inventory quantities across all JO items and creates `stock_out` movements. If any item has insufficient stock, approval fails with an error.
6. **Stock restoration on cancel** — cancelling an approved JO creates `stock_in` movements to reverse the earlier deductions.
7. **Branch-scoped** — HM sees all JOs; other roles see only JOs from their assigned branches.
8. **Cascading lookups** — Branch → Customer (filtered by branch) → Vehicle (filtered by customer).
9. **Conditional delete** — `created` status → hard delete (cascades items, inventories, repairs); other statuses → soft delete (`is_deleted: true`).

### Status Flow

```
created → pending (request-approval)
pending → approved (record-approval)
pending → rejected (record-approval)
created/rejected → pending (re-request-approval)
created/pending/rejected/approved → cancelled
```

### RBAC (Roles & Permissions)

| Action                     | HM  | POC | JS  |  R  |  T  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Job Orders            | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create Job Order           |  —  | ✅  | ✅  | ✅  |  —  |
| Update (Notes only)        |  —  | ✅  | ✅  | ✅  | ✅  |
| Edit Items                 |  —  | ✅  | ✅  | ✅  |  —  |
| Delete Job Order           |  —  | ✅  | ✅  | ✅  |  —  |
| Request Approval           |  —  | ✅  | ✅  | ✅  | ✅  |
| Record Approval            |  —  |  —  |  —  | ✅  | ✅  |
| Cancel Job Order           |  —  | ✅  | ✅  | ✅  |  —  |
| Manage Third-Party Repairs | ✅  | ✅  | ✅  | ✅  | ✅  |

> **Note:** HM can view all JOs but cannot create, edit items, delete, or cancel. T can update notes, request/record approvals, and manage TPR, but cannot create, edit items, or delete.

### API Endpoints

| Method   | Endpoint                                    | Description                                  |
| -------- | ------------------------------------------- | -------------------------------------------- |
| `GET`    | `/api/job-orders`                           | List JOs (filtered, paginated, branch-scoped)|
| `GET`    | `/api/job-orders/:id`                       | Get single JO with items, customer, vehicle  |
| `POST`   | `/api/job-orders`                           | Create JO with items + inventory snapshots   |
| `PUT`    | `/api/job-orders/:id`                       | Update JO (notes only)                       |
| `DELETE` | `/api/job-orders/:id`                       | Hard/soft delete based on status             |
| `PATCH`  | `/api/job-orders/:id/request-approval`      | Move to pending                              |
| `PATCH`  | `/api/job-orders/:id/record-approval`       | Approve or reject (triggers stock deduction) |
| `PATCH`  | `/api/job-orders/:id/cancel`                | Cancel (restores stock if was approved)       |
| `POST`   | `/api/job-orders/:id/items`                 | Add item to editable JO                      |
| `PUT`    | `/api/job-orders/:id/items/:itemId`         | Update item quantity                         |
| `DELETE` | `/api/job-orders/:id/items/:itemId`         | Remove item (min 1 must remain)              |
| `GET`    | `/api/job-orders/:id/history`               | Get JO history/audit trail                   |
| `GET`    | `/api/third-party-repairs?job_order_id=...` | List repairs for a JO                        |
| `POST`   | `/api/third-party-repairs`                  | Create repair                                |
| `PUT`    | `/api/third-party-repairs/:id`              | Update repair                                |
| `DELETE` | `/api/third-party-repairs/:id`              | Delete repair                                |

---

## Sample Data to Populate

### Pre-requisites Before Creating JOs

Ensure the following exist:
- **Branches** (see `BRANCH_TESTING.md`)
- **Customers** linked to branches (see `CUSTOMER_TESTING.md`)
- **Vehicles** linked to customers (see `VEHICLE_TESTING.md`)
- **Catalog items** with inventory links (see `CATALOG_TESTING.md`)
- **Pricing matrices** for catalog items (see `PRICING_TESTING.md`)
- **Inventory items** with sufficient stock (see `INVENTORY_TESTING.md`)

### Sample Job Orders

| #   | Branch          | Customer       | Vehicle         | Vehicle Class | Catalog Items                                   | Notes                         |
| --- | --------------- | -------------- | --------------- | ------------- | ----------------------------------------------- | ----------------------------- |
| 1   | Main Branch     | Juan Dela Cruz | ABC-1234 Sedan  | Light         | Oil Change Service (×1), Air Filter Repl. (×1)  | Routine maintenance request   |
| 2   | Main Branch     | Maria Santos   | XYZ-5678 SUV    | Heavy         | Brake Pad Replacement (×2)                      | Squeaking brakes complaint    |
| 3   | Secondary Branch| Pedro Reyes    | DEF-9012 Truck  | Extra Heavy   | Engine Tune-Up Package (×1)                     | Engine performance issue      |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- Logged in as **POC**, **JS**, or **R** (for create/edit)
- All dependency data populated (branches, customers, vehicles, catalog, pricing, inventory)

---

### Test 1 — View Job Orders

**Goal:** Verify the JO list loads correctly.

1. Navigate to **Job Orders** from the sidebar
2. Verify the header shows **"Job Orders"** with a count subtitle (e.g., `"{n} orders"`)
3. Verify items display as cards showing:
   - ✅ Order number (e.g., `JO-20250101-001`)
   - ✅ Status badge (Created / Pending / Approved / Rejected / Cancelled)
   - ✅ Customer name
   - ✅ Vehicle info (plate number)
   - ✅ Branch name
   - ✅ Vehicle class badge
   - ✅ Total amount (₱ formatted)
   - ✅ Action buttons appropriate to status and role
4. Verify pagination: **12 items per page**

---

### Test 2 — Create Job Order (Full Flow with Pricing Resolution)

**Goal:** Verify the complete JO creation flow including cascading lookups, pricing resolution, and inventory template.

1. Log in as **POC**, **JS**, or **R**
2. Click **"Create Job Order"** → the **"Create Job Order"** modal opens
3. **Step 1 — Order Details:**
   - Select a **Branch** from dropdown (HM sees all, others see assigned branches)
   - Select a **Customer** from dropdown (filtered by selected branch)
   - Select a **Vehicle** from dropdown (filtered by selected customer)
   - Select **Vehicle Class**: `Light` / `Heavy` / `Extra Heavy`
   - Enter **Notes** (optional)
4. **Step 2 — Add Catalog Items:**
   - Select a catalog item from the dropdown (shows active items)
   - Pricing is resolved automatically via API (`pricingApi.resolve`)
   - Verify:
     - ✅ **Labor price** populated from the pricing matrix column matching vehicle class
     - ✅ If no active pricing exists: labor price = 0, warning toast shown
     - ✅ **Inventory items** loaded from catalog template (from `catalog_inventory_links`)
     - ✅ Each inventory item shows: name, unit cost, quantity (editable, default = 1)
     - ✅ **Inventory cost** = sum of (unit\_cost × quantity) across all linked inventory items
     - ✅ **Line total** = (labor\_price + inventory\_cost) × quantity
   - Add the item to the draft list
   - Repeat for additional items
5. **Step 3 — Third-Party Repairs (optional):**
   - Click "Add Repair" to add a third-party repair:
     - Provider Name, Description, Cost (₱), Repair Date
   - Repairs appear in a list below
6. **Review the draft:**
   - ✅ Each item row shows: catalog item name, quantity, labor price, inventory cost, line total
   - ✅ Expanding an item row shows inventory detail sub-rows
   - ✅ Grand total is calculated correctly
7. Click **"Create Job Order"**
8. Verify:
   - ✅ Toast: success message
   - ✅ New JO card appears in the list with status `Created`
   - ✅ Order number is auto-generated

**Pricing calculation example (Oil Change Service, Light vehicle, qty=1):**
- Light price from pricing matrix: ₱500
- Inventory: Shell Helix 5W-40 (₱650 × 1) + Denso Oil Filter (₱280 × 1) = ₱930
- Line total: (500 + 930) × 1 = **₱1,430**

---

### Test 3 — View Job Order Details

**Goal:** Verify the detail view shows complete JO information.

1. Click on a JO card to open the **View modal**
2. Verify the modal shows:
   - ✅ **Order #** and status badge
   - ✅ **Customer** name
   - ✅ **Vehicle** (plate number, type)
   - ✅ **Branch** name
   - ✅ **Vehicle Class** badge
   - ✅ **Notes**
   - ✅ **Items list**:
     - For each item: catalog item name, quantity, labor price (₱), inventory cost (₱), line total (₱)
     - Expandable inventory sub-rows: inventory item name, qty per unit, unit cost
   - ✅ **Third-Party Repairs** section (if any)
   - ✅ **History timeline** (status changes, user actions)
   - ✅ **Timestamps** (created, updated)
   - ✅ **Total amount** (sum of all line totals)

---

### Test 4 — Edit Job Order (Notes + Items)

**Goal:** Verify JO editing for editable statuses.

**Part A — Notes editing (any editable status):**

1. Click Edit on a JO with status `Created` or `Rejected`
2. Verify the **Edit modal** opens
3. Modify the **Notes** field
4. Click **"Save Changes"**
5. Verify toast: update success

**Part B — Item editing (created/rejected only, by POC/JS/R):**

1. Open Edit on a `Created` JO
2. **Modify item quantity:**
   - Change quantity of an existing item
   - Verify line total recalculates: `(labor_price + inventory_cost) × new_quantity`
3. **Remove an item:**
   - Click remove on an item
   - Verify the item is deleted (API call)
   - ✅ Cannot remove the last item — at least 1 must remain
4. **Add a new item:**
   - Select a new catalog item from dropdown
   - Pricing resolves, inventory loads
   - Add to the JO
   - Verify it appears in the items list
5. **Modify inventory quantities on a draft item:**
   - Change `quantity_per_unit` for an inventory sub-item
   - Verify `inventory_cost` and `line_total` update accordingly

---

### Test 5 — Request Approval

**Goal:** Verify a JO can transition from created/rejected to pending.

1. Find a JO with status `Created`
2. Click the **"Request Approval"** action
3. Verify:
   - ✅ Status changes to `Pending`
   - ✅ Toast: approval request success
   - ✅ History entry is added

---

### Test 6 — Record Approval (Approve)

**Goal:** Verify approval triggers stock deduction.

**Pre-requisite:** Ensure sufficient inventory stock for all items in the JO.

1. Log in as **R** or **T** (roles with `canApproval`)
2. Find a `Pending` JO
3. Click the **"Approve"** action
4. Verify:
   - ✅ Status changes to `Approved`
   - ✅ Toast: approval success
   - ✅ `approved_at` timestamp is set
5. Navigate to **Inventory** → check the relevant items:
   - ✅ Stock quantities decreased by the amounts from the JO item inventories
   - ✅ New `stock_out` movement entries with `reference_type: "job_order"` and `reference_id` = JO ID

**Insufficient stock test:**

1. Create a JO with inventory items that exceed available stock
2. Request and try to approve
3. Verify:
   - ✅ Error toast: `"Insufficient stock for {item_name}: need {X} but only {Y} available"`
   - ✅ JO remains `Pending` — approval is blocked

---

### Test 7 — Record Approval (Reject)

**Goal:** Verify rejection workflow.

1. Log in as **R** or **T**
2. Find a `Pending` JO
3. Click the **"Reject"** action
4. Verify:
   - ✅ Status changes to `Rejected`
   - ✅ Toast: rejection message
   - ✅ Items become editable again (for POC/JS/R)
   - ✅ JO can be re-submitted for approval

---

### Test 8 — Cancel Job Order

**Goal:** Verify cancellation and stock restoration for approved JOs.

**Part A — Cancel a non-approved JO:**

1. Find a JO with status `Created`, `Pending`, or `Rejected`
2. Click **"Cancel"**
3. Confirm
4. Verify:
   - ✅ Status changes to `Cancelled`
   - ✅ No stock changes (no stock was deducted)

**Part B — Cancel an approved JO (stock restoration):**

1. Find a JO with status `Approved`
2. Click **"Cancel"**
3. Confirm
4. Verify:
   - ✅ Status changes to `Cancelled`
   - ✅ Navigate to Inventory → stock quantities are restored
   - ✅ New `stock_in` movement entries with reason: `"Stock restored — Job Order cancelled"`

---

### Test 9 — Delete Job Order

**Goal:** Verify conditional delete behavior.

**Part A — Hard delete (status = created):**

1. Find a JO with status `Created`
2. Click **Delete**
3. Confirm
4. Verify:
   - ✅ JO is permanently removed (not found in list even with filters)
   - ✅ Related items, inventory snapshots, and repairs are also deleted (cascade)

**Part B — Soft delete (other statuses):**

1. Find a JO with status `Pending`, `Approved`, `Rejected`, or `Cancelled`
2. Click **Delete**
3. Confirm
4. Verify:
   - ✅ JO disappears from the list (is_deleted = true)
   - ✅ Record still exists in database (soft deleted)

---

### Test 10 — Third-Party Repairs

**Goal:** Verify TPR CRUD within a job order.

1. Open the **Third-Party Repair** action (wrench icon) on a JO
2. **Add a repair:**
   - Provider Name: `AutoGlass Shop`
   - Description: `Windshield replacement`
   - Cost: `5000`
   - Repair Date: _(today)_
   - Click "Add" / "Save"
   - ✅ Toast: success
   - ✅ Repair appears in the list
   - ✅ Repairs total displayed at the bottom
3. **Edit a repair:**
   - Click edit on an existing repair
   - Modify the cost
   - Save → toast: update success
4. **Delete a repair:**
   - Click delete on a repair
   - Confirm → repair is removed

---

### Test 11 — Cascading Lookups (Branch → Customer → Vehicle)

**Goal:** Verify dropdown filtering in the create modal.

1. Open the Create JO modal
2. Select a **Branch** → Customer dropdown populates with only that branch's customers
3. Select a **Customer** → Vehicle dropdown populates with only that customer's vehicles
4. Change the **Branch** → Customer and Vehicle selections reset
5. Change the **Customer** → Vehicle selection resets

---

### Test 12 — Vehicle Class Selection & Price Update

**Goal:** Verify changing vehicle class updates pricing.

1. In the Create JO modal:
   - Add a catalog item (pricing resolves for current vehicle class)
   - Note the labor price
2. Change the **Vehicle Class** (e.g., from Light to Heavy)
3. Verify:
   - ✅ The labor price updates to the new vehicle class column
   - ✅ Line total recalculates accordingly
   - ✅ If switching to a class where no pricing exists for an item → labor = 0, warning shown

---

### Test 13 — Search and Filter

**Goal:** Verify filter controls.

1. **Search** by order number, customer name, or vehicle plate → matching results shown
2. **Filter by status**: Created / Pending / Approved / Rejected / Cancelled
3. **Filter by branch** (if HM or multi-branch user)
4. Combine search + filters → verify correct results
5. Clear all → full list restored

---

### Test 14 — RBAC Enforcement

**Goal:** Verify role-based access controls.

1. **Log in as HM:**
   - ✅ Can view all JOs across all branches
   - ✅ **No** Create button
   - ✅ **No** Delete button
   - ✅ Can manage third-party repairs
2. **Log in as T (Technician):**
   - ✅ Can view JOs from assigned branches
   - ✅ **No** Create button
   - ✅ **No** Delete button
   - ✅ Can request approval, record approval
   - ✅ Can update notes
   - ✅ Can manage third-party repairs
   - ✅ Cannot edit items
3. **Log in as POC / JS:**
   - ✅ Full access: create, edit, delete, request approval, cancel
   - ✅ Cannot record approval (approve/reject)
4. **Log in as R:**
   - ✅ Can create, edit items, delete, request approval, cancel
   - ✅ Can record approval (approve/reject)

---

### Test 15 — History Timeline

**Goal:** Verify order history tracking.

1. Create a JO → request approval → approve → view
2. Open the View modal → scroll to **History** section
3. Verify history entries:
   - ✅ Creation event
   - ✅ Status change to Pending
   - ✅ Status change to Approved
   - ✅ Each entry shows user, action, timestamp

---

### Test 16 — Audit Logging

**Goal:** Verify JO operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Job order creation
   - ✅ Status transitions
   - ✅ Item additions/removals
   - ✅ Deletions

---

## Summary Checklist

| Requirement                                           | Status |
| ----------------------------------------------------- | ------ |
| View Job Orders (Cards)                               | ⬜     |
| Create JO with Cascading Lookups                      | ⬜     |
| Vehicle Class Selection (light/heavy/extra_heavy)     | ⬜     |
| Pricing Resolution (labor from pricing matrix)        | ⬜     |
| Inventory Template Loading (from catalog links)       | ⬜     |
| Editable Inventory Quantities per Item                | ⬜     |
| Pricing Formula: (labor + inv_cost) × qty             | ⬜     |
| Inventory Snapshots (job_order_item_inventories)      | ⬜     |
| View JO Details (Items, Inventory, TPR, History)      | ⬜     |
| Edit Notes                                            | ⬜     |
| Edit Items (Add/Remove/Quantity — created/rejected)   | ⬜     |
| Request Approval (created/rejected → pending)         | ⬜     |
| Record Approval — Approve (stock deduction)           | ⬜     |
| Record Approval — Reject                              | ⬜     |
| Cancel (stock restoration for approved)               | ⬜     |
| Hard Delete (created status)                          | ⬜     |
| Soft Delete (other statuses)                          | ⬜     |
| Third-Party Repairs CRUD                              | ⬜     |
| Cascading Lookups (Branch → Customer → Vehicle)       | ⬜     |
| Search and Filter                                     | ⬜     |
| Pagination (12 per page)                              | ⬜     |
| RBAC per Role                                         | ⬜     |
| History Timeline                                      | ⬜     |
| Audit Logging                                         | ⬜     |
| Insufficient Stock Blocks Approval                    | ⬜     |
