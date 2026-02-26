# Supplier Products — Testing Guide & Process Documentation

---

## How Supplier Products Work in the System

### Overview

The Supplier Products module (Sprint 3, Module 4) manages the catalog of products that each supplier offers. Products are accessed via the Supplier Management page — each supplier card has a 3-dots dropdown menu with a "Manage Products" action. Products can optionally be linked to inventory items (one-to-one relationship). The module supports full CRUD with mandatory field validation, one-to-one inventory linking, branch isolation, and audit logging.

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
