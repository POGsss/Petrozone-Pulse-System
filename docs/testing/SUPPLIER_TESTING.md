# Supplier Products — Testing Guide & Process Documentation

---

## How Supplier Products Work in the System

### Overview

The Supplier Products module (Sprint 3, Module 4) manages the list of products that each supplier offers. Products are accessed via the Supplier Management page — each supplier card has a 3-dots dropdown menu with a "Manage Products" action. Products can optionally be linked to inventory items (one-to-one relationship). The module supports full CRUD with mandatory field validation, one-to-one inventory linking, branch isolation, and audit logging.

### Key Business Rules

1. **Managed per-supplier** — Products are accessed through the supplier's 3-dots dropdown ("Manage Products"), not a standalone page.
2. **Mandatory fields** — Product Name, Unit Cost (≥ 0), Supplier, and Branch are required.
3. **Optional fields** — Inventory Item (link), Lead Time Days (≥ 0).
4. **One-to-one inventory constraint** — An active inventory item can only be linked to one active supplier product at a time. Enforced at both DB (partial unique index) and API level.
5. **Hard delete** — Supplier products are permanently removed from the database when deleted. The audit log preserves product details before removal.
6. **Branch scoping** — Products inherit the supplier's branch context. HM sees all, others see only their assigned branches.
7. **View in supplier details** — The View Supplier modal includes a read-only "Linked Products" section showing active products.

### RBAC (Roles & Permissions)

| Action                    | HM  | POC | JS  |  R  |  T  |
| ------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Supplier Products    | ✅  | ✅  | ✅  |  —  |  —  |
| Create Supplier Product   | ✅  | ✅  | ✅  |  —  |  —  |
| Update Supplier Product   | ✅  | ✅  | ✅  |  —  |  —  |
| Delete Supplier Product   | ✅  | ✅  | ✅  |  —  |  —  |

> **Note:** Only HM, POC, and JS roles have access to supplier product operations (UC57–UC60).

### API Endpoints

| Method   | Endpoint                        | Description                                |
| -------- | ------------------------------- | ------------------------------------------ |
| `GET`    | `/api/supplier-products`        | List supplier products (paginated, filtered) |
| `GET`    | `/api/supplier-products/:id`    | Get single supplier product                |
| `POST`   | `/api/supplier-products`        | Create supplier product                    |
| `PUT`    | `/api/supplier-products/:id`    | Update supplier product                    |
| `DELETE` | `/api/supplier-products/:id`    | Hard-delete supplier product               |

### Status Flow

```
active → (hard delete) → permanently removed
```

---

## Sample Data to Populate

First, ensure you have **suppliers** and **inventory items** created. Then use the "Manage Products" modal to add these supplier products:

### For Supplier: AutoParts Philippines (MAIN branch)

| #   | Product Name        | Inventory Item Link      | Unit Cost  | Lead Time (Days) |
| --- | ------------------- | ------------------------ | ---------- | ---------------- |
| 1   | Brake Pad Set       | (select matching item)   | 850.00     | 5                |
| 2   | Oil Filter          | (select matching item)   | 120.00     | 3                |
| 3   | Spark Plug Set      | (none)                   | 450.00     | 7                |

### For Supplier: Global Lubricants Inc (MAIN branch)

| #   | Product Name        | Inventory Item Link      | Unit Cost  | Lead Time (Days) |
| --- | ------------------- | ------------------------ | ---------- | ---------------- |
| 4   | Engine Oil 5W-30    | (select matching item)   | 1200.00    | 2                |
| 5   | Transmission Fluid  | (none)                   | 680.00     | 4                |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as an authorized role (HM, POC, or JS)
- At least one supplier exists with an assigned branch
- Inventory items exist for testing item linking

---

### Test 1 — Access Manage Products via 3-Dots Dropdown

**Goal:** Verify the 3-dots dropdown appears on supplier cards and the "Manage Products" action opens the modal.

1. Navigate to **Suppliers** from the sidebar
2. Locate any supplier card in the grid
3. Look for the **3-dots icon** (⋮) labeled **"More"** at the bottom-right of the card
4. Click the 3-dots icon
5. Verify:
   - ✅ A dropdown menu appears with **"Manage Products"** option (with a package icon)
   - ✅ Clicking outside the dropdown closes it
6. Click **"Manage Products"**
7. Verify:
   - ✅ The **"Manage Products — {Supplier Name}"** modal opens
   - ✅ Modal is large width (`lg`)
   - ✅ The dropdown closes

---

### Test 2 — View Supplier Products List

**Goal:** Verify the products list inside the Manage Products modal loads correctly.

