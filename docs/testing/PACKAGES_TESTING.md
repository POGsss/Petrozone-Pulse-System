# Packages Management — Testing Guide & Process Documentation

---

## How Packages Management Works in the System

### Overview

The Packages Management module manages the master list of service/product items offered by the business. Package items are **global** (no branch scoping) and serve as the building blocks for job orders. When creating a JO, users select package items and pricing is resolved from pricing matrices. Each package item can be linked to one or more inventory items, forming a template of materials consumed when that service is performed.

### Key Business Rules

1. **Global items** — all Package items are visible to all users regardless of branch assignment. There is no branch scoping or global toggle.
2. **Inventory links** — Package items can be linked to inventory items (template associations). These links define which materials are consumed when the Package item is added to a job order. Links can be managed during creation (Add modal) or editing (Edit modal).
3. **No base price** — Package items do not have a base price. Pricing is handled entirely by the Pricing Matrix module (light/heavy/extra\_heavy prices by vehicle class).
4. **No item types** — Package items have no type classification (no service/product/package). They are all generic items.
5. **Conditional delete** — attempts hard delete first. If the item is referenced by job order items (FK constraint), it falls back to soft delete (deactivation).
6. **Card grid display** — items display as cards in a responsive grid, not a table.
7. **Two actions per card** — Edit and Delete buttons appear directly on each card (no "More" dropdown).

### RBAC (Roles & Permissions)

| Action                     | HM  | POC | JS  |  R  |  T  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Packages              | ✅  | ✅  | ✅  | ✅  |  —  |
| Create Item                | ✅  | ✅  | ✅  |  —  |  —  |
| Update Item                | ✅  | ✅  | ✅  |  —  |  —  |
| Delete Item                | ✅  | ✅  | ✅  |  —  |  —  |
| Manage Inventory Links     | ✅  | ✅  | ✅  |  —  |  —  |

> **Note:** T (Technician) does not have access to the Packages page at all. R (Receptionist) is view-only.

### API Endpoints

| Method   | Endpoint                                          | Description                          |
| -------- | ------------------------------------------------- | ------------------------------------ |
| `GET`    | `/api/packages`                                    | List Package items (filtered)        |
| `GET`    | `/api/packages/:id`                                | Get single Package item              |
| `POST`   | `/api/packages`                                    | Create Package item                  |
| `PUT`    | `/api/packages/:itemId`                            | Update Package item                  |
| `DELETE` | `/api/packages/:itemId`                            | Delete/deactivate Package item       |
| `GET`    | `/api/packages/:itemId/inventory-links`            | Get linked inventory items           |
| `POST`   | `/api/packages/:itemId/inventory-links`            | Link an inventory item               |
| `DELETE` | `/api/packages/:itemId/inventory-links/:linkId`    | Remove an inventory link             |

---

## Sample Data to Populate

Use the **"Add New Package"** button. Create each item below:

| #   | Name                         | Description                               | Inventory Items to Link                             |
| --- | ---------------------------- | ----------------------------------------- | --------------------------------------------------- |
| 1   | Oil Change Service           | Standard oil change service               | Shell Helix Ultra 5W-40, Denso Oil Filter           |
| 2   | Brake Pad Replacement        | Front brake pad replacement service       | Brembo Brake Pad Set (Front)                        |
| 3   | Engine Tune-Up Package       | Full engine tune-up                       | NGK Spark Plug (Iridium IX)                         |
| 4   | Wheel Alignment              | 4-wheel alignment service                 | _(no inventory)_                                    |
| 5   | Air Filter Replacement       | OEM air filter replacement service        | _(no inventory)_                                    |
| 6   | Tire Replacement             | Tire mounting and balancing               | Bridgestone Ecopia 195/65R15                        |

> **Note:** Items are global — any authorized user (HM/POC/JS) can create them. Inventory links are set during creation in the Add modal.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, or **JS**
- Inventory items exist (see `INVENTORY_TESTING.md`) for linking

---

### Test 1 — View Package Items

**Goal:** Verify the Packages card grid loads correctly.

