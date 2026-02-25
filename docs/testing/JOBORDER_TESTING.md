# Job Order Management — Testing Guide & Process Documentation

---

## How Job Order Management Works in the System

### Overview

The Job Order (JO) module is the central workflow in the system. It manages service requests tied to a customer vehicle, tracking items (products/services/packages), third-party repairs (TPR), and a multi-step approval workflow. When a JO is approved, product-type items automatically deduct stock from inventory. The module supports full CRUD for both JO items and third-party repairs, with conditional hard/soft delete logic depending on the JO's lifecycle stage.

### Status Lifecycle

```
  created ──────► pending ──────► approved
     │                │               │
     │                │               │
     ▼                ▼               ▼
  rejected ◄──── (rejected)      cancelled
     │                               (stock restored)
     │
     ▼
  pending (re-submit)
```

- **Created** — newly created JO, items can be added/edited/removed
- **Pending** — submitted for customer approval, awaiting decision
- **Approved** — customer approved, stock deducted from inventory
- **Rejected** — customer rejected, items can be modified and re-submitted
- **Cancelled** — JO cancelled, if previously approved then stock is restored

### Key Business Rules

1. **Customer vehicle required** — a JO must be linked to a specific customer vehicle (selecting a customer filters their vehicles).
2. **At least 1 item** — a JO must have at least 1 item before it can be submitted for approval.
3. **Item editing restricted by status** — items can only be added/updated/removed when JO status is `created` or `rejected`.
4. **Pricing resolution** — when an item is added, the system resolves the price via the `/api/pricing/resolve` endpoint (base price + labor + packaging from active pricing rules).
5. **Stock deduction on approval** — product-type catalog items automatically deduct from inventory (matched by item name in same branch).
6. **Insufficient stock blocks approval** — if inventory stock is insufficient for any product item, the approval is blocked with an error.
7. **Stock restoration on cancellation** — cancelling an approved JO restores all deducted stock.
8. **Conditional JO delete** — hard delete if status is `created` AND no items AND no third-party repairs; otherwise soft delete (sets `is_deleted = true`).
9. **Third-party repairs (TPR)** — managed separately within a JO. Each TPR has its own CRUD and conditional delete logic (hard delete if parent JO is `created` or `rejected`, soft delete otherwise).
10. **Card grid display** — JOs are displayed as cards (not a table), 12 per page.

### RBAC (Roles & Permissions)

| Action                             | HM  | POC | JS  |  R  |  T  |
| ---------------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Job Orders                    | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create JO                          |  —  | ✅  | ✅  | ✅  |  —  |
| Update JO                          |  —  | ✅  | ✅  | ✅  | ✅  |
| Add/Edit/Remove Items              |  —  | ✅  | ✅  | ✅  |  —  |
| Delete JO                          |  —  | ✅  | ✅  | ✅  |  —  |
| Customer Approval (Request/Record) |  —  |  —  |  —  | ✅  | ✅  |
| Cancel JO                          |  —  |  —  |  —  | ✅  | ✅  |
| Manage Third-Party Repairs         | ✅  | ✅  | ✅  | ✅  | ✅  |
| View History                       | ✅  | ✅  | ✅  | ✅  | ✅  |

> **Note:** HM has view-only access to JOs. POC, JS, R handle creation and item management. R and T handle the approval workflow.

### API Endpoints

