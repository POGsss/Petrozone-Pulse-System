# Purchase Order Module — Testing Guide & Process Documentation

---

## How Purchase Orders Work in the System

### Overview

The Purchase Order (PO) module manages inventory procurement. It allows authorized users to create purchase orders for inventory items, track their lifecycle from draft to receipt, and automatically stock-in items when a PO is received. This directly integrates with the Inventory module via `stock_movements`.

### Lifecycle / Status Flow

```
Draft  ──→  Submitted  ──→  Approved  ──→  Partially Received  ──→  Received
   │              │               │                    │
   │              ├──→  Cancelled │                    │
   │                              └──────→ Deactivated (conditional delete)
  │
   └──→  Cancelled
```

| Status      | Description                                                                  |
| ----------- | ---------------------------------------------------------------------------- |
| `draft`     | Newly created PO. Can be edited, submitted, cancelled, or deleted.           |
| `submitted` | PO sent for processing. Can be edited, cancelled, or approved.                |
| `approved`  | PO approved and ready for receive flow.                                       |
| `partially_received` | PO has partial stock-in; additional receive actions are still allowed. |
| `received`  | PO fully received and stocked in. **Cannot be edited or deleted.** |
| `cancelled` | PO was manually cancelled. **Cannot be edited or re-submitted.**             |
| `deactivated` | PO was deactivated by conditional delete after progression beyond draft. |

### Key Business Rules

1. **PO Number Behavior:** If `po_number` is left blank during creation, the backend generates one. Manual PO number entry is still allowed when valid and unique by branch.
2. **Branch Scoping:** Each PO belongs to a branch. Non-HM users can only see/manage POs for their assigned branches.
3. **Soft Delete Only:** Deleting a PO sets `is_deleted = true` and `status = "cancelled"`. The record remains in the database for audit purposes.
4. **Edit Restrictions:** Only `draft` and `submitted` purchase orders are editable.
5. **Stock-In on Receive:** When a PO transitions to `received`, each PO item creates a `stock_movement` record with `movement_type = "stock_in"` and `reference_type = "purchase_order"`, atomically increasing the inventory item's on-hand quantity.
6. **Receive Restrictions:** Receive endpoint allows only `approved` or `partially_received` statuses.
7. **Total Amount:** Automatically calculated as the sum of `quantity_ordered × unit_cost` for all items.

### RBAC (Roles & Permissions)

| Action                       | HM  | POC | JS  |  R  |
| ---------------------------- | :-: | :-: | :-: | :-: |
| Create Purchase Order (UC49) | ✅  | ✅  | ✅  | ✅  |
| View Purchase Orders (UC50)  | ✅  | ✅  | ✅  | ✅  |
| Update Purchase Order (UC51) | ✅  | ✅  | ✅  | ✅  |
| Delete Purchase Order (UC52) | ✅  | ✅  | ✅  | ✅  |
| Submit PO                    | ✅  | ✅  | ✅  | ✅  |
| Receive PO (Stock-In)        | ✅  | ✅  | ✅  | ✅  |
| Cancel PO                    | ✅  | ✅  | ✅  | ✅  |

### API Endpoints

| Method   | Endpoint                           | Description                          |
| -------- | ---------------------------------- | ------------------------------------ |
| `GET`    | `/api/purchase-orders`             | List all POs (paginated, filterable) |
| `GET`    | `/api/purchase-orders/:id`         | Get single PO with items             |
| `POST`   | `/api/purchase-orders`             | Create new PO with items             |
| `PUT`    | `/api/purchase-orders/:id`         | Update PO (draft/submitted only)     |
| `PATCH`  | `/api/purchase-orders/:id/submit`  | Submit PO (draft → submitted)        |
| `PATCH`  | `/api/purchase-orders/:id/approve` | Approve PO (submitted → approved)    |
| `PATCH`  | `/api/purchase-orders/:id/receive` | Receive PO (approved/partially_received → partially_received/received) |
| `PATCH`  | `/api/purchase-orders/:id/cancel`  | Cancel PO (draft/submitted only)     |
| `DELETE` | `/api/purchase-orders/:id`         | Soft-delete PO (not received)        |

