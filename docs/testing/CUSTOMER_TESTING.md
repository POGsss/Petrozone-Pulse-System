# Customer Management — Testing Guide & Process Documentation

---

## How Customer Management Works in the System

### Overview

The Customer Management module allows users to create and manage customer records. Customers are linked to branches and can be associated with vehicles and job orders. The module supports both individual and company customer types, with a conditional delete strategy that protects customers with existing job order references.

### Key Business Rules

1. **At least one contact method** — either phone number or email (or both) must be provided.
2. **Branch assignment** — each customer belongs to a branch, set at creation and immutable after.
3. **Customer types** — `individual` or `company`.
4. **Conditional delete** — if the customer has existing job orders, they are **deactivated** (soft delete) instead of permanently deleted. If no JOs exist, the customer and their associated vehicles are permanently removed.
5. **FK fallback** — if hard delete fails due to a foreign key constraint, the system falls back to soft delete (deactivation).
6. **Phone validation** — must be 7–20 digits (allows `+`, `-`, `()`, and spaces).
7. **Email validation** — checked against a regex pattern on both frontend and backend.
8. **View modal** — shows linked vehicles and linked job orders.

### RBAC (Roles & Permissions)

| Action          | HM  | POC | JS  |  R  |  T  |
| --------------- | :-: | :-: | :-: | :-: | :-: |
| View Customers  | ✅  | ✅  | ✅  | ✅  | ✅  |
| Create Customer | ✅  | ✅  | ✅  | ✅  |  —  |
| Update Customer |  —  | ✅  | ✅  | ✅  | ✅  |
| Delete Customer |  —  | ✅  | ✅  | ✅  |  —  |

> **Note:** HM can view and create but not update or delete. T can view and update but not create or delete.

### API Endpoints

| Method   | Endpoint                     | Description                          |
| -------- | ---------------------------- | ------------------------------------ |
| `GET`    | `/api/customers`             | List customers (paginated, filtered) |
| `GET`    | `/api/customers/:customerId` | Get single customer                  |
| `POST`   | `/api/customers`             | Create customer                      |
| `PUT`    | `/api/customers/:customerId` | Update customer                      |
| `DELETE` | `/api/customers/:customerId` | Delete/deactivate customer           |

---

## Sample Data to Populate

Use the **"Add New Customer"** button. Create each customer below:

| #   | Full Name          | Contact Number   | Email              | Type       | Branch | Address               |
| --- | ------------------ | ---------------- | ------------------ | ---------- | ------ | --------------------- |
| 1   | Juan Dela Cruz     | +63 917 123 4567 | juan@email.com     | Individual | MAIN   | 123 Mabini St, Makati |
| 2   | AutoFleet Corp     | +63 2 8765 4321  | fleet@autofleet.ph | Company    | MAIN   | BGC, Taguig City      |
| 3   | Maria Clara        | +63 918 987 6543 | —                  | Individual | NORTH  | Cubao, QC             |
| 4   | Pedro Shipping Inc | —                | pedro@shipping.ph  | Company    | SOUTH  | Alabang, Muntinlupa   |

> **Tip:** Customer #3 has no email and Customer #4 has no phone — test the "at least one contact method" rule.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as an authorized role (HM, POC, JS, or R for creation)
- At least one branch exists

---

### Test 1 — View Customer List

**Goal:** Verify the customer table loads correctly with stats.

1. Navigate to **Customers** from the sidebar
2. Verify the **stats cards** at the top:
   - ✅ **All Customers** — total count
   - ✅ **Active** — active customer count
   - ✅ **Inactive** — inactive count (total minus active)
3. Verify the table columns:
   - ✅ **Name** (22%) — full name
   - ✅ **Contact** (25%) — contact number
   - ✅ **Type** (12%) — badge: "Company" or "Individual"
   - ✅ **Branch** (15%) — branch code badge
   - ✅ **Status** (12%) — pill badge: "Active" / "Inactive"
   - ✅ **Actions** (14%) — Edit + Delete buttons (conditional by role)

---

### Test 2 — Create Customer

**Goal:** Verify a new customer can be created with required fields.

1. Click **"Add New Customer"** → the **"Add New Customer"** modal opens
2. Fill in the form with Sample Data Customer #1:
   - **Section: "Customer Information"**
     - Full Name: `Juan Dela Cruz`
     - Customer Type: `Individual`
     - Branch: `MAIN`
   - **Section: "Contact Details"**
     - Contact Number: `+63 917 123 4567`
     - Email: `juan@email.com`
     - Address: `123 Mabini St, Makati`
   - **Section: "Additional Information"**
     - Notes: (optional, leave blank)
3. Click **"Create Customer"**
4. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Customer created successfully"`
   - ✅ Customer appears in the table
   - ✅ Stats update: All Customers and Active counts increase
5. Repeat for all 4 sample customers

**Edge cases to test:**

- Empty Full Name → error: `"Full name is required"`
- Empty both Contact Number and Email → error: `"At least one contact method (phone or email) is required"`
- Phone outside 7–20 digits → error: `"Phone number must be between 7 and 20 digits"`
- Invalid email format → error: `"Invalid email format"`
- Empty Branch → error: `"Branch is required"`