| Method   | Endpoint                              | Description                      |
| -------- | ------------------------------------- | -------------------------------- |
| `GET`    | `/api/joborders`                      | List JOs with items and TPRs     |
| `GET`    | `/api/joborders/:id`                  | Get single JO with all relations |
| `POST`   | `/api/joborders`                      | Create JO                        |
| `PUT`    | `/api/joborders/:id`                  | Update JO header                 |
| `DELETE` | `/api/joborders/:id`                  | Conditional hard/soft delete     |
| `POST`   | `/api/joborders/:id/items`            | Add item to JO                   |
| `PUT`    | `/api/joborders/:id/items/:itemId`    | Update JO item                   |
| `DELETE` | `/api/joborders/:id/items/:itemId`    | Remove item (must keep ≥ 1)      |
| `PUT`    | `/api/joborders/:id/request-approval` | Submit for approval (→ pending)  |
| `PUT`    | `/api/joborders/:id/record-approval`  | Record approval/rejection        |
| `PUT`    | `/api/joborders/:id/cancel`           | Cancel JO                        |
| `GET`    | `/api/joborders/:id/history`          | Get JO change history            |
| `POST`   | `/api/thirdpartyrepairs`              | Create TPR                       |
| `PUT`    | `/api/thirdpartyrepairs/:id`          | Update TPR                       |
| `DELETE` | `/api/thirdpartyrepairs/:id`          | Conditional hard/soft delete TPR |
| `GET`    | `/api/pricing/resolve`                | Resolve pricing for an item      |

---

## Sample Data to Populate

> **Pre-requisites:** Customers with vehicles, catalog items with active pricing rules, and inventory items must already exist.