1. Navigate to **Packages** from the sidebar
2. Verify the header shows **"Packages"** with subtitle `"{count} items total"`
3. Verify items display as cards in a responsive grid (1 / 2 / 3 columns depending on screen width)
4. Each card should show:
   - ✅ **Package icon** with primary-colored background circle
   - ✅ **Name** (bold header text)
   - ✅ **"GLOBAL"** badge (blue/gray)
   - ✅ **Status badge** — `"Active"` (green) or `"Inactive"` (red)
   - ✅ **Inventory count** — e.g., `"2 inventory items"` or `"0 inventory items"`
   - ✅ **Description** (truncated to 2 lines, or `"No description"` if empty)
   - ✅ **Edit** (pencil) and **Delete** (trash) buttons — visible only for HM/POC/JS
5. Clicking a card (not on Edit/Delete) opens the **View modal**

---

### Test 2 — Create Package Item (with Inventory Links)

**Goal:** Verify a Package item can be created with inventory links in the same modal.

1. Log in as **HM**, **POC**, or **JS**
2. Click **"Add New Package"** → the **"Add Package Item"** modal opens
3. Fill in the form:
   - **Section: "Item Information"**
     - Name: `Oil Change Service` _(required)_
     - Description: `Standard oil change service` _(optional)_
   - **Section: "Inventory Items"**
     - The dropdown shows active inventory items with format: `{name} ({sku}) — ₱{cost}`
     - Select `Shell Helix Ultra 5W-40 (OIL-SHU540) — ₱650.00` → click the **"+"** button
     - Select `Denso Oil Filter (FLT-DNSO01) — ₱280.00` → click the **"+"** button
     - Verify both items appear in the **draft list** below the dropdown
     - Each drafted item shows: item name, SKU, cost/unit
     - Each has an **"×"** button to remove it from the draft
4. Click **"Create Package"**
5. Verify:
   - ✅ Toast: `"Package item created successfully"`
   - ✅ Card appears in the grid with `"2 inventory items"` in the details
   - ✅ Modal closes

**Edge cases to test:**

- Submit with empty Name → validation error: `"Name is required"`
- Create with zero inventory links → should succeed (inventory is optional)
- Try to add the same inventory item twice → item should not appear in dropdown after being drafted
- Create item with only a description and no inventory → succeeds

---

### Test 3 — View Package Item Details

**Goal:** Verify the view modal shows all item data including linked inventory.

1. Click on a package card (not on the Edit/Delete buttons) to open the view modal
2. Verify the **"Package Item Details"** modal shows:
   - ✅ **"Item Information"** section:
     - Name input (read-only / disabled)
     - Status dropdown (read-only / disabled) — shows Active or Inactive
     - Description textarea (read-only / disabled)
   - ✅ **"Linked Inventory"** section:
     - Loading skeleton while fetching link data
     - List of linked inventory items, each showing:
       - **Item name** (bold)
       - `SKU: {sku} · ₱{cost} / {unit}`
     - Scrollable container if many items
     - If no links: `"No inventory items linked to this Package item."`
   - ✅ **"Timestamps"** section:
     - Created At and Updated At dates

---

### Test 4 — Edit Package Item (with Live Inventory Management)

**Goal:** Verify Package item details and inventory links can be edited.

1. Click the **Edit** (pencil icon) button on a package card
2. Verify the **"Edit Package Item"** modal opens with pre-filled data
3. Verify the modal has two sections:
   - **"Item Information"** — Name, Status (dropdown: active/inactive), Description
   - **"Inventory Items"** — Dropdown + "+" button, list of currently linked items
4. **Edit the item info:**
   - Change the **Name** to a new value
   - Change the **Status** to `Inactive`
   - Modify the **Description**
5. **Add an inventory link:**
   - Select an inventory item from the dropdown → click "+"
   - Verify toast: `"Inventory item linked successfully"` (API call happens immediately)
   - Verify the item appears in the list right away
6. **Remove an inventory link:**
   - Click the **"×"** button next to an existing linked item
   - Verify toast: `"Inventory link removed successfully"` (API call happens immediately)
   - Verify the item disappears from the list
7. Click **"Save Changes"**
8. Verify:
   - ✅ Toast: `"Package item updated successfully"`
   - ✅ Card reflects the updated name, status, and inventory count
   - ✅ Modal closes