---

## Sample Data to Populate

> **Pre-requisite:** You must have inventory items already created (see `INVENTORY_TESTING.md`). The PO items reference existing inventory items.

Use the **Create Purchase Order** button on the Purchase Orders page. Create each PO below:

| #   | Supplier Name          | Branch   | Notes                       | Items (from Inventory)                                            |
| --- | ---------------------- | -------- | --------------------------- | ----------------------------------------------------------------- |
| 1   | AutoParts Supply Corp  | Branch A | Monthly oil replenishment   | Shell Helix Ultra 5W-40 × 20 @ ₱650, Denso Oil Filter × 10 @ ₱280 |
| 2   | BrakePro Philippines   | Branch A | Emergency brake parts order | Brembo Brake Pad Set × 5 @ ₱2,400                                 |
| 3   | TireMaster Wholesale   | Branch B | Tire stock replenishment    | Bridgestone Ecopia 195/65R15 × 10 @ ₱4,200                        |
| 4   | PowerBattery Inc       | Branch B | Battery stock-up            | Motolite Gold Battery NS60 × 8 @ ₱5,500                           |
| 5   | CleanAuto Distributors | Branch A | Cleaning supplies reorder   | Armor All Cleaner × 15 @ ₱320, Blade Freshener × 30 @ ₱85         |

> **Tip:** Leave the PO Number field blank to test auto-generation. Fill it in manually for PO #3 (e.g., `PO-CUSTOM-001`) to test manual entry.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend server is running (`npm run dev` from the `backend/` folder)
- Frontend dev server is running (`npm run dev` from the `frontend/` folder)
- You are logged in as a user with **HM**, **POC**, **JS**, or **R** role
- Inventory items from `INVENTORY_TESTING.md` have been created
- At least two branches exist in the system

---

### Test 1 — Create Purchase Order (UC49)

**Goal:** Verify POs can be created with items from inventory.

1. Navigate to **Purchase Orders** from the sidebar
2. Click the **Create Purchase Order** button (top-right)
3. Fill in the form with Sample Data PO #1:
   - Supplier: `AutoParts Supply Corp`
   - Branch: Select Branch A
   - Order Date: today's date (auto-filled)
   - Expected Delivery: set to a date 7 days from now
   - Notes: `Monthly oil replenishment`
4. Add items using the inventory selector:
   - Select `Shell Helix Ultra 5W-40 (OIL-SHU540)`, Qty: `20`, Cost: `650` → click **+**
   - Select `Denso Oil Filter (FLT-DNSO01)`, Qty: `10`, Cost: `280` → click **+**
5. Verify the item list shows both items with correct line totals
6. Verify the Total shows: ₱15,800.00 (20×650 + 10×280)
7. Click **Create Purchase**
8. Verify:
   - ✅ Success toast appears
   - ✅ PO appears in the table with status `Draft`
   - ✅ Auto-generated PO number is displayed
   - ✅ Total amount shows ₱15,800.00
   - ✅ Stats cards update (Total count increases)
9. Repeat for all 5 sample POs

**Edge cases to test:**

- Try submitting with no items → should show validation error "At least one item is required"
- Try submitting without selecting a branch → should show "Branch is required"
- Try adding a duplicate inventory item → should show "This item is already added"
- Try setting quantity to 0 → should show validation error
- Try creating with a PO number that already exists in the same branch → should fail (409 conflict)

---

### Test 2 — View Purchase Orders (UC50)

**Goal:** Verify PO list displays correctly with search, filters, and view modal.

1. After creating all 5 POs, verify:
   - ✅ All 5 POs appear in the table
   - ✅ Stats cards show: Total = 5, Submitted = 0, Received = 0
