# Job Order Management — Testing Guide & Process Documentation

---

## How Job Order Management Works in the System

### Overview

The Job Order (JO) module is the central workflow in the system. It manages service requests tied to a customer vehicle, tracking Package items with vehicle-class-based pricing, inventory consumption, third-party repairs (TPR), and a multi-step lifecycle workflow. When a JO is approved, the system automatically deducts stock from inventory based on the inventory template snapshots captured during JO creation. The module supports full CRUD for both JO items and third-party repairs, with conditional hard/soft delete logic depending on the JO's lifecycle stage.

### Key Business Rules

1. **Vehicle class pricing** — each JO has a `vehicle_class` (light / heavy / extra\_heavy) that is **automatically populated from the selected vehicle's `vehicle_class` field**. When a Package item is added, the system resolves its pricing matrix and selects the price column matching the vehicle class (e.g., `light_price`, `heavy_price`, or `extra_heavy_price`). The vehicle class is set on the vehicle record itself (via the Vehicle Management page) and cannot be manually overridden during JO creation.
2. **Pricing formula** — `line_total = (labor_price + inventory_cost) × quantity`, where:
   - `labor_price` = the vehicle-class-specific price from the pricing matrix (0 if no active pricing exists)
   - `inventory_cost` = `Σ(unit_cost × quantity_per_unit)` for all linked inventory items on that Package item
3. **Inventory snapshots** — when a Package item is added to a JO, the system fetches its inventory template (from `package_inventory_links`) and creates `job_order_item_inventories` snapshots. Each snapshot records `inventory_item_id`, `inventory_item_name`, `quantity_per_unit`, and `unit_cost` at the time of creation.
4. **Editable inventory quantities** — during JO item creation and editing (only in `draft` status), users can modify `quantity_per_unit` for each inventory snapshot, which recalculates the `inventory_cost` and `line_total`.
5. **Stock deduction on approval** — when a JO is approved, the system aggregates inventory quantities across all JO items and creates `stock_out` movements. If any item has insufficient stock, approval fails with an error.
6. **Immutability** — once a JO moves past `draft` status, its notes and items are frozen and cannot be modified.
7. **Branch-scoped** — HM sees all JOs; other roles see only JOs from their assigned branches.
8. **Cascading lookups** — Branch → Customer (filtered by branch) → Vehicle (filtered by customer). When a vehicle is selected, the vehicle class is automatically populated from the vehicle record.
9. **Conditional delete** — `draft` status → hard delete (cascades items, inventories, repairs); other statuses → soft delete (`is_deleted: true`, `deleted_at`, `deleted_by`).
10. **Cancellation requires reason** — cancelling a JO requires a `cancellation_reason` field.
11. **Rejection requires reason** — rejecting a JO requires a `rejection_reason` field.
12. **Timestamp coherence** — `approval_requested_at ≤ approved_at ≤ start_time ≤ completion_time`.

### Status Flow (Lifecycle)

```
draft → pending_approval      (request-approval)
pending_approval → approved   (record-approval: approve)
pending_approval → rejected   (record-approval: reject, terminal)
approved → in_progress        (start-work)
in_progress → ready_for_release (mark-ready)
ready_for_release → completed (complete)

draft → cancelled             (cancel)
pending_approval → cancelled  (cancel)
```

**Terminal statuses:** `rejected`, `cancelled`, `completed` — no further transitions allowed.

### RBAC (Roles & Permissions)

| Action                      | HM  | POC | JS  |  R  |  T  |
| --------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Job Orders             | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create Job Order            |  —  | ✅  | ✅  | ✅  |  —  |
| Update Notes (draft only)   |  —  | ✅  | ✅  | ✅  | ✅  |
| Edit Items (draft only)     |  —  | ✅  | ✅  | ✅  |  —  |
| Delete Job Order            |  —  | ✅  | ✅  | ✅  |  —  |
| Request Approval            |  —  |  —  |  —  | ✅  | ✅  |
| Record Approval             |  —  |  —  |  —  | ✅  | ✅  |
| Cancel (draft)              |  —  | ✅  | ✅  | ✅  |  —  |
| Cancel (pending_approval)   |  —  | ✅  |  —  | ✅  |  —  |
| Start Work                  |  —  |  —  |  —  |  —  | ✅  |
| Mark Ready                  |  —  | ✅  |  —  |  —  | ✅  |
| Complete                    | ✅  | ✅  |  —  |  —  |  —  |
| Manage Third-Party Repairs  | ✅  | ✅  | ✅  | ✅  | ✅  |