**Important:** Inventory link changes in the Edit modal are **live** — they are persisted via API immediately when you click +/×. This differs from the Add modal where links are drafted locally and submitted together.

---

### Test 5 — Search Package Items

**Goal:** Verify search filters items correctly.

1. Type `"Oil"` in the search field → only items with "Oil" in name or description appear
2. Type a description keyword → matching items appear
3. Clear the search → all items reappear
4. Verify search is case-insensitive

---

### Test 6 — Filter by Status

**Goal:** Verify status filter functionality.

1. Select **"Active"** from the status filter → only active items shown
2. Select **"Inactive"** → only inactive items shown
3. Select **"All"** or reset → all items shown
4. Combine search + status filter → check correct combined results

---

### Test 7 — Pagination

**Goal:** Verify pagination works correctly.

1. Create more than 12 Package items
2. Verify only **12 items per page** are displayed
3. Click the next page button → the next batch of items loads
4. Verify page indicator shows correct current page and total

---

### Test 8 — Delete Package Item (No FK References — Hard Delete)

**Goal:** Verify a Package item not referenced by job orders is permanently deleted.

1. Find a Package item that has **not** been used in any job order
2. Click the **Delete** (trash icon) button on the card
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Package Item"**
   - ✅ Message: `"Are you sure you want to delete {name}?"`
   - ✅ Warning: `"This item will be permanently removed. If it is referenced by other records, it will be deactivated instead."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast: `"Package item deleted successfully"`
   - ✅ Card disappears from the grid

---

### Test 9 — Delete Package Item (FK Reference Exists — Soft Delete / Deactivation)

**Goal:** Verify a Package item used in job orders is deactivated instead of deleted.

1. Create a job order that references a Package item (via Job Order Management)
2. Return to Packages and click **Delete** on that package item
3. Confirm the deletion
4. Verify:
   - ✅ Toast (info): `"Package item is referenced by other records and has been deactivated instead of deleted."`
   - ✅ The card remains in the grid but now shows **"Inactive"** status badge

---

### Test 10 — RBAC Enforcement

**Goal:** Verify access control per role.

1. **Log in as R (Receptionist):**
   - Navigate to Packages
   - ✅ Cards are visible, clicking a card opens the View modal
   - ✅ **No** "Add New Package" button visible
   - ✅ **No** Edit or Delete buttons on cards
2. **Log in as T (Technician):**
   - ✅ Package should **not** appear in the sidebar navigation
3. **Log in as HM, POC, or JS:**
   - ✅ "Add New Package" button is visible
   - ✅ Edit and Delete buttons are visible on cards
   - ✅ All CRUD operations work

---

### Test 11 — Audit Logging

**Goal:** Verify Package operations are logged.

1. Perform create, update, delete operations on Package items
2. Navigate to **Audit Logs**
3. Verify entries exist for:
   - ✅ Package item creation (action: CREATE, entity_type: package_items)
   - ✅ Package item update (action: UPDATE)
   - ✅ Package item deletion or deactivation (action: DELETE / UPDATE)

---

## Summary Checklist

| Requirement                                  | Status |
| -------------------------------------------- | ------ |
| View Package Items (Card Grid)               | ⬜     |
| Inventory Count on Cards                     | ⬜     |
| "GLOBAL" Badge on Cards                      | ⬜     |
| Create Item with Name + Description          | ⬜     |
| Add Inventory Links in Add Modal (Draft)     | ⬜     |
| View Item Details with Linked Inventory      | ⬜     |
| Edit Item (Name, Status, Description)        | ⬜     |
| Edit Inventory Links (Live Add/Remove)       | ⬜     |
| Search (Name, Description)                   | ⬜     |
| Filter by Status                             | ⬜     |
| Pagination (12 per page)                     | ⬜     |
| Delete — Hard Delete (No References)         | ⬜     |
| Delete — Soft Delete (Referenced by JOs)     | ⬜     |
| RBAC (HM/POC/JS manage, R view-only, T N/A) | ⬜     |
| Audit Logging                                | ⬜     |
