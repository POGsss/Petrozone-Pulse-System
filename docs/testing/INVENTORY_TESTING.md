# Inventory Module — Testing Guide & Sample Data

## How Inventory Works in the Current System

Inventory items are branch-scoped and support active/inactive lifecycle, stock movements, and approval-time stock validation in job orders.

### Key Business Rules

1. Inventory records are branch-scoped for non-HM users.
2. SKU must be unique per branch.
3. Stock cannot go below zero.
4. Stock-in and stock-adjust actions create movement history entries.
5. Job order approval deducts stock for inventory lines.
6. Job order approval is blocked when required inventory stock is insufficient.
7. Cancelling draft/pending job orders does not change stock.

### RBAC (Roles & Permissions)

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| View inventory list/details | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create and update inventory items | ✅ | ✅ | ✅ | ❌ | ❌ |
| Deactivate inventory items | ✅ | ✅ | ✅ | ❌ | ❌ |
| Stock in | ✅ | ✅ | ✅ | ❌ | ❌ |
| Stock adjustment | ✅ | ✅ | ❌ | ❌ | ❌ |

### API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/inventory` | List inventory items |
| GET | `/api/inventory/:id` | Get inventory item details |
| POST | `/api/inventory` | Create inventory item |
| PUT | `/api/inventory/:id` | Update inventory item |
| DELETE | `/api/inventory/:id` | Deactivate inventory item |
| POST | `/api/inventory/:id/stock-in` | Add stock |
| POST | `/api/inventory/:id/adjust` | Adjust stock |
| GET | `/api/inventory/:id/movements` | View movement history |

---

## Sample Data to Populate

Use the **Add New Item** button on the Inventory page. Enter each item below into the form.

| #   | Item Name                             | SKU Code   | Category          | Unit of Measure | Cost Price | Reorder Threshold | Initial Stock |
| --- | ------------------------------------- | ---------- | ----------------- | --------------- | ---------- | ----------------- | ------------- |
| 1   | Shell Helix Ultra 5W-40 (1L)          | OIL-SHU540 | Oil & Lubricants  | Bottles         | 650        | 10                | 25            |
| 2   | Denso Oil Filter (Universal)          | FLT-DNSO01 | Filters           | Pieces (pcs)    | 280        | 8                 | 15            |
| 3   | Brembo Brake Pad Set (Front)          | BRK-BRM01  | Brake Parts       | Sets            | 2400       | 4                 | 6             |
| 4   | NGK Spark Plug (Iridium IX)           | ENG-NGK01  | Engine Parts      | Pieces (pcs)    | 450        | 12                | 20            |
| 5   | Bridgestone Ecopia 195/65R15          | TIR-BSE195 | Tires             | Pieces (pcs)    | 4200       | 4                 | 8             |
| 6   | Motolite Gold Battery (NS60)          | BAT-MLG60  | Batteries         | Pieces (pcs)    | 5500       | 3                 | 5             |
| 7   | Blade Car Freshener (Lemon)           | ACC-BCFL01 | Accessories       | Pieces (pcs)    | 85         | 20                | 50            |
| 8   | Armor All Multi-Purpose Cleaner 500ml | CLN-AAM500 | Cleaning Supplies | Bottles         | 320        | 6                 | 12            |

> **Note:** Select the appropriate branch when adding each item. For multi-branch testing, add some items to Branch A and others to Branch B.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend server is running (`npm run dev` from the `backend/` folder)
- Frontend dev server is running (`npm run dev` from the `frontend/` folder)
- You are logged in as a user with **HM** (Head Mechanic) or **POC** (Parts Order Clerk) role
- The Supabase database has the inventory migration applied (already done)

---

### Test 1 — Add Inventory Items (UC45)

**Goal:** Verify items can be created with all mandatory fields.

1. Navigate to **Inventory** from the sidebar
2. Click the **Add New Item** button (top-right)
3. Fill in the form with Sample Data item #1 (Shell Helix Ultra 5W-40)
4. Click **Create Item**
5. Verify:
   - ✅ Success toast appears
   - ✅ Item appears in the table
   - ✅ Stock column shows `25`
   - ✅ Status shows `Active`
6. Repeat for all 8 sample items

**Edge cases to test:**

- Try submitting with empty Item Name → should show validation error
- Try adding a duplicate SKU in the same branch → should fail
- Try entering a negative cost price → should be blocked

---

### Test 2 — View Inventory (UC46)

**Goal:** Verify inventory list loads correctly with search and filters.

1. After adding all 8 items, verify:
   - ✅ All 8 items appear in the table
   - ✅ Stats cards show: All Items = 8, Active = 8, Low Stock = 0