2. **Search:** Type `"AutoParts"` in the search bar → only PO #1 should appear
3. **Search by PO number:** Type the auto-generated PO number → only that PO should appear
4. **Filter by Status:** Select `Draft` → all 5 POs visible. Select `Received` → none visible
5. **Filter by Branch:** Click Filters → select Branch B → only POs #3 and #4 should show
6. **Reset:** Click "Reset" → all POs visible again
7. **Refresh:** Click the refresh button → table reloads
8. **View Details:** Click on any table row → View modal opens showing:
   - ✅ PO Number, Status, Total Amount
   - ✅ Supplier name, Branch (name + code)
   - ✅ Order Date, Expected Delivery, Received At (if applicable)
   - ✅ Order Items with unit cost × quantity and line totals
   - ✅ Total card at the bottom
   - ✅ Notes section (if notes exist)
   - ✅ Created/Updated timestamps
9. **Pagination:** If more than 10 POs exist, verify pagination works (Next/Prev buttons)

---

### Test 3 — Update Purchase Order (UC51)

**Goal:** Verify PO details and items can be edited.

1. Click the **pencil icon** on PO #1 (AutoParts Supply Corp)
2. Change the supplier name to `"AutoParts Supply Corporation"`
3. Update the notes to `"Monthly oil replenishment - revised"`
4. Remove the Denso Oil Filter item (click ✕)
5. Add a new item: `NGK Spark Plug × 5 @ ₱450`
6. Click **Save Changes**
7. Verify:
   - ✅ Success toast appears
   - ✅ Updated supplier name reflected in the table
   - ✅ Total amount recalculated: 20×650 + 5×450 = ₱15,250.00
   - ✅ View modal shows updated items (Shell Helix + NGK, no Denso)

**Edge cases to test:**

- Try removing all items and saving → should show "At least one item is required"
- PO Number field should be disabled (read-only) in edit modal
- Branch field should be disabled (read-only) in edit modal
- Order Date and Expected Delivery should be editable

---

### Test 4 — Submit and Approve Purchase Order (Draft → Submitted → Approved)

**Goal:** Verify PO can be submitted for processing.

1. On PO #1 (Draft), click the **three-dots menu** → **Submit PO**
2. A confirmation modal should appear asking to confirm submission
3. Click **Submit PO** to confirm
4. Verify:
   - ✅ Success toast: `"PO PO-XXXX submitted"`
   - ✅ Status changes from `Draft` to `Submitted` in the table
   - ✅ Stats card: Submitted count increases by 1
5. From the same PO, click `More` -> `Approve PO`.
6. Verify:
   - ✅ Success toast appears for approval
   - ✅ Status changes from `Submitted` to `Approved`
7. Repeat submit + approve for PO #2 (for testing receive later)

**Edge cases to test:**

- Only `draft` POs can be submitted
- Only `submitted` POs can be approved
- After approval, PO should no longer be editable

---

### Test 5 — Receive Purchase Order (Approved/Partially Received → Received / Stock-In)

**Goal:** Verify receiving a PO creates stock movements and updates inventory.

**Before receiving:**

1. Navigate to **Inventory** and note the current stock levels:
   - Shell Helix Ultra 5W-40: note the current quantity (e.g., 25)
   - NGK Spark Plug: note the current quantity (e.g., 20)

**Receive the PO:** 2. Navigate back to **Purchase Orders** 3. On PO #1 (Approved), click the **three-dots menu** → **Receive & Stock In** 4. Enter a quantity to receive (partial or full), then confirm. 5. Verify:

- ✅ Success toast: `"PO PO-XXXX received — stock has been updated"`
- ✅ Status changes to `Partially Received` or `Received` depending on quantity
- ✅ Stats card: Received count increases by 1

**Verify stock-in:** 6. Navigate to **Inventory** 7. Check stock levels:

- ✅ Shell Helix Ultra: increased by 20 (e.g., 25 → 45)
- ✅ NGK Spark Plug: increased by 5 (e.g., 20 → 25)

8. Click the **Movement History** icon on Shell Helix Ultra
9. Verify:
   - ✅ A new `Stock In` entry exists with quantity `20`
   - ✅ Reference type shows `Purchase Order`
   - ✅ Reason shows `"Received from PO PO-XXXX"`

**Edge cases to test:**

- Only `approved` or `partially_received` POs can be received
- A received PO should have no edit/delete actions available
- The PO view modal should show `quantity_received` values after receiving

