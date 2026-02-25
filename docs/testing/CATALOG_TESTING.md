# Catalog Management — Testing Guide & Process Documentation

---

## How Catalog Management Works in the System

### Overview

The Catalog Management module manages the master list of services, products, and packages offered by the business. Catalog items serve as the building blocks for job orders — when creating a JO, users select items from the catalog and pricing is resolved from pricing matrices. Items can be scoped to a specific branch or marked as global (available to all branches).

### Key Business Rules

1. **Three item types** — `service`, `product`, `package`.
2. **Global vs branch-scoped** — items can be either global (available to all branches) or scoped to a single branch. Only HM can create, edit, or delete global items and toggle the global flag.
3. **Base price required** — must be a non-negative number.
4. **Conditional delete** — attempts hard delete first. If the item is referenced by job order items (FK constraint), it falls back to soft delete (deactivation).
5. **Branch visibility** — non-HM users see global items plus items in their assigned branches.
6. **Card grid display** — items display as cards in a responsive grid, not a table.
7. **R role is view-only** — Receptionists can see catalog items but cannot create, edit, or delete.

### RBAC (Roles & Permissions)

| Action              | HM  | POC | JS  |  R  |  T  |
| ------------------- | :-: | :-: | :-: | :-: | :-: |
| View Catalog        | ✅  | ✅  | ✅  | ✅  |  —  |
| Create Item         | ✅  | ✅  | ✅  |  —  |  —  |
| Update Item         | ✅  | ✅  | ✅  |  —  |  —  |
| Delete Item         | ✅  | ✅  | ✅  |  —  |  —  |
| Manage Global Items | ✅  |  —  |  —  |  —  |  —  |

### API Endpoints

| Method   | Endpoint               | Description                              |
| -------- | ---------------------- | ---------------------------------------- |
| `GET`    | `/api/catalog`         | List catalog items (paginated, filtered) |
| `GET`    | `/api/catalog/:itemId` | Get single catalog item                  |
| `POST`   | `/api/catalog`         | Create catalog item                      |
| `PUT`    | `/api/catalog/:itemId` | Update catalog item                      |
| `DELETE` | `/api/catalog/:itemId` | Delete/deactivate catalog item           |

---

## Sample Data to Populate

Use the **"Add New Catalog"** button. Create each item below:

| #   | Name                         | Type    | Base Price | Branch | Global |
| --- | ---------------------------- | ------- | ---------- | ------ | ------ |
| 1   | Oil Change Service           | Service | 500        | —      | ✅ Yes |
| 2   | Brake Pad Replacement        | Service | 1,200      | MAIN   | No     |
| 3   | Shell Helix Ultra 5W-40 (1L) | Product | 650        | —      | ✅ Yes |
| 4   | Engine Tune-Up Package       | Package | 3,500      | NORTH  | No     |
| 5   | Wheel Alignment              | Service | 800        | SOUTH  | No     |
| 6   | Air Filter Replacement       | Service | 350        | —      | ✅ Yes |

> **Note:** Items #1, #3, and #6 are global — only HM can create these. Items #2, #4, #5 are branch-scoped.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM** (for global items) or **POC/JS** (for branch-scoped items)
- At least one branch exists

---

### Test 1 — View Catalog Items

**Goal:** Verify the catalog card grid loads correctly.

1. Navigate to **Catalog** from the sidebar
2. Verify the header shows **"Catalog"** with subtitle `"{count} items total"`
3. Verify items display as cards in a responsive grid
4. Each card should show:
   - ✅ **Name** (header, bold)
   - ✅ **"Global"** badge (primary color) or **branch code** badge
   - ✅ **Status** badge ("Active" / "Inactive")
   - ✅ **Base price** (formatted as PHP currency)
   - ✅ **Type** label (Service / Product / Package)
   - ✅ **Description** (truncated to 2 lines, if present)
   - ✅ Edit and Delete buttons (hidden on global items for non-HM users)

---

### Test 2 — Create Branch-Scoped Catalog Item

**Goal:** Verify a branch-scoped item can be created.

1. Log in as **POC** or **JS**
2. Click **"Add New Catalog"** → the **"Add Catalog Item"** modal opens
3. Fill in the form:
   - **Section: "Item Information"**
     - Name: `Brake Pad Replacement`
     - Type: `Service`
     - Base Price: `1200`
     - Description: (optional)
   - **Section: "Scope"**
     - Verify the **Global Item** toggle is NOT visible (only HM sees it)
     - Branch: `MAIN`
4. Click **"Create Catalog"**
5. Verify:
   - ✅ Toast: `"Catalog item created successfully"`
   - ✅ Card appears with `MAIN` branch badge

**Edge cases to test:**

- Empty Name → error: `"Name is required"`
- Negative Base Price → error: `"Base price must be a valid non-negative number"`
- Empty Base Price → error: `"Base price must be a valid non-negative number"`
- Empty Branch (when not global) → error: `"Select a branch or mark as global"`

---

### Test 3 — Create Global Catalog Item (HM Only)

**Goal:** Verify only HM can create global items.

1. Log in as **HM**
2. Click **"Add New Catalog"**
3. In the **"Scope"** section:
   - Verify the **Global Item** toggle IS visible
   - Toggle it to **ON** → the branch dropdown disappears
