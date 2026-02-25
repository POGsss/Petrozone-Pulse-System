# Pricing Matrices — Testing Guide & Process Documentation

---

## How Pricing Matrices Works in the System

### Overview

The Pricing Matrices module defines labor and packaging pricing rules for catalog items at each branch. When a catalog item is added to a job order, the system resolves the active pricing rules to calculate the full price (base + labor + packaging). Each pricing rule links a catalog item to a branch with a specific pricing type and price.

### Key Business Rules

1. **Two pricing types** — `labor` and `packaging`.
2. **Active uniqueness constraint** — only **one active** pricing rule is allowed per combination of (catalog item + pricing type + branch). To create a new active rule for the same combo, deactivate the existing one first.
3. **Branch-scoped** — each rule belongs to a specific branch. Non-HM users see only rules for their assigned branches.
4. **Catalog item selector** — the dropdown shows only active catalog items (global + branch-scoped) for the selected branch, with format: `"{name} ({type}) — Base: PHP {base_price}"`.
5. **Conditional delete** — attempts hard delete first. If the rule is referenced by other records (FK constraint), it falls back to soft delete (deactivation).
6. **T role is view-only** — Technicians can see pricing data via the API but the frontend doesn't load catalog items for them to create rules.
7. **Resolve endpoint** — used by the Job Order module to determine the total price (base + labor + packaging) for a given catalog item at a specific branch.

### RBAC (Roles & Permissions)

| Action              | HM  | POC | JS  |  R  |  T  |
| ------------------- | :-: | :-: | :-: | :-: | :-: |
| View Pricing Rules  | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create Pricing Rule | ✅  | ✅  | ✅  | ✅  |  —  |
| Update Pricing Rule | ✅  | ✅  | ✅  | ✅  |  —  |
| Delete Pricing Rule | ✅  | ✅  | ✅  | ✅  |  —  |

### API Endpoints

| Method   | Endpoint                              | Description                                           |
| -------- | ------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/api/pricing`                        | List pricing matrices (paginated, filtered)           |
| `GET`    | `/api/pricing/:id`                    | Get single pricing matrix                             |
| `GET`    | `/api/pricing/resolve/:catalogItemId` | Resolve active pricing for a catalog item at a branch |
| `POST`   | `/api/pricing/resolve-bulk`           | Bulk resolve pricing for multiple items               |
| `POST`   | `/api/pricing`                        | Create pricing matrix                                 |
| `PUT`    | `/api/pricing/:id`                    | Update pricing matrix                                 |
| `DELETE` | `/api/pricing/:id`                    | Delete/deactivate pricing matrix                      |

---

## Sample Data to Populate

> **Pre-requisite:** Catalog items and branches must exist first (see `CATALOG_TESTING.md`).

Use the **"Add Pricing Matrix"** button. Create each rule below:

| #   | Branch | Catalog Item           | Pricing Type | Price | Status |
| --- | ------ | ---------------------- | ------------ | ----- | ------ |
| 1   | MAIN   | Oil Change Service     | Labor        | 300   | Active |
| 2   | MAIN   | Oil Change Service     | Packaging    | 50    | Active |
| 3   | MAIN   | Brake Pad Replacement  | Labor        | 800   | Active |
| 4   | NORTH  | Oil Change Service     | Labor        | 350   | Active |
| 5   | NORTH  | Engine Tune-Up Package | Labor        | 1,500 | Active |
| 6   | SOUTH  | Wheel Alignment        | Labor        | 500   | Active |

> **Tip:** Rules #1 and #2 demonstrate both labor AND packaging for the same catalog item at the same branch.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, **JS**, or **R**
- At least one branch and one active catalog item exist

---

### Test 1 — View Pricing Rules

**Goal:** Verify the pricing table loads correctly with stats.

1. Navigate to **Pricing Matrices** from the sidebar
2. Verify the **stats cards** at the top:
   - ✅ **All Rules** — total count
   - ✅ **Active** — active rule count
   - ✅ **Inactive** — inactive count
3. Verify the table columns:
   - ✅ **Catalog Item** — item name (bold), or "Unknown"
   - ✅ **Price** — formatted as PHP currency (bold)
   - ✅ **Type** — pill badge: "Labor" (primary color) or "Packaging" (green)
   - ✅ **Branch** — branch name badge
   - ✅ **Status** — pill badge: "Active" / "Inactive"
   - ✅ **Actions** — Edit + Delete buttons

---

### Test 2 — Create Pricing Rule

**Goal:** Verify a new pricing rule can be created.

1. Click **"Add Pricing Matrix"** → the **"Add Pricing Matrix"** modal opens
2. Fill in the form:
   - **Branch**: select `MAIN` (must be selected first — this filters catalog items)
   - **Catalog Item**: select `Oil Change Service (Service) — Base: PHP 500.00`
   - **Pricing Type**: select `Labor`
   - **Price**: `300`
   - **Status**: `Active`
   - **Description**: (optional)
3. Click **"Create Pricing"**
4. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Pricing rule created successfully"`
   - ✅ Rule appears in the table
   - ✅ Stats update: All Rules and Active counts increase
5. Repeat for all 6 sample rules

**Edge cases to test:**

- No catalog item selected → error: `"Please select a catalog item"`
- No pricing type selected → error: `"Please select a pricing type"`
- Empty or negative price → error: `"Please enter a valid price (non-negative number)"`
- No branch selected → error: `"Please select a branch"`

---

### Test 3 — Active Uniqueness Constraint

**Goal:** Verify only one active rule per (item + type + branch) combo.

