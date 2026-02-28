# Pricing Matrices — Testing Guide & Process Documentation

---

## How Pricing Matrices Works in the System

### Overview

The Pricing Matrices module defines vehicle-class-based pricing rules for catalog items. Each pricing matrix maps a catalog item to three price tiers: **light**, **heavy**, and **extra heavy** — corresponding to the vehicle class selected on a job order. When a catalog item is added to a JO, the system resolves the active pricing matrix to determine the labor price based on the vehicle class.

Pricing matrices are **global** (no branch scoping). There can be only **one active pricing matrix per catalog item** at any time.

### Key Business Rules

1. **3-tier pricing** — each matrix has `light_price`, `heavy_price`, and `extra_heavy_price` (all required, must be ≥ 0).
2. **One active per catalog item** — creating or activating a pricing matrix when another active one exists for the same catalog item results in a 409 conflict error.
3. **Global scope** — pricing matrices are not scoped to branches. Any user with view access can see all matrices.
4. **No pricing types** — there are no labor/packaging type distinctions. Each matrix represents a single unified pricing rule.
5. **Resolve endpoint** — `GET /api/pricing/resolve/:catalogItemId` returns the active pricing for a given catalog item, or `null` if no active matrix exists.

### RBAC (Roles & Permissions)

| Action                     | HM  | POC | JS  |  R  |  T  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Pricing Matrices      | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create Pricing Rule        | ✅  | ✅  | ✅  | ✅  |  —  |
| Update Pricing Rule        | ✅  | ✅  | ✅  | ✅  |  —  |
| Delete Pricing Rule        | ✅  | ✅  | ✅  | ✅  |  —  |

> **Note:** T (Technician) is view-only for pricing.

### API Endpoints

| Method   | Endpoint                                   | Description                                   |
| -------- | ------------------------------------------ | --------------------------------------------- |
| `GET`    | `/api/pricing`                             | List pricing matrices (filtered, paginated)   |
| `GET`    | `/api/pricing/:id`                         | Get single pricing matrix                     |
| `GET`    | `/api/pricing/resolve/:catalogItemId`      | Resolve active pricing for a catalog item     |
| `POST`   | `/api/pricing/resolve-bulk`                | Bulk resolve pricing for multiple items       |
| `POST`   | `/api/pricing`                             | Create pricing matrix                         |
| `PUT`    | `/api/pricing/:id`                         | Update pricing matrix                         |
| `DELETE` | `/api/pricing/:id`                         | Delete pricing matrix                         |

---

## Sample Data to Populate

Use the **"Add Pricing Rule"** button. Create each pricing rule below:

| #   | Catalog Item              | Light Price | Heavy Price | Extra Heavy Price | Status   |
| --- | ------------------------- | ----------: | ----------: | ----------------: | -------- |
| 1   | Oil Change Service        |     500.00  |     800.00  |          1,200.00 | Active   |
| 2   | Brake Pad Replacement     |     700.00  |   1,000.00  |          1,500.00 | Active   |
| 3   | Engine Tune-Up Package    |   1,200.00  |   1,800.00  |          2,500.00 | Active   |
| 4   | Wheel Alignment           |     400.00  |     600.00  |            900.00 | Active   |
| 5   | Air Filter Replacement    |     200.00  |     350.00  |            500.00 | Active   |
| 6   | Tire Replacement          |     300.00  |     500.00  |            800.00 | Inactive |

> **Note:** Ensure the catalog items above exist first (see `CATALOG_TESTING.md`). Item 6 is set to Inactive intentionally for testing.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, **JS**, or **R**
- Catalog items exist (see `CATALOG_TESTING.md`)

---

### Test 1 — View Pricing Matrices

**Goal:** Verify the pricing list loads correctly with stats and dual-view display.

1. Navigate to **Pricing** from the sidebar
2. Verify the header shows **"Pricing Matrix"** with subtitle
3. Verify **3 stats cards** at the top:
   - ✅ **All Rules** — total count of pricing matrices
   - ✅ **Active** — count of active matrices
   - ✅ **Inactive** — count of inactive matrices
4. Verify the display supports both:
   - **Mobile view** — cards with pricing details
   - **Desktop view** — table with columns:
     - Catalog Item (name)
     - Light (₱ formatted)
     - Heavy (₱ formatted)
     - Extra Heavy (₱ formatted)
     - Status (Active/Inactive badge)
     - Actions (Edit / Delete buttons)
5. Verify pagination: **5 items per page**

---

### Test 2 — Create Pricing Rule

**Goal:** Verify a pricing matrix can be created with all three vehicle class prices.

1. Click **"Add Pricing Rule"** → the **"Add Pricing Rule"** modal opens
2. Fill in the form:
   - **Catalog Item**: Select `Oil Change Service` from dropdown (shows only active items)
   - **Light Vehicle Price**: `500`
   - **Heavy Vehicle Price**: `800`
   - **Extra Heavy Vehicle Price**: `1200`
   - **Status**: `Active` (default)
3. Click **"Create Pricing Rule"**
4. Verify:
   - ✅ Toast: `"Pricing rule created successfully"`
   - ✅ New row appears in the table with correct values
   - ✅ Stats cards update (All Rules and Active counts increase)
   - ✅ Modal closes

**Edge cases to test:**