---

### Test 3 — View Customer Details

**Goal:** Verify the view modal shows all customer data including linked records.

1. Click on a customer row in the table
2. Verify the **"Customer Details"** modal shows:
   - ✅ **"Customer Information"** — Full Name, Customer Type, Status, Branch (all disabled)
   - ✅ **"Contact Details"** — Contact Number, Email, Address (all disabled)
   - ✅ **"Additional Information"** — Notes (disabled)
   - ✅ **"Linked Vehicles"** — grid showing plate number, model, vehicle type for each linked vehicle
   - ✅ **"Linked Job Orders"** — grid showing order number, status, created date for each linked JO
   - ✅ **"Timestamps"** — Created and Updated dates

---

### Test 4 — Update Customer

**Goal:** Verify customer details can be edited.

1. Click the **Edit** (pencil) icon on a customer row
2. Verify the **"Edit Customer"** modal opens with pre-filled data
3. Verify that **Branch** is NOT editable (branch is set at creation only)
4. Change the **Full Name** to a new value
5. Change the **Customer Type** (e.g., Individual → Company)
6. Add or update the **Address**
7. Click **"Save Changes"**
8. Verify:
   - ✅ Button shows **"Saving..."** while processing
   - ✅ Toast: `"Customer updated successfully"`
   - ✅ Table reflects the changes

**Edge cases to test:**

- Clear Full Name → error: `"Full name cannot be empty"`
- Clear both phone and email → error: `"At least one contact method (phone or email) is required"`

---

### Test 5 — Search Customers

**Goal:** Verify search works across multiple fields.

1. Type `"Juan"` in the search bar → only Juan Dela Cruz appears
2. Type `"fleet"` → AutoFleet Corp appears (matched on email)
3. Type `"+63 918"` → Maria Clara appears (matched on contact number)
4. Type `"BGC"` → AutoFleet Corp appears (matched on address)
5. Clear the search → all customers reappear

---

### Test 6 — Filter Customers

**Goal:** Verify filter functionality.

1. **Filter by Status**: select `"Active"` → only active customers shown
2. **Advanced Filters** (click toggle):
   - **Filter by Type**: select `"Company"` → only company customers shown
   - **Filter by Branch**: select `"NORTH"` → only NORTH branch customers shown
3. Click **"Apply"** to apply filters
4. Click **"Reset"** to clear all filters
5. Verify pagination: 10 items per page

---

### Test 7 — Delete Customer (No Job Orders — Hard Delete)

**Goal:** Verify a customer with no job orders is permanently deleted.

1. Ensure a customer has **no job orders** linked (check View modal → "Linked Job Orders" should be empty)
2. Click the **Delete** (trash) icon
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Customer"**
   - ✅ Message: `"Are you sure you want to delete {full_name}?"`
   - ✅ Warning: `"This action cannot be undone. All customer data will be permanently removed."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast: `"Customer deleted successfully"`
   - ✅ Customer disappears from the table
   - ✅ Associated vehicles are also deleted

---

### Test 8 — Delete Customer (Has Job Orders — Soft Delete)

**Goal:** Verify a customer with job orders is deactivated instead of deleted.

1. Create a job order linked to a customer (via Job Order Management)
2. Click **Delete** on that customer
3. Confirm the deletion
4. Verify:
   - ✅ The customer is **not removed** from the table
   - ✅ Status changes to **"Inactive"**
   - ✅ Backend response includes: `"Customer deactivated (has existing job orders)"`

---

### Test 9 — Branch Scoping

**Goal:** Verify users only see customers for their assigned branches.

1. Log in as a **POC** assigned to MAIN branch only
2. Navigate to Customers → should only see customers in MAIN branch
3. Log in as **HM** → should see customers across all branches
4. Verify the Branch filter only shows accessible branches

---

### Test 10 — Audit Logging

**Goal:** Verify customer operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Customer creation (action: CREATE)
   - ✅ Customer update (action: UPDATE)
   - ✅ Customer deletion or deactivation (action: DELETE / UPDATE)

---

## Summary Checklist

| Requirement                            | Status |
| -------------------------------------- | ------ |
| View Customer List with Stats          | ⬜     |
| Create Customer (All Required Fields)  | ⬜     |
| At Least One Contact Method Required   | ⬜     |
| Phone Validation (7–20 digits)         | ⬜     |
| Email Format Validation                | ⬜     |
| Branch Set at Creation (Immutable)     | ⬜     |
| View Customer Details (Linked Records) | ⬜     |
| Update Customer                        | ⬜     |
| Search (Name, Email, Phone, Address)   | ⬜     |
| Filter by Status                       | ⬜     |
| Filter by Type (Advanced)              | ⬜     |
| Filter by Branch (Advanced)            | ⬜     |
| Delete — Hard Delete (No JOs)          | ⬜     |
| Delete — Soft Delete (Has JOs)         | ⬜     |
| FK Fallback to Deactivation            | ⬜     |
| Branch Scoping (HM vs Others)          | ⬜     |
| Pagination (10 per page)               | ⬜     |
| Audit Logging                          | ⬜     |
| RBAC Enforcement                       | ⬜     |

