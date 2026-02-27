# Branch Management — Testing Guide & Process Documentation

---

## How Branch Management Works in the System

### Overview

The Branch Management module allows authorized users to create and manage physical branch locations. Branches are the core organizational unit — users, customers, vehicles, inventory, and all transactions are scoped to specific branches. The display uses a responsive card grid (not a table).

### Key Business Rules

1. **Branch Code uniqueness** — each branch must have a unique code (auto-uppercased, max 10 characters).
2. **Conditional delete** — if users are assigned to a branch, it is **deactivated** (soft delete) instead of permanently deleted.
3. **All contact fields required** — name, code, address, phone, and email are all mandatory.
4. **Phone validation** — must be 7–20 digits (allows `+`, `-`, `()`, and spaces).
5. **Branch scoping** — HM sees all branches. Other roles see branches filtered by their assignments (via RLS).
6. **Active/Inactive toggle** — branches can be deactivated via the Edit modal without deleting them.

### RBAC (Roles & Permissions)

| Action                   | HM  | POC | JS  |  R  |  T  |
| ------------------------ | :-: | :-: | :-: | :-: | :-: |
| View Branches            | ✅  | ✅  | ✅  | ✅  |  —  |
| Create Branch            | ✅  | ✅  | ✅  | ✅  |  —  |
| Update Branch            | ✅  | ✅  | ✅  | ✅  |  —  |
| Delete/Deactivate Branch | ✅  | ✅  | ✅  | ✅  |  —  |

### API Endpoints

| Method   | Endpoint                        | Description                  |
| -------- | ------------------------------- | ---------------------------- |
| `GET`    | `/api/branches`                 | List all branches            |
| `GET`    | `/api/branches/:branchId`       | Get single branch            |
| `POST`   | `/api/branches`                 | Create branch                |
| `PUT`    | `/api/branches/:branchId`       | Update branch                |
| `DELETE` | `/api/branches/:branchId`       | Delete/deactivate branch     |
| `GET`    | `/api/branches/:branchId/users` | Get users assigned to branch |

---

## Sample Data to Populate

Use the **"Add New Branch"** button. Create each branch below:

| #   | Name                   | Code  | Address                             | Phone           | Email              |
| --- | ---------------------- | ----- | ----------------------------------- | --------------- | ------------------ |
| 1   | Petrozone Main Branch  | MAIN  | 123 Rizal Avenue, Makati City       | +63 2 8888 1234 | main@petrozone.ph  |
| 2   | Petrozone North Branch | NORTH | 456 EDSA, Quezon City               | +63 2 7777 5678 | north@petrozone.ph |
| 3   | Petrozone South Branch | SOUTH | 789 Alabang-Zapote Road, Muntinlupa | +63 2 6666 9012 | south@petrozone.ph |

---s

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, **JS**, or **R**

---

### Test 1 — View Branches

**Goal:** Verify the branch list loads correctly.

1. Navigate to **Branch Management** from the sidebar
2. Verify:
   - ✅ The header shows **"Branches"** with subtitle `"{count} branches total"`
   - ✅ Branch cards display in a responsive grid (1/2/3 columns depending on screen width)
3. If branches exist, verify each card shows:
   - ✅ Branch name (header)
   - ✅ Branch code (monospace badge)
   - ✅ Status badge (`"Active"` green or `"Inactive"` red)
   - ✅ Address, phone, and email (if present)
   - ✅ Edit and Delete action buttons

---

### Test 2 — Create Branch

**Goal:** Verify a new branch can be created with all required fields.

1. Click **"Add New Branch"** → the **"Add New Branch"** modal opens
2. Fill in the form with Sample Data Branch #1:
   - Name: `Petrozone Main Branch`
   - Code: `main` (type lowercase — it auto-uppercases to `MAIN`)
   - Address: `123 Rizal Avenue, Makati City`
   - Phone: `+63 2 8888 1234`
   - Email: `main@petrozone.ph`
3. Click **"Create Branch"**
4. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Branch created successfully"`
   - ✅ Branch card appears in the grid with correct details
   - ✅ Code displays as `MAIN` (uppercased)
   - ✅ Status shows `"Active"`
5. Repeat for all 3 sample branches

**Edge cases to test:**

- Submit with empty Name → error: `"Name and code are required"`
- Submit with empty Code → error: `"Name and code are required"`
- Submit with empty Address → error: `"Address is required"`
- Submit with empty Phone → error: `"Phone number is required"`
- Submit with phone outside 7–20 digits → error: `"Phone number must be between 7 and 20 digits"`
- Submit with empty Email → error: `"Email address is required"`
- Submit with a duplicate code (e.g., `MAIN` again) → error: `"Branch code already exists"`
- Code longer than 10 characters → should be limited