- Leave any price field empty → validation: `"All price fields are required"`
- Enter a negative price → validation: `"Prices must be non-negative"`
- Create an active matrix for a catalog item that already has one → ✅ Error toast: `"An active pricing matrix already exists for this catalog item"` (409 conflict)
- Create an inactive matrix for the same catalog item → should succeed

---

### Test 3 — View Pricing Rule

**Goal:** Verify pricing details are visible.

1. Click on a pricing row/card to view it
2. Verify all fields are displayed:
   - ✅ Catalog item name
   - ✅ Light Vehicle Price
   - ✅ Heavy Vehicle Price
   - ✅ Extra Heavy Vehicle Price
   - ✅ Status

---

### Test 4 — Edit Pricing Rule

**Goal:** Verify pricing matrix can be updated.

1. Click the **Edit** button on a pricing row
2. Verify the **"Edit Pricing Rule"** modal opens with pre-filled data:
   - ✅ Catalog Item selector (pre-selected)
   - ✅ Light Vehicle Price
   - ✅ Heavy Vehicle Price
   - ✅ Extra Heavy Vehicle Price
   - ✅ Status dropdown (active/inactive)
3. Change the **Heavy Vehicle Price** to a new value
4. Change the **Status** to Inactive
5. Click **"Save Changes"**
6. Verify:
   - ✅ Toast: `"Pricing rule updated successfully"`
   - ✅ Table row reflects updated values
   - ✅ Stats cards update (Active/Inactive counts adjust)

---

### Test 5 — Delete Pricing Rule

**Goal:** Verify pricing matrix can be permanently deleted.

1. Click the **Delete** button on a pricing row
2. Verify the confirmation modal:
   - ✅ Title: mentions deleting pricing rule
   - ✅ Warning: `"This action cannot be undone. The pricing rule will be permanently removed."`
3. Click **"Delete"**
4. Verify:
   - ✅ Toast: `"Pricing rule deleted successfully"`
   - ✅ Row disappears from the table
   - ✅ Stats cards update

---

### Test 6 — Search and Filter

**Goal:** Verify search and filter functionality.

1. **Search by catalog item name**: Type `"Oil"` in the search field → only matching rows shown
2. **Filter by status**: Select `"Active"` → only active rows shown; `"Inactive"` → only inactive
3. Combine search + filter → verify correct combined results
4. Clear search and reset filter → all items shown
5. Verify search is case-insensitive

---

### Test 7 — One Active Per Catalog Item (Conflict Detection)

**Goal:** Verify the system prevents duplicate active matrices for the same catalog item.

1. Create an **Active** pricing rule for `Oil Change Service`
2. Try creating another **Active** pricing rule for `Oil Change Service`
3. Verify:
   - ✅ Error toast: `"An active pricing matrix already exists for this catalog item"`
   - ✅ The record is **not** created
4. Create an **Inactive** pricing rule for the same item → ✅ succeeds
5. Edit the inactive rule, change status to Active → ✅ should either conflict if the original active one still exists, or succeed if the original was deactivated

---

### Test 8 — Resolve Pricing (API Level)

**Goal:** Verify the resolve endpoint works correctly.

1. Ensure an **active** pricing matrix exists for a catalog item
2. Call `GET /api/pricing/resolve/{catalogItemId}`
3. Verify response structure:
   ```json
   {
     "catalog_item": { "id": "...", "name": "..." },
     "pricing": {
       "id": "...",
       "light_price": 500,
       "heavy_price": 800,
       "extra_heavy_price": 1200
     }
   }
   ```
4. Deactivate all pricing for a catalog item
5. Call resolve again → `pricing` should be `null`
6. Verify this flows correctly into the Job Order create flow (labor price = 0 when no pricing)

---

### Test 9 — RBAC Enforcement

**Goal:** Verify access control per role.

1. **Log in as T (Technician):**
   - Navigate to Pricing
   - ✅ Can view pricing matrices
   - ✅ **No** "Add Pricing Rule" button
   - ✅ **No** Edit or Delete buttons on rows
2. **Log in as R (Receptionist):**
   - ✅ Can view, create, edit, and delete pricing rules
3. **Log in as HM, POC, or JS:**
   - ✅ Full CRUD access

---

### Test 10 — Audit Logging

**Goal:** Verify pricing operations are logged.

1. Perform create, update, delete operations on pricing rules
2. Navigate to **Audit Logs**
3. Verify entries exist for:
   - ✅ Pricing rule creation (entity_type: pricing_matrices)
   - ✅ Pricing rule update
   - ✅ Pricing rule deletion

---

## Summary Checklist

| Requirement                                     | Status |
| ----------------------------------------------- | ------ |
| View Pricing Matrices (Stats + Table)           | ⬜     |
| 3 Stats Cards (All / Active / Inactive)         | ⬜     |
| Dual View (Mobile Cards + Desktop Table)        | ⬜     |
| Create Rule (3 Prices + Status)                 | ⬜     |
| Edit Rule                                       | ⬜     |
| Delete Rule (Permanent)                         | ⬜     |
| Search by Catalog Item Name                     | ⬜     |
| Filter by Status                                | ⬜     |
| Pagination (5 per page)                         | ⬜     |
| One Active Per Catalog Item (409 Conflict)      | ⬜     |
| Resolve Endpoint (returns pricing or null)      | ⬜     |
| RBAC (HM/POC/JS/R manage, T view-only)         | ⬜     |
| Audit Logging                                   | ⬜     |