### Job Order #1 — Standard Service (MAIN)

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Branch   | MAIN                                       |
| Customer | _(select an active MAIN customer)_         |
| Vehicle  | _(select one of that customer's vehicles)_ |
| Notes    | Standard oil change and filter replacement |

**Items to add after creation:**

| #   | Catalog Item                 | Type    | Qty | Expected Price Resolution |
| --- | ---------------------------- | ------- | --- | ------------------------- |
| 1   | Shell Helix Ultra 5W-40 (1L) | Product | 4   | Base + labor + packaging  |
| 2   | Denso Oil Filter (Universal) | Product | 1   | Base + labor              |
| 3   | Oil Change Service           | Service | 1   | Service rate              |

### Job Order #2 — With Third-Party Repair (NORTH)

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Branch   | NORTH                                      |
| Customer | _(select an active NORTH customer)_        |
| Vehicle  | _(select one of that customer's vehicles)_ |
| Notes    | Tire replacement + external alignment      |

**Items:**

| #   | Catalog Item                 | Type    | Qty |
| --- | ---------------------------- | ------- | --- |
| 1   | Bridgestone Ecopia 195/65R15 | Product | 4   |

**Third-Party Repair:**

| Field            | Value                                        |
| ---------------- | -------------------------------------------- |
| Service Provider | QuickAlign Pro Shop                          |
| Description      | 4-Wheel Computer Alignment                   |
| Cost             | 1,500                                        |
| Notes            | External service — customer vehicle sent out |

### Job Order #3 — For Rejection & Re-submission Testing

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Branch   | MAIN                                       |
| Customer | _(select an active MAIN customer)_         |
| Vehicle  | _(select one of that customer's vehicles)_ |
| Notes    | Quote for brake pad replacement            |

**Items:**

| #   | Catalog Item                 | Type    | Qty |
| --- | ---------------------------- | ------- | --- |
| 1   | Brembo Brake Pad Set (Front) | Product | 1   |

### Job Order #4 — For Delete Testing

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Branch   | MAIN                                       |
| Customer | _(select an active MAIN customer)_         |
| Vehicle  | _(select one of that customer's vehicles)_ |
| Notes    | This JO will be used for delete testing    |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **POC**, **JS**, **R**, or **T** (depending on the test)
- Customers with active vehicles exist in the target branches
- Catalog items with active pricing rules exist
- Inventory items with sufficient stock exist

---

### Test 1 — View Job Orders

**Goal:** Verify the JO card grid loads correctly.

1. Navigate to **Job Orders** from the sidebar
2. Verify the page displays JOs as **cards** (not a table)
3. Each card shows:
   - ✅ JO number / identifier
   - ✅ Customer name
   - ✅ Vehicle info (plate number)
   - ✅ Status badge (Created / Pending / Approved / Rejected / Cancelled)
   - ✅ Branch badge
   - ✅ Item count
   - ✅ Total amount
   - ✅ Action buttons
4. Verify pagination: **12 cards per page**

---

### Test 2 — Create Job Order

**Goal:** Verify JO creation with customer-vehicle linking.

1. Log in as **POC** or **JS** or **R**
2. Click **"Create Job Order"** → the **"Create Job Order"** modal opens
3. Fill in the form:
   - **Branch**: `MAIN` (select first — filters customers)
   - **Customer**: _(select an active MAIN customer)_ — filtered by branch
   - **Vehicle**: _(select one of that customer's vehicles)_
   - **Notes**: `Standard oil change and filter replacement`
4. Click **"Create Job Order"**
5. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Job order created successfully"`
   - ✅ New JO card appears with Status = **"Created"**
   - ✅ Items count shows 0 (items are added after creation)
6. Repeat for JOs #2, #3, and #4

**Edge cases to test:**

- No customer selected → error: `"Customer is required"`
- No vehicle selected → error: `"Vehicle is required"`
- HM tries to create → create button should not be visible
- T tries to create → create button should not be visible

---

### Test 3 — Add Items to Job Order

**Goal:** Verify item addition with pricing resolution.

1. Click on JO #1 card → open the JO detail/edit view
2. Click **"Add Item"** (or the add item action)
3. Select a catalog item: `Shell Helix Ultra 5W-40 (1L)`
4. Enter Quantity: `4`
5. Verify:
   - ✅ Price is auto-resolved via the pricing system (base + labor + packaging)
   - ✅ Subtotal is computed (resolved price × quantity)
6. Save the item
7. Verify:
   - ✅ Toast: `"Item added successfully"`
   - ✅ Item appears in the JO's item list
8. Add remaining items for JO #1 (Denso Oil Filter × 1, Oil Change Service × 1)
9. Verify the **Total** updates with each item addition

**Edge cases:**

- Add item with Quantity = 0 → should show error
- Items can only be added when status is `created` or `rejected`

---

### Test 4 — Update Job Order Item

**Goal:** Verify item quantity/details can be modified.

1. On JO #1, find an existing item (e.g., Shell Helix Ultra)
2. Click the Edit action on that item
3. Change quantity from 4 to 6
4. Save changes
5. Verify:
   - ✅ Toast: `"Item updated successfully"`
   - ✅ Updated quantity and subtotal reflected
   - ✅ JO total recalculated

---

### Test 5 — Remove Item from Job Order

**Goal:** Verify item removal with minimum-1-item constraint.

**5a — Remove when multiple items exist:**

1. On JO #1 (has 3 items), remove the Oil Change Service item
2. Verify:
   - ✅ Toast: `"Item removed successfully"`
   - ✅ Item disappears, total recalculated
   - ✅ JO still has 2 items

**5b — Cannot remove last item:**

1. Remove items until only 1 remains
2. Try to remove the last item
3. Verify:
   - ✅ Error: `"Cannot remove the last item. A job order must have at least one item."`

---

### Test 6 — Manage Third-Party Repairs

**Goal:** Verify TPR CRUD within a JO.

1. Open JO #2
2. Click the **Manage Repairs** action (wrench icon or "Manage Repairs" in the More dropdown)
3. Verify the **"Manage Repairs"** modal opens

**6a — Create TPR:**

1. Click **"Add Repair"**
2. Fill in:
   - Service Provider: `QuickAlign Pro Shop`
   - Description: `4-Wheel Computer Alignment`
   - Cost: `1500`
   - Notes: `External service — customer vehicle sent out`
3. Save
4. Verify:
   - ✅ Toast: `"Third-party repair created successfully"`
   - ✅ Repair appears in the repairs list

**6b — Update TPR:**

1. Click Edit on the repair
2. Change Cost to `1800`
3. Save
4. Verify:
   - ✅ Toast: `"Third-party repair updated successfully"`
   - ✅ Updated cost reflected

**6c — Delete TPR (Hard Delete — JO is created/rejected):**

1. Click Delete on the repair (while JO status is `created`)
2. Confirm deletion
3. Verify:
   - ✅ Toast: `"Third-party repair deleted successfully"`
   - ✅ Repair is permanently removed

**6d — Add the TPR back** for later testing:

1. Re-add the repair with the same data as step 6a

---

### Test 7 — Request Customer Approval

**Goal:** Verify the approval request workflow (created → pending).

> **This can only be done by R or T roles.**

1. Log in as **R**
2. Open JO #1 (status: `created`, has items)
3. Click the **More** dropdown → select **"Customer Approval"**
4. Verify the **Customer Approval** modal opens showing:
   - ✅ Current status: **Created**
   - ✅ Action available: **"Request Approval"** (sends JO to pending)
5. Click **"Request Approval"**
6. Verify:
   - ✅ Toast: `"Approval requested successfully"` (or similar)
   - ✅ JO status changes to **"Pending"**
   - ✅ Items can no longer be added/edited/removed
7. Repeat for JO #2 and JO #3

---

### Test 8 — Record Customer Approval (Approve)

**Goal:** Verify approval with automatic stock deduction.

1. Log in as **R** or **T**
2. Note current inventory stock for JO #1 items (e.g., Shell Helix, Denso Filter)
3. Open JO #1 (status: `pending`)
4. Click the **More** dropdown → select **"Customer Approval"**
5. Verify the modal shows:
   - ✅ Current status: **Pending**
   - ✅ Actions available: **"Approve"** and **"Reject"**
6. Click **"Approve"**
7. Verify:
   - ✅ Toast: `"Job order approved successfully"` (or similar)
   - ✅ JO status changes to **"Approved"**
   - ✅ Items are locked (cannot add/edit/remove)
8. Navigate to **Inventory** and verify stock deducted:
   - ✅ Product-type items have reduced quantities
   - ✅ Movement History shows `Stock Out` entries with reference: Job Order

**Insufficient stock test:**

1. Create a new JO with a product item whose inventory is very low (e.g., quantity 1)
2. Set the JO item quantity higher than available stock (e.g., 5)
3. Submit for approval → try to approve
4. Verify:
   - ✅ Error: `"Insufficient stock for \"{item_name}\". Available: {qty}, Required: {needed}"`

---

### Test 9 — Record Customer Rejection

**Goal:** Verify rejection allows item modification.

1. Open JO #3 (status: `pending`)
2. Click **More** → **"Customer Approval"**
3. Click **"Reject"**
4. Verify:
   - ✅ Toast: `"Job order rejected"` (or similar)
   - ✅ JO status changes to **"Rejected"**
5. Verify that items CAN be added/edited/removed again:
   - ✅ Add a new item to the JO
   - ✅ Edit an existing item
   - ✅ Remove an item (if more than 1)
6. Re-submit for approval:
   - Click **More** → **"Customer Approval"** → **"Request Approval"**
   - ✅ Status changes back to **"Pending"**

---

### Test 10 — Cancel Job Order

**Goal:** Verify cancellation with stock restoration for approved JOs.

**10a — Cancel an approved JO (stock restoration):**

1. Note current inventory stock for JO #1 items
2. Open JO #1 (status: `approved`)
3. Click **More** → select **"Cancel"**
4. Verify the confirmation modal appears
5. Confirm cancellation
6. Verify:
   - ✅ Toast: `"Job order cancelled successfully"` (or similar)
   - ✅ JO status changes to **"Cancelled"**
7. Navigate to **Inventory**:
   - ✅ Stock restored to pre-approval levels
   - ✅ Movement History shows `Stock In` entries with reason: stock restored

**10b — Cancel a pending JO (no stock impact):**

1. Open JO #3 (status: `pending`)
2. Cancel it
3. Verify:
   - ✅ Status changes to **"Cancelled"**
   - ✅ No stock changes in Inventory (stock is only deducted on approval)

**10c — Cancel a created JO:**

1. Create a new JO, do NOT submit it
2. Cancel it directly
3. Verify status changes to **"Cancelled"**

---

### Test 11 — Delete Job Order

**Goal:** Verify conditional delete logic.

**11a — Hard Delete (created + no items + no TPRs):**

1. Create JO #4 with NO items and NO third-party repairs
2. Click Delete on the JO
3. Confirm deletion
4. Verify:
   - ✅ Toast: `"Job order deleted successfully"`
   - ✅ JO is completely removed from the list (hard delete)

**11b — Soft Delete (has items or TPRs):**

1. Create a new JO, add at least 1 item
2. Delete it
3. Verify:
   - ✅ Toast: `"Job order deleted successfully"`
   - ✅ JO is hidden but record preserved (soft delete: `is_deleted = true`)

**11c — RBAC check:**

- HM cannot delete (button not visible)
- T cannot delete (button not visible)
- POC, JS, R can delete

---

### Test 12 — Third-Party Repair Delete Logic

**Goal:** Verify TPR conditional delete depends on parent JO status.

**12a — Hard delete when JO is created or rejected:**

1. Open a JO with status `created` → manage repairs → add a TPR → delete it
2. Verify TPR is permanently removed (hard delete)

**12b — Soft delete when JO is in other status:**

1. Open a JO with status `pending` or `approved` → manage repairs
2. If a TPR exists, delete it
3. Verify TPR is soft-deleted (marked as deleted but record preserved)

---

### Test 13 — View Job Order History

**Goal:** Verify change history tracking.

1. Open any JO that has gone through multiple status changes
2. Click **More** → **"History"**
3. Verify the **History** modal shows entries for:
   - ✅ JO creation
   - ✅ Item additions/updates/removals
   - ✅ Status transitions (created → pending → approved/rejected → cancelled)
   - ✅ TPR additions/updates/deletions
4. Each entry shows:
   - ✅ Action performed
   - ✅ User who performed it
   - ✅ Timestamp

---

### Test 14 — Update Job Order Header

**Goal:** Verify JO details can be edited.

1. Open JO #2 (status: `created`)
2. Click **Edit** on the JO card
3. Verify the **"Edit Job Order"** modal opens
4. Change Notes to `"Updated notes — tire replacement + alignment"`
5. Save changes
6. Verify:
   - ✅ Toast: `"Job order updated successfully"`
   - ✅ Updated notes visible

---

### Test 15 — Search & Filter Job Orders

**Goal:** Verify search and filter functionality.

1. **Search** by customer name → matching JO cards appear
2. **Search** by vehicle plate number → matching JO cards appear
3. **Filter by Status**: select `"Approved"` → only approved JOs shown
4. **Filter by Status**: select `"Created"` → only created JOs shown
5. **Filter by Branch**: select a specific branch → only that branch's JOs
6. Reset filters → all JOs appear

---

### Test 16 — Branch Scoping

**Goal:** Verify users only see JOs for their assigned branches.

1. Log in as **POC** assigned to MAIN → see only MAIN JOs
2. Log in as **R** assigned to NORTH → see only NORTH JOs
3. Log in as **HM** → see JOs across all branches (view-only)
4. Log in as **T** → see JOs for assigned branch (can manage TPRs and approve/reject)

---

### Test 17 — Audit Logging

**Goal:** Verify all JO mutations are audit-logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ JO creation (action: CREATE)
   - ✅ JO update (action: UPDATE)
   - ✅ JO deletion (action: DELETE)
   - ✅ Item addition (action: CREATE, entity: job order item)
   - ✅ Item update (action: UPDATE, entity: job order item)
   - ✅ Item removal (action: DELETE, entity: job order item)
   - ✅ Status transitions (action: UPDATE)
   - ✅ TPR creation (action: CREATE, entity: third-party repair)
   - ✅ TPR update/deletion

---

## Process Flow Summary

```
1. CREATE Job Order
   ├── Select branch → customer (filtered) → vehicle (filtered)
   ├── Enter notes (optional)
   ├── JO created with status = "created", 0 items
   └── Audit log: CREATE

2. ADD ITEMS (status: created or rejected)
   ├── Select catalog item → quantity
   ├── Price auto-resolved via /api/pricing/resolve
   ├── Item added to JO
   └── Can add/edit/remove items freely

3. MANAGE THIRD-PARTY REPAIRS
   ├── Add/Edit/Delete TPRs via "Manage Repairs" modal
   ├── Available in any JO status
   └── Delete type depends on JO status (hard vs soft)

4. REQUEST APPROVAL (created/rejected → pending)
   ├── Must have ≥ 1 item
   ├── R or T triggers the request
   ├── Status changes to "pending"
   └── Items locked (cannot modify)

5. RECORD APPROVAL (pending → approved)
   ├── R or T records customer decision
   ├── On APPROVE:
   │   ├── Status → "approved"
   │   ├── For each product-type item:
   │   │   ├── Find matching inventory item (name + branch)
   │   │   ├── Validate sufficient stock
   │   │   └── Create stock_out movement
   │   └── Block if insufficient stock
   └── On REJECT:
       ├── Status → "rejected"
       └── Items unlocked for modification

6. CANCEL JO (any status except cancelled)
   ├── R or T cancels the JO
   ├── Status → "cancelled"
   ├── If was approved:
   │   ├── Find all stock_out movements for this JO
   │   ├── Create matching stock_in movements
   │   └── Stock fully restored
   └── If was not approved: no stock impact

7. DELETE JO
   ├── POC, JS, or R can delete
   ├── If status = created + no items + no TPRs:
   │   └── Hard delete (permanent removal)
   └── Otherwise:
       └── Soft delete (is_deleted = true)
```

---

## Summary Checklist

| Requirement                                    | Status |
| ---------------------------------------------- | ------ |
| View JO Card Grid                              | ⬜     |
| Create JO (Customer + Vehicle)                 | ⬜     |
| Add Items with Pricing Resolution              | ⬜     |
| Update JO Item                                 | ⬜     |
| Remove Item (≥ 1 Constraint)                   | ⬜     |
| Create Third-Party Repair                      | ⬜     |
| Update Third-Party Repair                      | ⬜     |
| Delete TPR (Hard — Created/Rejected JO)        | ⬜     |
| Delete TPR (Soft — Other Status)               | ⬜     |
| Request Customer Approval (→ Pending)          | ⬜     |
| Record Approval (→ Approved + Stock Deduction) | ⬜     |
| Record Rejection (→ Rejected + Items Unlocked) | ⬜     |
| Insufficient Stock Blocks Approval             | ⬜     |
| Cancel Approved JO (Stock Restored)            | ⬜     |
| Cancel Pending/Created JO (No Stock Impact)    | ⬜     |
| Hard Delete (Created + No Items + No TPRs)     | ⬜     |
| Soft Delete (Has Items/TPRs)                   | ⬜     |
| Re-submit Rejected JO                          | ⬜     |
| View JO History                                | ⬜     |
| Search (Customer, Vehicle)                     | ⬜     |
| Filter by Status / Branch                      | ⬜     |
| Branch Scoping                                 | ⬜     |
| Pagination (12 per page)                       | ⬜     |
| Items Locked When Not Created/Rejected         | ⬜     |
| HM View-Only                                   | ⬜     |
| T Cannot Create/Delete JO                      | ⬜     |
| Audit Logging                                  | ⬜     |
| RBAC Enforcement                               | ⬜     |