1. Open "Manage Products" for a supplier that has products
2. Verify the modal shows:
   - ✅ An **inline form** at the top for adding products (product name, inventory item, unit cost, lead time, + button)
   - ✅ A **product list** below with each product showing:
     - Product Name (bold text)
     - Linked inventory item (SKU code, if linked)
     - Unit Cost (formatted as PHP currency)
     - Lead Time (X days, if set)
     - Edit (pencil) and Delete (X) action icons
3. If no products exist:
   - ✅ Message: **"No products found for this supplier."**

---

### Test 3 — Create Supplier Product (Valid Entry)

**Goal:** Verify a new supplier product can be created with all required fields.

1. Open "Manage Products" for a supplier
2. In the inline form at the top:
   - **Product Name**: Enter `Brake Pad Set`
   - **Inventory Item**: Select an inventory item from the dropdown (optional)
   - **Unit Cost**: Enter `850`
   - **Lead Time (Days)**: Enter `5`
3. Click the **"+"** (plus) button
4. Verify:
   - ✅ The product appears in the list below
   - ✅ Toast: `"Supplier product created successfully"`
   - ✅ The form fields reset to empty
   - ✅ Product shows correct name, cost, and lead time

---

### Test 4 — Create Supplier Product with Missing Required Fields

**Goal:** Verify the system prevents creation when required fields are missing.

1. Open "Manage Products" for a supplier
2. Leave **Product Name** empty, enter a Unit Cost, and click "+"
3. Verify:
   - ✅ Error message displayed (toast): `"Product name is required"`
   - ✅ No product is created
4. Enter a Product Name, leave **Unit Cost** empty, and click "+"
5. Verify:
   - ✅ Error message displayed: `"Unit cost is required and must be non-negative"`
   - ✅ No product is created
6. Enter a **negative** Unit Cost (e.g., `-100`), and click "+"
7. Verify:
   - ✅ Error message displayed: `"Unit cost is required and must be non-negative"`

---

### Test 5 — One-to-One Inventory Item Constraint

**Goal:** Verify that each inventory item can only be linked to one active supplier product.

1. Create a supplier product linked to **Inventory Item A** → succeeds
2. Open "Manage Products" for a **different supplier**
3. Try to create a product linked to the **same Inventory Item A**
4. Verify:
   - ✅ Error message: `"This inventory item is already linked to another active supplier product. One product can only belong to one supplier."`
   - ✅ No product is created
5. **Delete** the first product (from step 1) — permanently removes it
6. Now try to link Inventory Item A to the second supplier again
7. Verify:
   - ✅ Product is created successfully (constraint released after hard delete)

---

### Test 6 — Edit Supplier Product

**Goal:** Verify an existing supplier product can be edited.

1. Open "Manage Products" for a supplier with products
2. Click the **pencil icon** on a product row
3. Verify:
   - ✅ The inline form at the top populates with the product's current values
   - ✅ The "+" button changes to a **checkmark (✓)** and a **cancel (✕)** button
   - ✅ The product row gets highlighted (ring)
4. Change the **Unit Cost** to a new value (e.g., `950`)
5. Click the **checkmark (✓)** button to save
6. Verify:
   - ✅ Toast: `"Supplier product updated successfully"`
   - ✅ Product list refreshes with updated values
   - ✅ Form resets to add mode (+ button returns)

---

### Test 7 — Cancel Edit

**Goal:** Verify editing can be cancelled without saving.

1. Click the pencil icon on a product row
2. Modify some values
3. Click the **cancel (✕)** button
4. Verify:
   - ✅ Form resets to add mode
   - ✅ No changes are saved
   - ✅ The product row returns to its original values

---

### Test 8 — Edit Validation

**Goal:** Verify the system rejects invalid edits.

1. Start editing a product
2. Clear the **Product Name** and click save (✓)
3. Verify:
   - ✅ Error: `"Product name is required"`
4. Enter a **negative unit cost** and click save (✓)
5. Verify:
   - ✅ Error: `"Unit cost must be non-negative"`

---

### Test 9 — Delete Supplier Product (Hard Delete)

**Goal:** Verify a supplier product is permanently deleted.