2. **Search:** Type `"NGK"` in the search bar → only the Spark Plug item should appear
3. **Filter by Category:** Select `Tires` from Category filter → only Bridgestone tire should show
4. **Filter by Status:** Select `Active` → all items visible. Select `Inactive` → none visible
5. **Combine filters:** Search `"OIL"` + Category `Oil & Lubricants` → Shell Helix only
6. **Reset:** Click "Reset" → all items visible again
7. **View Details:** Click on any table row → View modal opens showing:
   - ✅ Item name, SKU, category, UOM, cost price
   - ✅ Current stock, reorder threshold, status
   - ✅ Branch assignment, created/updated dates

---

### Test 3 — Update Inventory (UC47)

**Goal:** Verify item details can be edited.

1. Click the **pencil icon** on the Blade Car Freshener row
2. Change the item name to `"Blade Car Freshener (Lavender)"`
3. Change the cost price to `90`
4. Click **Save Changes**
5. Verify:
   - ✅ Success toast appears
   - ✅ Updated name and price reflected in the table
   - ✅ Movement history is not affected (edits don't create movements)

---

### Test 4 — Delete / Deactivate Inventory (UC48)

**Goal:** Verify soft delete works correctly.

1. Click the **trash icon** on the Armor All Multi-Purpose Cleaner row
2. Confirm the deactivation in the modal
3. Verify:
   - ✅ Item shows `Inactive` badge in Status column
   - ✅ Stats card updates: Active count decreases by 1
   - ✅ The Stock In and Adjust icons disappear for this item
   - ✅ Item still visible when filtering by "All Status" or "Inactive"
   - ✅ Item hidden when filtering by "Active" only

---

### Test 5 — Stock In (Manual Receiving)

**Goal:** Verify manual stock additions work.

1. Click the **green up-arrow icon** (Stock In) on the Denso Oil Filter row
2. Enter Quantity: `10`
3. Enter Reason: `"Received from supplier PO-2024-001"`
4. Click **Add Stock**
5. Verify:
   - ✅ Success toast appears
   - ✅ Stock column updates from `15` to `25`
   - ✅ Stats remain consistent

---

### Test 6 — Stock Adjustment (HM/POC Only)

**Goal:** Verify manual stock corrections with audit trail.

**6a — Decrease adjustment:**

1. Click the **blue down-arrow icon** (Adjust) on the Bridgestone tire row
2. Select **Decrease Stock**
3. Enter Quantity: `2`
4. Enter Reason: `"Physical count discrepancy — 2 units damaged"`
5. Click **Adjust Stock**
6. Verify:
   - ✅ Stock updates from `8` to `6`
   - ✅ Success toast appears

**6b — Increase adjustment:**

1. Open Adjust modal for the same tire item
2. Select **Increase Stock**
3. Enter Quantity: `1`
4. Enter Reason: `"Found 1 unit in secondary storage"`
5. Click **Adjust Stock**
6. Verify:
   - ✅ Stock updates from `6` to `7`

**6c — Prevent negative stock:**

1. Open Adjust modal for Brembo Brake Pad (stock = 6)
2. Select **Decrease Stock** → Quantity: `100`
3. Enter a reason and submit
4. Verify:
   - ✅ Error message: cannot reduce stock below zero

**6d — RBAC check:**

1. Log in as a user with **JS** (Job Specialist) role
2. Navigate to Inventory
3. Verify:
   - ✅ The Adjust (down-arrow) icon is **not visible** for JS users
   - ✅ Stock In (up-arrow) icon **is visible** for JS users

---

### Test 7 — Movement History

**Goal:** Verify all stock movements are recorded.

1. Click the **clock/history icon** on the Denso Oil Filter row
2. The Movement History modal should show entries like:
   - `Stock In` — qty `15` — reference `Purchase Order` (from initial stock)
   - `Stock In` — qty `10` — reference `Purchase Order` — reason `Received from supplier PO-2024-001`
3. Click history on the Bridgestone tire → should show:
   - `Stock In` — qty `8` (initial)
   - `Stock Out` / `Adjustment` — qty `2` (decrease)
   - `Stock In` / `Adjustment` — qty `1` (increase)
4. Verify:
   - ✅ Each entry has a timestamp, type badge, quantity, reference type, and reason
   - ✅ All mutations are recorded — nothing missing

---

### Test 8 — Low-Stock Dashboard Indicator (FR-4)

**Goal:** Verify low-stock items appear on the dashboard.

1. Pick the NGK Spark Plug (stock = 20, reorder threshold = 12)
2. Use **Adjust Stock → Decrease** three times to bring stock down to `10` (below threshold of 12)
3. Navigate to the **Dashboard Home** page (click the main dashboard)
4. Verify:
   - ✅ A warning card appears showing the NGK Spark Plug as a low-stock item
   - ✅ The "Low Stock" stat card on the Inventory page shows `1`
5. Click **View all →** on the warning card → navigates to Inventory page

---

### Test 9 — Stock Deduction on Job Order Approval (FR-3)

**Goal:** Verify automatic stock deduction when a JO is approved.

> **How it works:** On approval, the system aggregates all inventory usage from job order inventory lines (including package vehicle-specific inventory additions) and creates `stock_out` movements per inventory item.

1. Ensure required inventory items exist with sufficient stock:
   - Shell Helix Ultra 5W-40 (1L)
   - Denso Oil Filter
2. Go to **Job Orders** → Create a new Job Order
3. Add inventory lines requiring Shell Helix ×2 and Denso Filter ×2
4. Request and approve the Job Order (as R or T)
5. Navigate back to **Inventory**
6. Verify:
   - ✅ Shell Helix Ultra stock decreased by 2 (e.g., `25` → `23`)
   - ✅ Denso Oil Filter stock decreased by 2 (e.g., `15` → `13`)
   - ✅ Movement History for each item shows a `Stock Out` entry with `reference_type: "job_order"` and `reference_id` = the JO ID

**Test insufficient stock block:**

1. Adjust Shell Helix stock down to `1`
2. Create a JO with an inventory line needing Shell Helix quantity `5`
3. Try to approve it
4. Verify:
   - ✅ Approval is **blocked** with error: `"Insufficient stock for Shell Helix Ultra 5W-40 (1L): need 5 but only 1 available"`

---

### Test 10 — Cancellation Does Not Affect Stock (FR-3)

**Goal:** Verify that cancelling a JO does **not** trigger any stock changes, since cancellation is only allowed from `draft` or `pending_approval` (both pre-approval, meaning stock was never deducted).

> **How it works:** Stock is only deducted when a JO is **approved**. Cancellation is restricted to `draft` and `pending_approval` statuses only. Since stock has not been deducted at those stages, no stock restoration is needed or performed.

1. Create a JO with items and request approval (status = `pending_approval`)
2. Note current stock levels (e.g., Shell Helix = 23, Denso Filter = 13)
3. Cancel the `pending_approval` JO (provide a cancellation reason)
4. Navigate back to **Inventory**
5. Verify:
   - ✅ Stock levels remain **unchanged** (Shell Helix still 23, Denso Filter still 13)
   - ✅ No new `stock_in` or `stock_out` movements were created
   - ✅ Cannot cancel an `approved` JO — cancel option is not available for post-approval statuses

---

### Test 11 — Audit Logging (FR-17)

**Goal:** Verify all inventory mutations are audit-logged.

1. Navigate to **Audit Logs** page
2. Filter or search for recent entries
3. Verify entries exist for:
   - ✅ Item creation
   - ✅ Item update
   - ✅ Item deactivation
   - ✅ Stock adjustments
   - ✅ Stock-in additions

---

### Test 12 — Branch Isolation

**Goal:** Verify users only see inventory for their assigned branch.

1. Log in as a **POC** assigned to Branch A
2. Navigate to Inventory → should only see items for Branch A
3. Log in as a **POC** assigned to Branch B
4. Navigate to Inventory → should only see items for Branch B
5. Log in as **HM** → should see items across all branches

---

## Summary Checklist

| Requirement                                 | Status |
| ------------------------------------------- | ------ |
| UC45 — Add Inventory                        | ⬜     |
| UC46 — View Inventory                       | ⬜     |
| UC47 — Update Inventory                     | ⬜     |
| UC48 — Delete (Soft) Inventory              | ⬜     |
| FR-3 — Stock Deduction on JO Approval       | ⬜     |
| FR-3 — Block Approval on Insufficient Stock | ⬜     |
| FR-3 — No Stock Change on JO Cancellation   | ⬜     |
| FR-4 — Low-Stock Dashboard Indicator        | ⬜     |
| FR-6 — View Current Stock Levels            | ⬜     |
| Manual Stock In                             | ⬜     |
| Manual Stock Adjustment (HM/POC)            | ⬜     |
| Movement History Ledger                     | ⬜     |
| SKU Uniqueness per Branch                   | ⬜     |
| No Negative Stock                           | ⬜     |
| Audit Logging                               | ⬜     |
| Branch Isolation (RLS)                      | ⬜     |
| RBAC Enforcement                            | ⬜     |