---

### Test 6 — Cancel Purchase Order (Draft/Submitted → Cancelled)

**Goal:** Verify POs can be cancelled with confirmation.

1. On PO #3 (Draft — TireMaster Wholesale), click the **three-dots menu** → **Cancel PO**
2. A confirmation modal should appear with negative (red) styling
3. Click **Cancel PO** to confirm
4. Verify:
   - ✅ Success toast: `"PO PO-XXXX cancelled"`
   - ✅ Status changes to `Cancelled`
   - ✅ Edit/Submit/Receive actions disappear for this PO
   - ✅ Delete action may still be available (soft-deletes the cancelled PO)

**Cancel a submitted PO:** 5. Submit PO #4 (PowerBattery) first, then cancel it 6. Verify:

- ✅ Submitted PO can also be cancelled
- ✅ No stock movements were created (since it was never received)

**Edge cases to test:**

- `received` POs cannot be cancelled → no "Cancel PO" option should appear
- `cancelled` POs cannot be cancelled again → no "Cancel PO" option should appear

---

### Test 7 — Delete Purchase Order (Conditional Delete/Deactivate — UC52)

**Goal:** Verify delete behavior matches status-aware rules.

1. On PO #5 (CleanAuto Distributors — Draft), click the **trash icon**
2. A delete confirmation modal should appear
3. Click **Delete** to confirm
4. Verify:
   - ✅ Success toast: `"Purchase order PO-XXXX has been deleted"`
   - ✅ For `draft` PO: record is removed from active list
   - ✅ Stats cards update (Total count decreases)
5. Repeat delete on an `approved` or `partially_received` PO.
6. Verify:
   - ✅ PO is set to `deactivated` instead of hard-removed
   - ✅ PO is hidden from default list but can be found using status filter `deactivated`

**Edge cases to test:**

- `received` POs cannot be deleted → trash icon should not appear for received POs
- Error message: `"Cannot delete a received purchase order. Cancel it instead if needed."`
- Deactivation path applies to progressed-but-not-received POs

---

### Test 8 — Immutability of Received POs

**Goal:** Verify that received POs cannot be modified.

1. Find PO #1 (status: Received)
2. Verify:
   - ✅ No pencil (Edit) icon appears in the Actions column
   - ✅ No trash (Delete) icon appears
   - ✅ No "Submit PO" or "Cancel PO" in the three-dots menu
   - ✅ The three-dots menu itself may be hidden (no available actions)
3. Click the row to open the View modal:
   - ✅ All fields are read-only
   - ✅ `Received At` date is displayed
   - ✅ Items show both `quantity_ordered` and `quantity_received`

---

### Test 9 — Branch Isolation

**Goal:** Verify users only see POs for their assigned branches.

1. Log in as a **POC** assigned to Branch A
2. Navigate to Purchase Orders → should only see POs for Branch A
3. Log in as a **POC** assigned to Branch B
4. Navigate to Purchase Orders → should only see POs for Branch B
5. Log in as **HM** → should see POs across all branches
6. Verify:
   - ✅ Branch filter only shows branches the user has access to
   - ✅ Creating a PO only shows accessible branches in the dropdown
   - ✅ Attempting API access to another branch's PO returns 403

---

### Test 10 — Audit Logging (FR-17)

**Goal:** Verify all PO operations are audit-logged.

1. Navigate to **Audit Logs** page
2. Filter by entity type `PURCHASE_ORDER`
3. Verify entries exist for:
   - ✅ PO creation (action: CREATE)
   - ✅ PO update (action: UPDATE)
   - ✅ PO submission (action: UPDATE with status change to submitted)
   - ✅ PO receive (action: RECEIVE)
   - ✅ PO cancellation (action: CANCEL)
   - ✅ PO deletion (action: DELETE with is_deleted: true)
4. Each audit entry should include:
   - User who performed the action
   - Timestamp
   - Entity type and ID
   - New values (changed fields)

---

### Test 11 — Desktop & Mobile Responsive Views

**Goal:** Verify the page works on both desktop and mobile.