4. Fill in Name: `Oil Change Service`, Type: `Service`, Base Price: `500`
5. Click **"Create Catalog"**
6. Verify:
   - ✅ Toast: `"Catalog item created successfully"`
   - ✅ Card shows a **"Global"** badge (not a branch code)
7. Log in as **POC** → verify the global item is visible but Edit/Delete buttons are **hidden**

---

### Test 4 — View Catalog Item Details

**Goal:** Verify the view modal shows all item data.

1. Click on a catalog card to open the view modal
2. Verify the **"Catalog Item Details"** modal shows:
   - ✅ **"Item Information"** — Name, Type, Base Price (formatted), Status, Description (all disabled)
   - ✅ **"Scope"** — shows "Global (all branches)" or branch name + code
   - ✅ **"Timestamps"** — Created and Updated dates

---

### Test 5 — Update Catalog Item

**Goal:** Verify catalog item details can be edited.

1. Click the **Edit** (pencil) button on a branch-scoped card
2. Verify the **"Edit Catalog Item"** modal opens with pre-filled data
3. Change the **Name**, **Base Price**, and **Status** (e.g., to Inactive)
4. Click **"Save Changes"**
5. Verify:
   - ✅ Toast: `"Catalog item updated successfully"`
   - ✅ Card reflects the changes

**Global item restrictions (non-HM):**

- Edit and Delete buttons should be hidden on global items for POC/JS
- Backend enforcement: `"Only Higher Management can edit global catalog items"`

---

### Test 6 — Search Catalog Items

**Goal:** Verify search works.

1. Type `"Oil"` → Oil Change Service appears (matched on name)
2. Type `"product"` → product-type items appear (matched on type)
3. Clear the search → all items reappear

---

### Test 7 — Filter Catalog Items

**Goal:** Verify filter functionality.

1. **Filter by Status**: select `"Active"` → only active items shown
2. **Filter by Type**: select `"Service"` → only service items shown
3. **Filter by Branch**: select `"Global"` → only global items shown
4. Select a specific branch → only branch-scoped items for that branch shown
5. Reset filters → all items shown
6. Verify pagination: 12 items per page

---

### Test 8 — Delete Catalog Item (No References — Hard Delete)

**Goal:** Verify a catalog item not referenced by job orders is permanently deleted.

1. Find a catalog item that has NOT been used in any job order
2. Click the **Delete** (trash) button
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Catalog Item"**
   - ✅ Message: `"Are you sure you want to delete {name} ({type})?"`
   - ✅ Warning: `"This item will be permanently removed. If it is referenced by other records, it will be deactivated instead."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast: `"Catalog item deleted successfully"`
   - ✅ Card disappears from the grid

---

### Test 9 — Delete Catalog Item (Referenced — Soft Delete / Deactivation)

**Goal:** Verify a catalog item used in job orders is deactivated.

1. Create a job order using a catalog item (via Job Order Management)
2. Return to Catalog and click **Delete** on that item
3. Confirm the deletion
4. Verify:
   - ✅ Toast (info): `"Catalog item is referenced by job orders and has been deactivated instead"`
   - ✅ The card remains but shows **"Inactive"** status

---

### Test 10 — Global Item RBAC Enforcement

**Goal:** Verify non-HM users cannot manage global items.

1. Log in as **POC** or **JS**
2. Navigate to Catalog
3. Find a global item (shows "Global" badge)
4. Verify:
   - ✅ No Edit (pencil) button visible
   - ✅ No Delete (trash) button visible
5. Log in as **HM** → verify Edit and Delete buttons ARE visible on global items

---

### Test 11 — Branch Scoping

**Goal:** Verify visibility rules.

1. Log in as a non-HM user assigned to MAIN branch
2. Verify:
   - ✅ Global items are visible
   - ✅ MAIN branch items are visible
   - ✅ NORTH/SOUTH branch items are NOT visible
3. Log in as **HM** → all items across all branches are visible

---

### Test 12 — Audit Logging

**Goal:** Verify catalog operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Catalog item creation (action: CREATE)
   - ✅ Catalog item update (action: UPDATE)
   - ✅ Catalog item deletion or deactivation (action: DELETE / UPDATE)

---

## Summary Checklist

| Requirement                                  | Status |
| -------------------------------------------- | ------ |
| View Catalog Items (Card Grid)               | ⬜     |
| Create Branch-Scoped Item                    | ⬜     |
| Create Global Item (HM Only)                 | ⬜     |
| Three Item Types (Service, Product, Package) | ⬜     |
| Base Price Required (Non-Negative)           | ⬜     |
| View Catalog Item Details                    | ⬜     |
| Update Catalog Item                          | ⬜     |
| Global Toggle (HM Only)                      | ⬜     |
| Search (Name, Description, Type)             | ⬜     |
| Filter by Status                             | ⬜     |
| Filter by Type                               | ⬜     |
| Filter by Branch / Global                    | ⬜     |
| Delete — Hard Delete (No References)         | ⬜     |
| Delete — Soft Delete (Referenced by JOs)     | ⬜     |
| Global Item RBAC (Non-HM Cannot Edit/Delete) | ⬜     |
| Branch Scoping (Global + Own Branch)         | ⬜     |
| R Role View-Only                             | ⬜     |
| Pagination (12 per page)                     | ⬜     |
| Audit Logging                                | ⬜     |