### API Endpoints

| Method   | Endpoint                                    | Description                                      |
| -------- | ------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/job-orders`                           | List JOs (filtered, paginated, branch-scoped)    |
| `GET`    | `/api/job-orders/:id`                       | Get single JO with items, customer, vehicle      |
| `POST`   | `/api/job-orders`                           | Create JO with items + inventory snapshots        |
| `PUT`    | `/api/job-orders/:id`                       | Update JO (notes only, draft status only)        |
| `DELETE` | `/api/job-orders/:id`                       | Hard/soft delete based on status                 |
| `PATCH`  | `/api/job-orders/:id/request-approval`      | draft → pending_approval                         |
| `PATCH`  | `/api/job-orders/:id/record-approval`       | pending_approval → approved or rejected          |
| `PATCH`  | `/api/job-orders/:id/cancel`                | draft/pending_approval → cancelled               |
| `PATCH`  | `/api/job-orders/:id/start-work`            | approved → in_progress (T only)                  |
| `PATCH`  | `/api/job-orders/:id/mark-ready`            | in_progress → ready_for_release (T, POC)         |
| `PATCH`  | `/api/job-orders/:id/complete`              | ready_for_release → completed (HM, POC)          |
| `POST`   | `/api/job-orders/:id/items`                 | Add item to draft JO                             |
| `PUT`    | `/api/job-orders/:id/items/:itemId`         | Update item quantity (draft only)                |
| `DELETE` | `/api/job-orders/:id/items/:itemId`         | Remove item (min 1 must remain, draft only)      |
| `GET`    | `/api/job-orders/:id/history`               | Get JO history/audit trail                       |
| `GET`    | `/api/third-party-repairs?job_order_id=...` | List repairs for a JO                            |
| `POST`   | `/api/third-party-repairs`                  | Create repair                                    |
| `PUT`    | `/api/third-party-repairs/:id`              | Update repair                                    |
| `DELETE` | `/api/third-party-repairs/:id`              | Delete repair                                    |

### New Database Columns

| Column                   | Type        | Description                                    |
| ------------------------ | ----------- | ---------------------------------------------- |
| `start_time`             | timestamptz | When work begins (approved → in_progress)      |
| `completion_time`        | timestamptz | When work is formally closed                   |
| `approval_requested_at`  | timestamptz | When approval was first requested              |
| `assigned_technician_id` | uuid (FK)   | The technician assigned to this JO             |
| `cancellation_reason`    | text        | Required reason when cancelling                |
| `rejection_reason`       | text        | Required reason when rejecting                 |
| `cancelled_at`           | timestamptz | Timestamp of cancellation                      |
| `cancelled_by`           | uuid (FK)   | Who cancelled                                  |
| `deleted_at`             | timestamptz | Timestamp of soft delete                       |
| `deleted_by`             | uuid (FK)   | Who soft-deleted                               |
| `approval_status`        | text        | REQUESTED / APPROVED / REJECTED                |
| `approval_method`        | text        | How approval was obtained (SMS, CALL, etc.)    |

---

## Sample Data to Populate

### Pre-requisites Before Creating JOs

Ensure the following exist:
- **Branches** (see `BRANCH_TESTING.md`)
- **Customers** linked to branches (see `CUSTOMER_TESTING.md`)
- **Vehicles** linked to customers (see `VEHICLE_TESTING.md`)
- **Package items** with inventory links (see `PACKAGES_TESTING.md`)
- **Pricing matrices** for Package items (see `PRICING_TESTING.md`)
- **Inventory items** with sufficient stock (see `INVENTORY_TESTING.md`)

### Sample Job Orders

| #   | Branch          | Customer       | Vehicle         | Vehicle Class | Package Items                                   | Notes                         |
| --- | --------------- | -------------- | --------------- | ------------- | ----------------------------------------------- | ----------------------------- |
| 1   | Main Branch     | Juan Dela Cruz | ABC-1234 Sedan  | Light         | Oil Change Service (×1), Air Filter Repl. (×1)  | Routine maintenance request   |
| 2   | Main Branch     | Maria Santos   | XYZ-5678 SUV    | Heavy         | Brake Pad Replacement (×2)                      | Squeaking brakes complaint    |
| 3   | Secondary Branch| Pedro Reyes    | DEF-9012 Truck  | Extra Heavy   | Engine Tune-Up Package (×1)                     | Engine performance issue      |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- Logged in as the appropriate role for each test
- All dependency data populated (branches, customers, vehicles, Package, pricing, inventory)

---

### Test 1 — View Job Orders

**Goal:** Verify the JO list loads correctly.

1. Navigate to **Job Orders** from the sidebar
2. Verify the header shows **"Job Orders"** with a count subtitle (e.g., `"{n} orders"`)
3. Verify items display as cards showing:
   - ✅ Order number (e.g., `JO-20250101-001`)
   - ✅ Status badge (Draft / Pending Approval / Approved / In Progress / Ready for Release / Completed / Rejected / Cancelled)
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
   - ✅ **Vehicle Class** is **automatically populated** from the selected vehicle (read-only, displayed as disabled text field)
   - Enter **Notes** (optional)
4. **Step 2 — Add Package Items:**
   - Select a Package item from the dropdown (shows active items)
   - Pricing is resolved automatically via API (`pricingApi.resolve`)
   - Verify:
     - ✅ **Labor price** populated from the pricing matrix column matching vehicle class
     - ✅ If no active pricing exists: labor price = 0, warning toast shown
     - ✅ **Inventory items** loaded from Package template (from `package_inventory_links`)
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
   - ✅ Each item row shows: Package item name, quantity, labor price, inventory cost, line total
   - ✅ Expanding an item row shows inventory detail sub-rows
   - ✅ Grand total is calculated correctly
7. Click **"Create Job Order"**
8. Verify:
   - ✅ Toast: success message
   - ✅ New JO card appears in the list with status **`Draft`**
   - ✅ Order number is auto-generated
   - ✅ Audit log entry: `JO_CREATED`

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
     - For each item: Package item name, quantity, labor price (₱), inventory cost (₱), line total (₱)
     - Expandable inventory sub-rows: inventory item name, qty per unit, unit cost
   - ✅ **Third-Party Repairs** section (if any)
   - ✅ **History timeline** (status changes, user actions)
   - ✅ **Timestamps** (created, updated)
   - ✅ **Total amount** (sum of all line totals)

---

### Test 4 — Edit Job Order (Notes + Items — Draft Only)

**Goal:** Verify JO editing is restricted to `draft` status only (immutability enforcement).

**Part A — Notes editing (draft status only):**

1. Click Edit on a JO with status `Draft`
2. Verify the **Edit modal** opens
3. Modify the **Notes** field
4. Click **"Save Changes"**
5. Verify toast: update success
6. Verify audit log entry: `JO_UPDATED`

**Part B — Item editing (draft status only, by POC/JS/R):**

1. Open Edit on a `Draft` JO
2. **Modify item quantity:**
   - Change quantity of an existing item
   - Verify line total recalculates: `(labor_price + inventory_cost) × new_quantity`
3. **Remove an item:**
   - Click remove on an item
   - Verify the item is deleted (API call)
   - ✅ Cannot remove the last item — at least 1 must remain
4. **Add a new item:**
   - Select a new Package item from dropdown
   - Pricing resolves, inventory loads
   - Add to the JO
   - Verify it appears in the items list
5. **Modify inventory quantities on a draft item:**
   - Change `quantity_per_unit` for an inventory sub-item
   - Verify `inventory_cost` and `line_total` update accordingly

**Part C — Immutability enforcement:**

1. Try to edit notes on a JO with status **other than `Draft`** (e.g., `Approved`, `In Progress`)
2. Verify:
   - ✅ Error: `Cannot update a job order with status "approved". Only draft orders can be edited.`
3. Try to add/remove/update items on a non-draft JO
4. Verify:
   - ✅ Error: `Cannot modify items on a job order with status "approved".`

---

### Test 5 — Request Approval

**Goal:** Verify a JO can transition from `draft` → `pending_approval`.

**Preconditions checked by backend:**
- ✅ JO must have ≥ 1 line item
- ✅ `total_amount` > 0
- ✅ No line items with zero price (labor_price + inventory_cost > 0)
- ✅ Only **R** and **T** roles can request approval

1. Log in as **R** or **T**
2. Find a JO with status `Draft`
3. Open the **More** (⋮) dropdown → click **"Customer Approval"**
4. Click **"Request"**
5. Verify:
   - ✅ Status changes to `Pending Approval`
   - ✅ Toast: "Approval requested — status changed to Pending Approval"
   - ✅ `approval_requested_at` is set
   - ✅ `approval_status` = `REQUESTED`
   - ✅ Audit log entries: `APPROVAL_REQUESTED` + `STATUS_CHANGED`

**Idempotency test:**
1. Try to request approval on a JO that is already `Pending Approval`
2. Verify: ✅ Returns 200 with a message that approval was already requested (no error)

**Precondition failure tests:**
1. Create a JO with no items → try to request approval → ✅ Error: "At least one line item is required"
2. Create a JO with total_amount = 0 → try to request approval → ✅ Error: "Total amount must be greater than 0"

---

### Test 6 — Record Approval (Approve)

**Goal:** Verify approval triggers stock deduction.

**Pre-requisite:** Ensure sufficient inventory stock for all items in the JO.

1. Log in as **R** or **T** (roles with approval permission)
2. Find a `Pending Approval` JO
3. Open **More** (⋮) → **"Customer Approval"** → Click **"Approve"**
4. Verify:
   - ✅ Status changes to `Approved`
   - ✅ Toast: "Customer approved the job order"
   - ✅ `approved_at` timestamp is set
   - ✅ `approval_status` = `APPROVED`
   - ✅ Audit log entries: `APPROVAL_RECORDED` + `STATUS_CHANGED`
5. Navigate to **Inventory** → check the relevant items:
   - ✅ Stock quantities decreased by the amounts from the JO item inventories
   - ✅ New `stock_out` movement entries with `reference_type: "job_order"` and `reference_id` = JO ID

**Timestamp coherence test:**
- ✅ `approved_at` ≥ `approval_requested_at` (enforced by backend)

**Insufficient stock test:**
1. Create a JO with inventory items that exceed available stock
2. Request approval, then try to approve
3. Verify:
   - ✅ Error toast: `"Insufficient stock for {item_name}: need {X} but only {Y} available"`
   - ✅ JO remains `Pending Approval` — approval is blocked

---

### Test 7 — Record Approval (Reject)

**Goal:** Verify rejection workflow.

1. Log in as **R** or **T**
2. Find a `Pending Approval` JO
3. Open **More** (⋮) → **"Customer Approval"** → Click **"Reject"**
4. Verify:
   - ✅ Status changes to `Rejected` (terminal — no further transitions)
   - ✅ Toast: "Customer rejected the job order"
   - ✅ `rejection_reason` is stored (if provided)
   - ✅ `approval_status` = `REJECTED`
   - ✅ Audit log entries: `APPROVAL_RECORDED` + `STATUS_CHANGED`

> **Note:** `Rejected` is now a terminal status. Unlike the previous flow, there is no re-request from rejected. If the customer wants to proceed, a new JO must be created.

---

### Test 8 — Start Work (approved → in_progress)

**Goal:** Verify the technician can start work on an approved JO and is auto-assigned.

1. Log in as **T** (Technician)
2. Find a JO with status `Approved`
3. Open **More** (⋮) → Click **"Start Work"**
4. Verify:
   - ✅ Status changes to `In Progress`
   - ✅ Toast: "Work started — status changed to In Progress"
   - ✅ `start_time` is set
   - ✅ `assigned_technician_id` is automatically set to the logged-in technician’s ID
   - ✅ Timestamp coherence: `start_time` ≥ `approved_at`
   - ✅ Audit log entries: `WORK_STARTED` + `STATUS_CHANGED`

**Role restriction test:**
1. Log in as **POC** → no "Start Work" button visible for approved JOs (T-only)

---

### Test 9 — Mark Ready (in_progress → ready_for_release)

**Goal:** Verify marking a JO as ready for release.

1. Log in as **T** or **POC**
2. Find a JO with status `In Progress`
3. Open **More** (⋮) → Click **"Mark Ready"**
4. Verify:
   - ✅ Status changes to `Ready for Release`
   - ✅ Toast: "Marked ready for release"
   - ✅ Audit log entries: `MARKED_READY` + `STATUS_CHANGED`

**Role restriction test:**
1. Log in as **JS** or **R** → no "Mark Ready" button visible (T and POC only)

---

### Test 10 — Complete (ready_for_release → completed)

**Goal:** Verify completing a JO.

1. Log in as **HM** or **POC**
2. Find a JO with status `Ready for Release`
3. Open **More** (⋮) → Click **"Complete"**
4. Verify:
   - ✅ Status changes to `Completed` (terminal)
   - ✅ Toast: "Job order completed"
   - ✅ `completion_time` is set
   - ✅ Timestamp coherence: `completion_time` ≥ `start_time`
   - ✅ Audit log entries: `JO_COMPLETED` + `STATUS_CHANGED`

**Role restriction test:**
1. Log in as **T**, **JS**, or **R** → no "Complete" button visible (HM and POC only)

---

### Test 11 — Cancel Job Order

**Goal:** Verify cancellation with required reason.

**Part A — Cancel a Draft JO:**

1. Log in as **POC**, **JS**, or **R**
2. Find a JO with status `Draft`
3. Open **More** (⋮) → Click **"Cancel Job Order"**
4. Verify:
   - ✅ Cancel modal opens with a **Cancellation Reason** textarea (required)
   - ✅ "Cancel Order" button is disabled until a reason is entered
5. Enter a reason and click **"Cancel Order"**
6. Verify:
   - ✅ Status changes to `Cancelled`
   - ✅ `cancellation_reason`, `cancelled_at`, `cancelled_by` are set
   - ✅ Audit log entries: `JO_CANCELLED` + `STATUS_CHANGED`

**Part B — Cancel a Pending Approval JO:**

1. Log in as **POC** or **R** (JS cannot cancel pending_approval per spec)
2. Find a JO with status `Pending Approval`
3. Cancel with reason
4. Verify:
   - ✅ Status changes to `Cancelled`
   - ✅ Same fields set as above
   - ✅ No stock restoration needed (stock was never deducted)

**Part C — Cannot cancel approved/in_progress/completed/rejected JOs:**

1. Find JOs in these statuses
2. Verify: ✅ No "Cancel" option in the dropdown menu

---

### Test 12 — Delete Job Order

**Goal:** Verify conditional delete behavior.

**Part A — Hard delete (status = draft):**

1. Find a JO with status `Draft`
2. Click **Delete**
3. Confirm
4. Verify:
   - ✅ JO is permanently removed (not found in list even with filters)
   - ✅ Related items, inventory snapshots, and repairs are cascaded deleted
   - ✅ Audit log entry: `JO_SOFT_DELETED` with `type: "hard_delete"`

**Part B — Soft delete (other statuses):**

1. Find a JO with any non-draft status
2. Click **Delete**
3. Confirm
4. Verify:
   - ✅ JO disappears from the list (`is_deleted = true`)
   - ✅ `deleted_at` and `deleted_by` are set
   - ✅ Record still exists in database (soft deleted)
   - ✅ Audit log entry: `JO_SOFT_DELETED`

---

### Test 13 — Third-Party Repairs (Draft Only)

**Goal:** Verify TPR CRUD within a job order. **TPR can only be managed when the JO is in `draft` status.**

1. Open the **Third-Party Repair** action (wrench icon) on a `Draft` JO
2. **Add a repair:**
   - Provider Name: `AutoGlass Shop`
   - Description: `Windshield replacement`
   - Cost: `5000`
   - Repair Date: _(today)_
   - Click "Add" / "Save"
   - ✅ Toast: success
   - ✅ Repair appears in the list
   - ✅ Repairs total displayed at the bottom
   - ✅ `total_amount` on JO recalculates (items total + repairs total)
3. **Edit a repair:**
   - Click edit on an existing repair
   - Modify the cost
   - Save → toast: update success
   - ✅ `total_amount` recalculates if cost changed
4. **Delete a repair:**
   - Click delete on a repair
   - Confirm → repair is hard-deleted (since always draft)
   - ✅ `total_amount` recalculates
5. **Draft-only enforcement:**
   - Verify the wrench icon is **not visible** for non-draft JOs
   - Attempt API calls to add/edit/delete repairs on non-draft JOs
   - ✅ Backend returns: `Third-party repairs can only be managed when the job order is in draft status`

---

### Test 14 — Cascading Lookups (Branch → Customer → Vehicle)

**Goal:** Verify dropdown filtering in the create modal.

1. Open the Create JO modal
2. Select a **Branch** → Customer dropdown populates with only that branch's customers
3. Select a **Customer** → Vehicle dropdown populates with only that customer's vehicles
4. Change the **Branch** → Customer and Vehicle selections reset
5. Change the **Customer** → Vehicle selection resets

---

### Test 15 — Vehicle Class Auto-Population & Price Calculation

**Goal:** Verify that vehicle class is automatically fetched from the vehicle record and prices are calculated accordingly.

1. **Pre-requisite:** Ensure vehicles exist with different vehicle classes (Light, Heavy, Extra Heavy) set in Vehicle Management.
2. In the Create JO modal:
   - Select a branch and customer
   - Select a vehicle that has **Vehicle Class = Heavy**
   - ✅ The Vehicle Class field automatically shows "Heavy Vehicle" (read-only)
   - Add a Package item → pricing resolves using the **heavy\_price** column
3. Change the vehicle to one with **Vehicle Class = Light**
   - ✅ The Vehicle Class field updates to "Light Vehicle"
   - ✅ If items were already added, their labor prices recalculate using the **light\_price** column
   - ✅ Toast: "Prices updated for the vehicle class."
4. Verify that the Vehicle Class field is **not manually editable** — it is always derived from the selected vehicle.

---

### Test 16 — Search and Filter

**Goal:** Verify filter controls.

1. **Search** by order number, customer name, or vehicle plate → matching results shown
2. **Filter by status**: Draft / Pending Approval / Approved / In Progress / Ready for Release / Completed / Rejected / Cancelled
3. **Filter by branch** (if HM or multi-branch user)
4. Combine search + filters → verify correct results
5. Clear all → full list restored

---

### Test 17 — RBAC Enforcement

**Goal:** Verify role-based access controls.

1. **Log in as HM:**
   - ✅ Can view all JOs across all branches
   - ✅ **No** Create button
   - ✅ **No** Delete button
   - ✅ Can complete ready-for-release JOs
   - ✅ Can manage third-party repairs
2. **Log in as T (Technician):**
   - ✅ Can view JOs from assigned branches
   - ✅ **No** Create button
   - ✅ **No** Delete button
   - ✅ Can request approval, record approval
   - ✅ Can start work (approved → in_progress)
   - ✅ Can mark ready (in_progress → ready_for_release)
   - ✅ Cannot complete JOs
   - ✅ Can update notes (draft only)
   - ✅ Can manage third-party repairs
   - ✅ Cannot edit items
3. **Log in as POC:**
   - ✅ Can create, edit, delete, cancel
   - ✅ Cannot request/record approval
   - ✅ Can mark ready (in_progress → ready_for_release)
   - ✅ Can complete (ready_for_release → completed)
   - ✅ Can cancel pending_approval JOs
4. **Log in as JS:**
   - ✅ Can create, edit items, delete
   - ✅ Cannot request/record approval
   - ✅ Can cancel draft JOs only (not pending_approval)
   - ✅ Cannot start work, mark ready, or complete
5. **Log in as R:**
   - ✅ Can create, edit items, delete
   - ✅ Can request approval, record approval
   - ✅ Can cancel both draft and pending_approval JOs
   - ✅ Cannot start work, mark ready, or complete

---

### Test 18 — Full Lifecycle Walkthrough

**Goal:** Verify the complete happy path from creation to completion.

1. **Create** a JO as **R** → status: `Draft`
2. **Add items** to the JO → verify pricing, inventory
3. **Request approval** as **R** → status: `Pending Approval`
4. **Approve** as **R** → status: `Approved` → verify stock deduction
5. **Start work** as **T** → status: `In Progress` → verify `start_time` set
6. **Mark ready** as **T** → status: `Ready for Release`
7. **Complete** as **POC** or **HM** → status: `Completed` → verify `completion_time` set
8. Verify the full history timeline shows all transitions
9. Verify all audit log entries are present

---

### Test 19 — History Timeline

**Goal:** Verify order history tracking for the full lifecycle.

1. Complete a full lifecycle (Test 18)
2. Open the JO → scroll to **History** section
3. Verify history entries:
   - ✅ `JO_CREATED`
   - ✅ `APPROVAL_REQUESTED` + `STATUS_CHANGED` (draft → pending_approval)
   - ✅ `APPROVAL_RECORDED` + `STATUS_CHANGED` (pending_approval → approved)
   - ✅ `WORK_STARTED` + `STATUS_CHANGED` (approved → in_progress)
   - ✅ `MARKED_READY` + `STATUS_CHANGED` (in_progress → ready_for_release)
   - ✅ `JO_COMPLETED` + `STATUS_CHANGED` (ready_for_release → completed)
   - ✅ Each entry shows user, action, timestamp

---

### Test 20 — Audit Logging

**Goal:** Verify JO operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ `JO_CREATED` — Job order creation
   - ✅ `STATUS_CHANGED` — All status transitions with from/to values
   - ✅ `APPROVAL_REQUESTED` — Approval requests
   - ✅ `APPROVAL_RECORDED` — Approval decisions
   - ✅ `WORK_STARTED` — Work started
   - ✅ `MARKED_READY` — Marked ready
   - ✅ `JO_COMPLETED` — Completion
   - ✅ `JO_CANCELLED` — Cancellations (with reason)
   - ✅ `JO_UPDATED` — Notes updates
   - ✅ `JO_SOFT_DELETED` — Deletions

---

## Summary Checklist

| Requirement                                           | Status |
| ----------------------------------------------------- | ------ |
| View Job Orders (Cards with 8 status badges)          | ⬜     |
| Create JO with Cascading Lookups                      | ⬜     |
| Vehicle Class Auto-Population from Vehicle        | ⬜     |
| Pricing Resolution (labor from pricing matrix)        | ⬜     |
| Inventory Template Loading (from Package links)       | ⬜     |
| Editable Inventory Quantities per Item                | ⬜     |
| Pricing Formula: (labor + inv_cost) × qty             | ⬜     |
| Inventory Snapshots (job_order_item_inventories)      | ⬜     |
| View JO Details (Items, Inventory, TPR, History)      | ⬜     |
| Edit Notes (draft only — immutability)                | ⬜     |
| Edit Items (Add/Remove/Quantity — draft only)         | ⬜     |
| Request Approval (draft → pending_approval, R/T)      | ⬜     |
| Preconditions: ≥1 item, total > 0, no zero prices    | ⬜     |
| Idempotent approval request                           | ⬜     |
| Record Approval — Approve (stock deduction)           | ⬜     |
| Record Approval — Reject (terminal, rejection_reason) | ⬜     |
| Start Work (approved → in_progress, T only, auto-assign) | ⬜     |
| Start Work precondition: auto-assigns technician      | ⬜     |
| Mark Ready (in_progress → ready_for_release, T/POC)   | ⬜     |
| Complete (ready_for_release → completed, HM/POC)      | ⬜     |
| Cancel with required reason (draft/pending_approval)  | ⬜     |
| Cancel role enforcement (per status)                  | ⬜     |
| Hard Delete (draft status — cascade)                  | ⬜     |
| Soft Delete (other statuses — deleted_at/deleted_by)  | ⬜     |
| Third-Party Repairs CRUD (draft only)                  | ⬜     |
| Cascading Lookups (Branch → Customer → Vehicle)       | ⬜     |
| Search and Filter (8 status options)                  | ⬜     |
| Pagination (12 per page)                              | ⬜     |
| RBAC per Role (all 5 roles verified)                  | ⬜     |
| Timestamp Coherence                                   | ⬜     |
| History Timeline (full lifecycle)                     | ⬜     |
| Audit Logging (standardized event names)              | ⬜     |
| Insufficient Stock Blocks Approval                    | ⬜     |
| Full Lifecycle Walkthrough                            | ⬜     |