**Desktop (≥768px):**

1. Verify the table view displays with 6 columns: PO Number, Supplier, Total, Branch, Status, Actions
2. Verify table rows are clickable (opens view modal)
3. Verify action icons (Edit, Delete) and three-dots dropdown work correctly

**Mobile (<768px):**

1. Resize browser window to mobile width (or use DevTools)
2. Verify the table switches to card-based layout
3. Each card should show: PO Number, Branch code, Status badge, Total, Supplier, Date
4. Verify card actions (Edit, Delete, More) work correctly
5. Verify modals are scrollable on small screens

---

### Test 12 — Stats Cards Accuracy

**Goal:** Verify summary stats reflect actual data.

After completing all tests above:

1. Count the visible POs in the table
2. Compare with stats cards:
   - ✅ **Total:** matches the count of all non-deleted POs
   - ✅ **Submitted:** matches the count of POs with status `submitted`
   - ✅ **Approved:** matches the count of POs with status `approved`
   - ✅ **Partially Received:** matches the count of POs with status `partially_received`
   - ✅ **Received:** matches the count of POs with status `received`
3. Create a new PO → Total should increment
4. Submit it → Submitted should increment
5. Approve it → Submitted should decrement, Approved should increment
6. Receive partially → Approved should decrement, Partially Received should increment
7. Receive remaining quantity → Partially Received should decrement, Received should increment

---

## Process Flow Summary

```
1. CREATE Purchase Order
   ├── User selects Branch + Supplier + Items from inventory
   ├── System auto-generates PO number (if blank)
   ├── PO created with status = "draft"
   └── Audit log: CREATE

2. SUBMIT Purchase Order
   ├── Draft → Submitted
   ├── PO is now ready for approval
   └── Audit log: UPDATE (status: submitted)

3. APPROVE Purchase Order
   ├── Submitted → Approved
   └── Audit log: UPDATE (status: approved)

4. RECEIVE Purchase Order (Stock-In)
   ├── Approved/Partially Received → Partially Received/Received
   ├── For each PO item:
   │   ├── Create stock_movement (type: stock_in, ref: purchase_order)
   │   ├── Update quantity_received on PO item
   │   └── Inventory on-hand quantity increases
   ├── Set received_at timestamp when fully received
   └── Audit log: RECEIVE

5. CANCEL Purchase Order
   ├── Draft/Submitted → Cancelled
   ├── No stock movements created/reversed
   └── Audit log: CANCEL

6. DELETE Purchase Order (Conditional)
   ├── Draft may be removed from active listing
   ├── Progressed PO may be marked as status = "deactivated"
   ├── Cannot delete received POs
   └── Audit log: DELETE
```

---

## Summary Checklist

| Requirement                               | Status |
| ----------------------------------------- | ------ |
| UC49 — Create Purchase Order              | ⬜     |
| UC50 — View Purchase Orders               | ⬜     |
| UC51 — Update Purchase Order              | ⬜     |
| UC52 — Delete (Soft) Purchase Order       | ⬜     |
| PO Status Flow (Draft→Submitted→Approved→Partially Received→Received) | ⬜     |
| Stock-In on PO Receive                    | ⬜     |
| Stock Movement Records Created            | ⬜     |
| Cancel PO (Draft/Submitted only)          | ⬜     |
| Received POs Immutable                    | ⬜     |
| PO Number Auto/Manual Valid Behavior      | ⬜     |
| Approval Step Before Receive              | ⬜     |
| Partial Receive Lifecycle                 | ⬜     |
| Deactivated Status via Conditional Delete | ⬜     |
| Branch Isolation (RLS)                    | ⬜     |
| RBAC Enforcement                          | ⬜     |
| Audit Logging (FR-17)                     | ⬜     |
| Search & Filter Functionality             | ⬜     |
| Pagination                                | ⬜     |
| Desktop Table View                        | ⬜     |
| Mobile Card View                          | ⬜     |
| Validation — Mandatory Fields             | ⬜     |
| Validation — No Negative Quantities       | ⬜     |
| Validation — No Duplicate Items in PO     | ⬜     |