1. Try creating another **active Labor** rule for `Oil Change Service` at `MAIN` branch (same as rule #1)
2. Click **"Create Pricing"**
3. Verify:
   - ✅ Error (409): `"An active labor pricing rule already exists for this catalog item in this branch. Deactivate it first or create as inactive."`
4. Change the Status to **Inactive** and create again → should succeed
5. Try setting the inactive rule to Active via Edit:
   - ✅ Error (409): `"An active labor pricing rule already exists for this catalog item in this branch. Deactivate it first."`

---

### Test 4 — View Pricing Rule Details

**Goal:** Verify the view modal shows all rule data.

1. Click on a table row to open the view modal
2. Verify the **"Pricing Rule Details"** modal shows:
   - ✅ **"Pricing Information"** — Catalog Item name, Item Type (capitalized), Pricing Type, Price (formatted) (all disabled)
   - ✅ **"Assignment"** — Status, Branch (all disabled)
   - ✅ **"Additional Information"** — Description (disabled)
   - ✅ **"Timestamps"** — Created and Updated dates

---

### Test 5 — Update Pricing Rule

**Goal:** Verify a pricing rule can be edited.

1. Click the **Edit** (pencil) icon on a rule
2. Verify the **"Edit Pricing Rule"** modal opens with pre-filled data
3. Change the **Price** to a new value (e.g., `350`)
4. Change the **Description** to add a note
5. Click **"Save Changes"**
6. Verify:
   - ✅ Toast: `"Pricing rule updated successfully"`
   - ✅ Table reflects the new price

**Test branch change:** 6. Open Edit and change the **Branch** → verify the Catalog Item dropdown resets (filters to new branch's items)

---

### Test 6 — Search Pricing Rules

**Goal:** Verify search works.

1. Type `"Oil"` → rules for Oil Change Service appear (matched on catalog item name)
2. Type `"Labor"` → only labor rules shown (matched on pricing type)
3. Type `"MAIN"` → only MAIN branch rules shown (matched on branch name)
4. Clear the search → all rules reappear

---

### Test 7 — Filter Pricing Rules

**Goal:** Verify filter functionality.

1. **Filter by Status**: select `"Active"` → only active rules shown
2. **Advanced Filters** (click toggle):
   - **Filter by Type**: select `"Packaging"` → only packaging rules shown
   - **Filter by Branch**: select `"NORTH"` → only NORTH branch rules shown
3. Click **"Apply"** to apply filters
4. Click **"Reset"** to clear
5. Verify pagination: 5 items per page

---

### Test 8 — Delete Pricing Rule (No References — Hard Delete)

**Goal:** Verify a pricing rule not referenced by other records is permanently deleted.

1. Find a rule that has NOT been used in any job order pricing resolution
2. Click the **Delete** (trash) icon
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Pricing Rule"**
   - ✅ Message: `"Are you sure you want to delete the {type} pricing rule for {catalog item name}?"`
   - ✅ Warning: `"This action cannot be undone. The pricing rule will be permanently removed."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast: `"Pricing rule deleted successfully"`
   - ✅ Rule disappears from the table

---

### Test 9 — Delete Pricing Rule (Referenced — Soft Delete)

**Goal:** Verify a referenced pricing rule is deactivated.

1. Use a pricing rule in a job order (by creating a JO with that catalog item)
2. Return to Pricing and click **Delete** on that rule
3. Confirm the deletion
4. Verify:
   - ✅ Toast: `"Pricing rule deleted successfully"` (frontend doesn't distinguish)
   - ✅ The rule is deactivated (status changes to Inactive) instead of removed

---

### Test 10 — Branch Scoping

**Goal:** Verify users only see rules for their assigned branches.

1. Log in as a non-HM user assigned to MAIN branch
2. Navigate to Pricing → should only see rules for MAIN branch
3. Log in as **HM** → should see rules across all branches

---

### Test 11 — Pricing Resolution (Integration)

**Goal:** Verify the resolve endpoint returns correct pricing.

> This test is best observed through the Job Order creation flow:

1. Create pricing rules: Oil Change Service at MAIN → Labor: 300, Packaging: 50
2. Go to **Job Orders** → Create a new JO at MAIN branch
3. Add `Oil Change Service` as an item
4. Verify the resolved price shows:
   - ✅ Base: 500 (from catalog)
   - ✅ Labor: 300 (from pricing rule)
   - ✅ Packaging: 50 (from pricing rule)
   - ✅ Line total per item = (500 + 300 + 50) × quantity
5. If no pricing rules exist for an item, a warning toast appears: `"No labor or packaging pricing found for ... at this branch."`

---

### Test 12 — Audit Logging

**Goal:** Verify pricing operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Pricing rule creation (action: CREATE)
   - ✅ Pricing rule update (action: UPDATE)
   - ✅ Pricing rule deletion or deactivation (action: DELETE / UPDATE)

---

## Summary Checklist

| Requirement                                | Status |
| ------------------------------------------ | ------ |
| View Pricing Rules with Stats              | ⬜     |
| Create Pricing Rule (Labor/Packaging)      | ⬜     |
| Active Uniqueness Constraint               | ⬜     |
| Catalog Item Dropdown (Filtered by Branch) | ⬜     |
| View Pricing Rule Details                  | ⬜     |
| Update Pricing Rule                        | ⬜     |
| Search (Item Name, Type, Branch)           | ⬜     |
| Filter by Status                           | ⬜     |
| Filter by Pricing Type (Advanced)          | ⬜     |
| Filter by Branch (Advanced)                | ⬜     |
| Delete — Hard Delete (No References)       | ⬜     |
| Delete — Soft Delete (Referenced)          | ⬜     |
| Branch Scoping (HM vs Others)              | ⬜     |
| Pricing Resolution in JO Creation          | ⬜     |
| Pagination (5 per page)                    | ⬜     |
| Audit Logging                              | ⬜     |
| RBAC Enforcement                           | ⬜     |
