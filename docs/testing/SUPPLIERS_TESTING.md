# Supplier Management — Testing Guide & Process Documentation

---

## How Supplier Management Works in the System

### Overview

The Supplier Management module allows users to create and manage supplier profiles. Suppliers are linked to branches and represent the external parties that provide products and materials to Petrozone Pulse. The module supports full CRUD operations with mandatory field validation, branch isolation via RLS, and audit logging for every mutation.

### Key Business Rules

1. **All fields are mandatory** — supplier name, contact person, email, phone, address, and branch must be provided.
2. **Branch assignment** — each supplier belongs to a branch, set at creation.
3. **Status** — `active` or `inactive` (default: `active`).
4. **Conditional delete** — if the supplier is referenced by purchase orders (matched by `supplier_name`), they are **deactivated** (soft delete) instead of permanently deleted. If no POs reference the supplier, hard delete is performed.
5. **Phone validation** — must be 7–20 digits (allows `+`, `-`, `()`, and spaces).
6. **Email validation** — checked against a regex pattern on both frontend and backend.
7. **Notes** — optional free-text field for additional information.

### RBAC (Roles & Permissions)

| Action          | HM  | POC | JS  |  R  |  T  |
| --------------- | :-: | :-: | :-: | :-: | :-: |
| View Suppliers  | ✅  | ✅  | ✅  |  —  |  —  |
| Create Supplier | ✅  | ✅  | ✅  |  —  |  —  |
| Update Supplier | ✅  | ✅  | ✅  |  —  |  —  |
| Delete Supplier | ✅  | ✅  | ✅  |  —  |  —  |

> **Note:** Only HM, POC, and JS roles have access to the Supplier Management module (UC53–UC56).

### API Endpoints

| Method   | Endpoint                       | Description                           |
| -------- | ------------------------------ | ------------------------------------- |
| `GET`    | `/api/suppliers`               | List suppliers (paginated, filtered)  |
| `GET`    | `/api/suppliers/:supplierId`   | Get single supplier                   |
| `POST`   | `/api/suppliers`               | Create supplier                       |
| `PUT`    | `/api/suppliers/:supplierId`   | Update supplier                       |
| `DELETE` | `/api/suppliers/:supplierId`   | Delete/deactivate supplier            |

---

## Sample Data to Populate

Use the **"Add New Supplier"** button. Create each supplier below:

| #   | Supplier Name         | Contact Person    | Email                    | Phone              | Address                   | Branch |
| --- | --------------------- | ----------------- | ------------------------ | ------------------ | ------------------------- | ------ |
| 1   | AutoParts Philippines | Carlos Reyes      | carlos@autoparts.ph      | +63 917 111 2222   | 456 Aurora Blvd, QC       | MAIN   |
| 2   | Global Lubricants Inc | Maria Santos      | maria@globallube.com     | +63 2 8888 1234    | BGC, Taguig City          | MAIN   |
| 3   | QuickFix Supplies     | Pedro Mendoza     | pedro@quickfix.ph        | +63 918 333 4444   | Ortigas Center, Pasig     | NORTH  |
| 4   | TireMaster Corp       | Ana Garcia        | ana@tiremaster.ph        | +63 919 555 6666   | Alabang, Muntinlupa       | SOUTH  |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as an authorized role (HM, POC, or JS)
- At least one branch exists

---

### Test 1 — View Supplier List

**Goal:** Verify the supplier grid loads correctly.

1. Navigate to **Suppliers** from the sidebar (located after Purchase Orders)
2. Verify the **header** shows:
   - ✅ Title: **"Suppliers"**
   - ✅ Count: **"X suppliers total"**
   - ✅ **"Add New Supplier"** button
3. Verify each **supplier card** displays:
   - ✅ **Supplier icon** (truck) with primary background
   - ✅ **Supplier Name** (bold)
   - ✅ **Contact Person** (subtitle)
   - ✅ **Status badge** — green "Active" or red "Inactive"
   - ✅ **Email, Phone, Address** details
   - ✅ **Branch badge** (mono font, neutral background)
   - ✅ **Edit** and **Delete** action buttons

---

### Test 2 — Create Supplier

**Goal:** Verify a new supplier can be created with all mandatory fields.

1. Click **"Add New Supplier"** → the **"Add New Supplier"** modal opens
2. Fill in the form with Sample Data Supplier #1:
   - **Section: "Supplier Information"**
     - Supplier Name: `AutoParts Philippines`
     - Contact Person: `Carlos Reyes`
   - **Section: "Contact Details"**
     - Email: `carlos@autoparts.ph`
     - Phone: `+63 917 111 2222`
     - Address: `456 Aurora Blvd, QC`
   - **Section: "Assignment"**
     - Branch: `MAIN`
   - **Section: "Additional"**
     - Notes: (optional, leave blank)
3. Click **"Create Supplier"**
4. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Supplier created successfully"`
   - ✅ Supplier appears in the grid
   - ✅ Header count updates
5. Repeat for all 4 sample suppliers

**Edge cases to test:**

- Empty Supplier Name → error: `"Supplier name is required"`
- Empty Contact Person → error: `"Contact person is required"`
- Empty Email → error: `"Email is required"`
- Invalid email format → error: `"Invalid email format"`
- Empty Phone → error: `"Phone number is required"`
- Phone outside 7–20 digits → error: `"Phone number must be between 7 and 20 digits"`
- Empty Address → error: `"Address is required"`
- Empty Branch → error: `"Branch is required"`

---

### Test 3 — View Supplier Details

**Goal:** Verify the view modal shows all supplier data.