---

### Test 3 — View Branch Details

**Goal:** Verify the view modal shows all branch information.

1. Click on a branch card (or a view action if available)
2. Verify the **"Branch Details"** modal shows:
   - ✅ Name, Code, Status (all disabled/read-only)
   - ✅ Address, Phone, Email
   - ✅ Created and Updated timestamps

---

### Test 4 — Update Branch

**Goal:** Verify branch details can be edited.

1. Click the **Edit** (pencil) button on a branch card
2. Verify the **"Edit Branch"** modal opens with pre-filled data
3. Change the branch name to `"Petrozone Main HQ"`
4. Change the phone to `"+63 2 8888 0000"`
5. Verify the **Active/Inactive toggle** is visible
6. Click **"Save Changes"**
7. Verify:
   - ✅ Button shows **"Saving..."** while processing
   - ✅ Toast: `"Branch updated successfully"`
   - ✅ Card updates to show the new name and phone

**Test deactivation via edit:** 8. Open Edit modal again → toggle the status to **Inactive** 9. Save → verify the card shows an `"Inactive"` (red) badge

---

### Test 5 — Search Branches

**Goal:** Verify search works across branch fields.

1. Type `"NORTH"` in the search bar
2. Verify:
   - ✅ Only the North Branch card is visible
3. Search by address: type `"Alabang"` → only South Branch visible
4. Search by phone: type `"7777"` → only North Branch visible
5. Clear the search → all branches reappear

---

### Test 6 — Filter by Status

**Goal:** Verify the status filter works.

1. Click **Filters** → select **"Active"** under Status
2. Verify:
   - ✅ Only active branches are shown
3. Select **"Inactive"** → only inactive branches shown
4. Click **Reset** → all branches shown

---

### Test 7 — Delete Branch (No Users Assigned)

**Goal:** Verify a branch with no assigned users is permanently deleted.

1. Create a test branch (e.g., `TEST` / `Test Branch for Deletion`)
2. Ensure no users are assigned to this branch
3. Click the **Delete** (trash) button on the test branch card
4. Verify the confirmation modal:
   - ✅ Title: **"Delete Branch"**
   - ✅ Message: `"Are you sure you want to delete Test Branch for Deletion?"`
   - ✅ Warning: `"If users are assigned to this branch, it will be deactivated instead of deleted."`
5. Click **"Delete"**
6. Verify:
   - ✅ Toast: `"Branch deleted successfully"`
   - ✅ The branch card disappears from the grid

---

### Test 8 — Delete Branch (Users Assigned — Deactivation)

**Goal:** Verify a branch with assigned users is deactivated instead of deleted.

1. Ensure a branch has at least one user assigned to it (via User Management)
2. Click **Delete** on that branch
3. Confirm the deletion
4. Verify:
   - ✅ The branch is **not removed** from the grid
   - ✅ Instead, its status changes to `"Inactive"`
   - ✅ Backend response: `"Branch deactivated (has assigned users)"`

---

### Test 9 — Empty State

**Goal:** Verify the empty state displays correctly.

1. If no branches exist (or all are filtered out):
   - Without filters: `'No branches found. Click "Add Branch" to create one.'`
   - With filters: `"No branches match your search or filters."`

---

### Test 10 — Audit Logging

**Goal:** Verify branch operations are logged.

1. Navigate to **Audit Logs** (as HM or POC)
2. Verify entries exist for:
   - ✅ Branch creation (action: CREATE)
   - ✅ Branch update (action: UPDATE)
   - ✅ Branch deletion/deactivation (action: DELETE or UPDATE)

---

## Summary Checklist

| Requirement                                        | Status |
| -------------------------------------------------- | ------ |
| View Branches (Card Grid)                          | ⬜     |
| Create Branch (All Fields Required)                | ⬜     |
| Branch Code Auto-Uppercase                         | ⬜     |
| Branch Code Uniqueness                             | ⬜     |
| View Branch Details                                | ⬜     |
| Update Branch                                      | ⬜     |
| Activate/Deactivate via Edit                       | ⬜     |
| Search (Name, Code, Address, Phone, Email)         | ⬜     |
| Filter by Status                                   | ⬜     |
| Delete — Hard Delete (No Users)                    | ⬜     |
| Delete — Soft Delete / Deactivate (Users Assigned) | ⬜     |
| Phone Validation (7–20 digits)                     | ⬜     |
| Empty State Messages                               | ⬜     |
| Audit Logging                                      | ⬜     |
| RBAC Enforcement                                   | ⬜     |