1. Open "Manage Products" for a supplier with products
2. Click the **X** (delete) icon on a product row
3. Verify the **Delete Confirmation** modal appears:
   - ✅ Title: **"Delete Supplier Product"**
   - ✅ Message: `"Are you sure you want to delete {product name}?"`
   - ✅ Warning: `"The product will be permanently deleted and removed from records. This action cannot be undone."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast: `"Supplier product deleted successfully"`
   - ✅ Product disappears from the list
   - ✅ Product is **permanently removed** from the database (not just status change)

---

### Test 10 — Linked Products in View Supplier Modal

**Goal:** Verify the View Supplier modal shows linked products as read-only.

1. Ensure a supplier has active products
2. Click on the supplier card to open the **"Supplier Details"** modal
3. Scroll down to the **"Linked Products"** section (under "Assignment")
4. Verify:
   - ✅ Section title: **"Linked Products"**
   - ✅ Shows a list of active products for this supplier
   - ✅ Each product shows: **Name**, **Cost** (formatted), **SKU** (if linked to inventory), **Lead Time** (if set)
   - ✅ The section is **read-only** (no edit/delete actions)
5. If no products exist:
   - ✅ Message: `"No active products linked to this supplier."`

---

### Test 11 — Create Product Without Inventory Link

**Goal:** Verify products can be created without linking to an inventory item.

1. Open "Manage Products" for a supplier
2. Enter a Product Name and Unit Cost
3. Leave **Inventory Item** as the default "(No link)"
4. Leave **Lead Time** empty
5. Click "+"
6. Verify:
   - ✅ Product is created successfully
   - ✅ The product shows "—" or no SKU code in the list
   - ✅ No lead time displayed

---

### Test 12 — Branch Scoping

**Goal:** Verify users only see products for their accessible branches.

1. Log in as a **POC** assigned to MAIN branch only
2. Open "Manage Products" for a MAIN branch supplier → can view/add/edit/delete products
3. Navigate to Suppliers → suppliers in other branches should not be visible
4. Log in as **HM** → should see suppliers and products across all branches

---

### Test 13 — Audit Logging

**Goal:** Verify all supplier product operations are logged.

1. Navigate to **Audit Logs**
2. After performing CRUD operations, verify entries exist for:
   - ✅ Product creation (entity_type: `SUPPLIER_PRODUCT`, action: `CREATE`)
   - ✅ Product update (entity_type: `SUPPLIER_PRODUCT`, action: `UPDATE`)
   - ✅ Product deletion (entity_type: `SUPPLIER_PRODUCT`, action: `DELETE`)
3. For **DELETE** entries, verify the audit log captures:
   - ✅ `product_name`, `unit_cost`, `supplier_id`, `inventory_item_id` in the details

---

### Test 14 — RBAC Enforcement

**Goal:** Verify role-based access control for supplier products.

1. Log in as **HM** → "Manage Products" dropdown visible, all CRUD available
2. Log in as **POC** → "Manage Products" dropdown visible, all CRUD available
3. Log in as **JS** → "Manage Products" dropdown visible, all CRUD available
4. Log in as **R** → Suppliers sidebar not visible, no access to supplier products
5. Log in as **T** → Suppliers sidebar not visible, no access to supplier products

---

### Test 15 — Loading States & Edge Cases

**Goal:** Verify UI handles loading and edge states gracefully.

1. **Loading skeleton** — When "Manage Products" modal opens, verify a loading skeleton shows briefly while products load
2. **Empty supplier** — Open "Manage Products" for a supplier with no products → shows empty state message
3. **Rapid clicks** — Click "+" multiple times quickly → should not create duplicate products (button is disabled while processing)
4. **Network error** — If API fails, verify error toast is displayed and the form remains usable

---

## Summary Checklist

| Requirement                                          | Status |
| ---------------------------------------------------- | ------ |
| 3-dots dropdown on supplier cards                    | ⬜     |
| "Manage Products" action in dropdown                 | ⬜     |
| Manage Products modal opens correctly                | ⬜     |
| View product list in modal                           | ⬜     |
| Create supplier product (all required fields)        | ⬜     |
| Product Name required validation                     | ⬜     |
| Unit Cost required + non-negative validation         | ⬜     |
| Lead Time non-negative validation                    | ⬜     |
| Optional inventory item link                         | ⬜     |
| One-to-one inventory item constraint enforced        | ⬜     |
| Edit supplier product (inline form)                  | ⬜     |
| Cancel edit without saving                           | ⬜     |
| Edit validation (empty name, negative cost)          | ⬜     |
| Hard delete supplier product                         | ⬜     |
| Delete confirmation modal with warning               | ⬜     |
| Linked Products section in View Supplier modal       | ⬜     |
| Product without inventory link                       | ⬜     |
| Branch scoping (HM sees all, others filtered)        | ⬜     |
| Audit logging (CREATE, UPDATE, DELETE)               | ⬜     |
| RBAC enforcement (HM, POC, JS only)                  | ⬜     |
| Loading skeleton on modal open                       | ⬜     |
| Empty state for no products                          | ⬜     |

---

## Merged Module: Supplier Management

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