1. Click on a supplier card in the grid
2. Verify the **"Supplier Details"** modal shows:
   - ✅ **"Supplier Information"** — Supplier Name, Contact Person, Status (all disabled)
   - ✅ **"Contact Details"** — Email, Phone, Address (all disabled)
   - ✅ **"Assignment"** — Branch name (disabled)
   - ✅ **"Notes"** — Notes field (only shown if notes exist, disabled)
   - ✅ **"Timestamps"** — Created and Updated dates

---

### Test 4 — Update Supplier

**Goal:** Verify supplier details can be edited.

1. Click the **Edit** (pencil) icon on a supplier card
2. Verify the **"Edit Supplier"** modal opens with pre-filled data
3. Change the **Contact Person** to a new value
4. Update the **Phone Number**
5. Toggle the **Status** switch (Active ↔ Inactive)
6. Add or update the **Notes**
7. Click **"Save Changes"**
8. Verify:
   - ✅ Button shows **"Saving..."** while processing
   - ✅ Toast: `"Supplier updated successfully"`
   - ✅ Grid card reflects the changes
   - ✅ Status badge updates if changed

**Edge cases to test:**

- Clear Supplier Name → error: `"Supplier name is required"`
- Clear Email → error: `"Email is required"`
- Invalid email format → error: `"Invalid email format"`
- Clear Phone → error: `"Phone number is required"`
- Phone outside 7–20 digits → error: `"Phone number must be between 7 and 20 digits"`

---

### Test 5 — Search Suppliers

**Goal:** Verify search works across multiple fields.

1. Type `"AutoParts"` in the search bar → only AutoParts Philippines appears
2. Type `"maria"` → Global Lubricants Inc appears (matched on contact person)
3. Type `"quickfix"` → QuickFix Supplies appears (matched on email)
4. Type `"+63 919"` → TireMaster Corp appears (matched on phone)
5. Type `"Alabang"` → TireMaster Corp appears (matched on address)
6. Clear the search → all suppliers reappear

---

### Test 6 — Filter Suppliers

**Goal:** Verify filter functionality.

1. **Filter by Status**: select `"Active"` → only active suppliers shown
2. **Filter by Status**: select `"Inactive"` → only inactive suppliers shown
3. Select `"All"` or clear filter → all suppliers reappear
4. Verify empty state message updates correctly

---

### Test 7 — Delete Supplier (No Purchase Orders — Hard Delete)

**Goal:** Verify a supplier with no purchase orders is permanently deleted.

1. Ensure a supplier is **not referenced** by any purchase orders
2. Click the **Delete** (trash) icon on the supplier card
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Supplier"**
   - ✅ Message: `"Are you sure you want to delete {supplier_name}?"`
   - ✅ Warning: `"If this supplier is referenced by purchase orders, it will be deactivated instead of deleted."`
4. Click **"Delete"**
5. Verify:
   - ✅ Button shows **"Deleting..."** while processing
   - ✅ Toast: `"Supplier deleted successfully"`
   - ✅ Supplier disappears from the grid

---

### Test 8 — Delete Supplier (Has Purchase Orders — Soft Delete)

**Goal:** Verify a supplier referenced by purchase orders is deactivated instead of deleted.

1. Create a purchase order with the supplier's name (via Purchase Order Management)
2. Click **Delete** on that supplier
3. Confirm the deletion
4. Verify:
   - ✅ The supplier is **not removed** from the grid
   - ✅ Status changes to **"Inactive"**
   - ✅ Backend response includes: `"Supplier deactivated (referenced by purchase orders)"`

---

### Test 9 — Branch Scoping

**Goal:** Verify users only see suppliers for their assigned branches.

1. Log in as a **POC** assigned to MAIN branch only
2. Navigate to Suppliers → should only see suppliers in MAIN branch
3. Log in as **HM** → should see suppliers across all branches
4. Verify the Branch dropdown in the Add modal only shows accessible branches

---

### Test 10 — Audit Logging

**Goal:** Verify supplier operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Supplier creation (entity_type: SUPPLIER, action: CREATE)
   - ✅ Supplier update (entity_type: SUPPLIER, action: UPDATE)
   - ✅ Supplier deletion or deactivation (entity_type: SUPPLIER, action: DELETE / UPDATE)

---

### Test 11 — RBAC Enforcement

**Goal:** Verify role-based access control.

1. Log in as **HM** → Suppliers sidebar item visible, all CRUD operations available
2. Log in as **POC** → Suppliers sidebar item visible, all CRUD operations available
3. Log in as **JS** → Suppliers sidebar item visible, all CRUD operations available
4. Log in as **R** → Suppliers sidebar item should **NOT** be visible
5. Log in as **T** → Suppliers sidebar item should **NOT** be visible

---

## Summary Checklist

| Requirement                                | Status |
| ------------------------------------------ | ------ |
| View Supplier Grid (Card Layout)           | ⬜     |
| Create Supplier (All Mandatory Fields)     | ⬜     |
| Supplier Name Required                     | ⬜     |
| Contact Person Required                    | ⬜     |
| Email Required + Format Validation         | ⬜     |
| Phone Required + Digit Validation (7–20)   | ⬜     |
| Address Required                           | ⬜     |
| Branch Required                            | ⬜     |
| View Supplier Details (Modal)              | ⬜     |
| Update Supplier                            | ⬜     |
| Status Toggle (Active / Inactive)          | ⬜     |
| Search (Name, Contact, Email, Phone, Addr) | ⬜     |
| Filter by Status                           | ⬜     |
| Delete — Hard Delete (No POs)              | ⬜     |
| Delete — Soft Delete (Has POs)             | ⬜     |
| Branch Scoping (HM vs Others)              | ⬜     |
| Audit Logging                              | ⬜     |
| RBAC Enforcement (HM, POC, JS only)        | ⬜     |
