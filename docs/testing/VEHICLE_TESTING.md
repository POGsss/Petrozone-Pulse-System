# Vehicle Management — Testing Guide & Process Documentation

---

## How Vehicle Management Works in the System

### Overview

The Vehicle Management module allows authorized users to create and manage vehicle profiles linked to customers. Vehicles are central to the job order workflow — every job order requires a vehicle. The module uses a responsive card grid display and supports conditional delete with a pre-check for job order references.

### Key Business Rules

1. **Plate number uniqueness** — each vehicle must have a unique plate number system-wide (auto-uppercased).
2. **Customer required** — every vehicle must be linked to a customer.
3. **Same-branch constraint** — the vehicle must belong to the same branch as its linked customer.
4. **Branch set at creation** — branch is assigned at creation and cannot be changed in the Edit modal.
5. **Conditional delete with pre-check** — before showing the delete confirmation, the frontend checks if the vehicle has job order references. If yes, the modal shows "Deactivate" instead of "Delete".
6. **Vehicle types** — 10 options: Sedan, SUV, Truck, Van, Motorcycle, Hatchback, Coupe, Wagon, Bus, Other.
7. **Vehicle class** — weight classification used for job order pricing: Light, Heavy, or Extra Heavy. Defaults to "Light" if not specified. This field is set when creating/editing a vehicle and automatically used when creating job orders.
8. **OR/CR required** — the vehicle's Official Receipt / Certificate of Registration is mandatory.
9. **Year validation** — if provided, must be between 1900 and (current year + 1).

### RBAC (Roles & Permissions)

| Action                    | HM  | POC | JS  |  R  |  T  |
| ------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Vehicles             | ✅  | ✅  | ✅  | ✅  |  —  |
| Create Vehicle            | ✅  | ✅  | ✅  | ✅  |  —  |
| Update Vehicle            | ✅  | ✅  | ✅  | ✅  |  —  |
| Delete/Deactivate Vehicle | ✅  | ✅  | ✅  | ✅  |  —  |

> **Note:** The Technician (T) role cannot access the Vehicles page at all.

### API Endpoints

| Method   | Endpoint                              | Description                         |
| -------- | ------------------------------------- | ----------------------------------- |
| `GET`    | `/api/vehicles`                       | List vehicles (paginated, filtered) |
| `GET`    | `/api/vehicles/:vehicleId`            | Get single vehicle                  |
| `POST`   | `/api/vehicles`                       | Create vehicle                      |
| `PUT`    | `/api/vehicles/:vehicleId`            | Update vehicle                      |
| `GET`    | `/api/vehicles/:vehicleId/references` | Check if vehicle has JO references  |
| `DELETE` | `/api/vehicles/:vehicleId`            | Delete/deactivate vehicle           |

---

## Sample Data to Populate

> **Pre-requisite:** Customers must exist first (see `CUSTOMER_TESTING.md`).

Use the **"Add New Vehicle"** button. Create each vehicle below:

| #   | Plate Number | Type       | Model             | OR/CR      | Customer           | Branch | Color | Year | Vehicle Class |
| --- | ------------ | ---------- | ----------------- | ---------- | ------------------ | ------ | ----- | ---- | ------------- |
| 1   | ABC 1234     | Sedan      | Toyota Vios 2022  | 1234567890 | Juan Dela Cruz     | MAIN   | White | 2022 | Light         |
| 2   | XYZ 5678     | SUV        | Ford Everest 2023 | 0987654321 | AutoFleet Corp     | MAIN   | Black | 2023 | Heavy         |
| 3   | DEF 9012     | Motorcycle | Honda Click 160   | 1122334455 | Maria Clara        | NORTH  | Red   | 2024 | Light         |
| 4   | GHI 3456     | Truck      | Isuzu NLR 2021    | 5566778899 | Pedro Shipping Inc | SOUTH  | Blue  | 2021 | Extra Heavy   |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, **JS**, or **R**
- At least one branch and one active customer exist

---

### Test 1 — View Vehicle List

**Goal:** Verify the vehicle card grid loads correctly.

1. Navigate to **Vehicles** from the sidebar
2. Verify the header shows **"Vehicles"** with subtitle `"{count} vehicles total"`
3. Verify vehicles display as cards in a responsive grid
4. Each card should show:
   - ✅ **Plate number** (header, bold)
   - ✅ **Branch code** badge
   - ✅ **Status** badge ("Active" / "Inactive")
   - ✅ **Vehicle type** label
   - ✅ **Vehicle class** label (Light / Heavy / Extra Heavy)
   - ✅ **Model**
   - ✅ **OR/CR**
   - ✅ **Color** and **Year** (if present)
   - ✅ **Customer name**
   - ✅ Edit and Delete action buttons

---

### Test 2 — Create Vehicle

**Goal:** Verify a new vehicle can be created with all required fields.

1. Click **"Add New Vehicle"** → the **"Add New Vehicle"** modal opens
2. Fill in the form with Sample Data Vehicle #1:
   - **Section: "Vehicle Information"**
     - Plate Number: `abc 1234` (type lowercase — it auto-uppercases)
     - Vehicle Type: `Sedan`
     - Vehicle Class: `Light`
     - Model: `Toyota Vios 2022`
     - OR/CR: `1234567890`
   - **Section: "Assignment"**
     - Branch: `MAIN` (selecting a branch filters the customer dropdown)
     - Customer: `Juan Dela Cruz` (filtered to MAIN branch customers)
   - **Section: "Additional Details"**
     - Color: `White`
     - Year: `2022`
     - Engine Number, Chassis Number, Notes: (optional)
3. Click **"Create Vehicle"**
4. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"Vehicle created successfully"`
   - ✅ Vehicle card appears in the grid
   - ✅ Plate number shows as `ABC 1234` (uppercased)
5. Repeat for all 4 sample vehicles

**Edge cases to test:**

- Empty Plate Number → error: `"Plate number is required"`
- Empty OR/CR → error: `"OR/CR is required"`
- Empty Model → error: `"Model is required"`
- Empty Customer → error: `"Customer is required"`
- Empty Branch → error: `"Branch is required"`
- Duplicate plate number → error: `"A vehicle with this plate number already exists"`
- Year outside 1900–(current+1) → error: `"Invalid year"`
- No active customers for selected branch → warning: `"No active customers found for this branch. Create a customer first."`

---

### Test 3 — View Vehicle Details

**Goal:** Verify the view modal shows all vehicle data.

1. Click on a vehicle card to open the view modal
2. Verify the **"Vehicle Details"** modal shows:
   - ✅ **"Vehicle Information"** — Plate Number (monospace), Vehicle Type, Vehicle Class, Model, OR/CR, Status (all disabled)
   - ✅ **"Assignment"** — Customer, Branch (all disabled)
   - ✅ **"Additional Details"** — Color, Year, Engine Number, Chassis Number, Notes (all disabled)
   - ✅ **"Linked Job Orders"** — linked job order cards showing order number, status, and created date
   - ✅ **"Timestamps"** — Created and Updated dates

---

### Test 4 — Update Vehicle

**Goal:** Verify vehicle details can be edited.

1. Click the **Edit** (pencil) button on a vehicle card
2. Verify the **"Edit Vehicle"** modal opens with pre-filled data
3. Verify that **Branch** is NOT editable (set at creation only)
4. Change the **Vehicle Class** to `Heavy`
5. Change the **Model** to a new value (e.g., `"Toyota Vios 2024 Facelift"`)
6. Change the **Color** to a new value
7. Change the **Status** to `Inactive`
7. Click **"Save Changes"**
8. Verify:
   - ✅ Toast: `"Vehicle updated successfully"`
   - ✅ Card updates to show the new model, color, and inactive status

**Edge cases to test:**

- Clear Plate Number → error: `"Plate number cannot be empty"`
- Clear OR/CR → error: `"OR/CR cannot be empty"`
- Clear Model → error: `"Model cannot be empty"`
- Clear Customer → error: `"Customer is required"`
- Change plate to an existing one → error: `"A vehicle with this plate number already exists"`

---

### Test 5 — Search Vehicles

**Goal:** Verify search works across vehicle fields.

1. Type `"ABC"` → vehicle with plate ABC 1234 appears
2. Type `"Vios"` → Toyota Vios appears (matched on model)
3. Type `"1234567890"` → matched on OR/CR
4. Type `"Juan"` → matched on customer name
5. Type `"Red"` → Honda Click appears (matched on color)
6. Clear the search → all vehicles reappear

---

### Test 6 — Filter Vehicles

**Goal:** Verify filter functionality.

1. **Filter by Status**: select `"Active"` → only active vehicles shown
2. **Filter by Vehicle Type**: select `"SUV"` → only SUV vehicles shown
3. **Filter by Branch**: select `"NORTH"` → only NORTH branch vehicles shown
4. Reset filters → all vehicles shown
5. Verify pagination: 12 items per page

---

### Test 7 — Delete Vehicle (No Job Orders — Hard Delete)

**Goal:** Verify a vehicle with no job orders is permanently deleted.

1. Find a vehicle with **no job orders** linked
2. Click the **Delete** (trash) icon
3. Verify the confirmation modal:
   - ✅ Title: **"Delete Vehicle"**
   - ✅ Message: `"Are you sure you want to delete {plate_number} ({model})?"`
   - ✅ Warning: `"This vehicle will be permanently removed. This action cannot be undone."`
4. Click **"Delete"**
5. Verify:
   - ✅ Toast shows the result message (e.g., `"Vehicle deleted successfully"`)
   - ✅ Vehicle card disappears from the grid

---

### Test 8 — Delete Vehicle (Has Job Orders — Deactivation)

**Goal:** Verify a vehicle with job orders is deactivated instead of deleted.

1. Create a job order linked to a vehicle (via Job Order Management)
2. Return to Vehicles page
3. Click **Delete** on that vehicle
4. Verify the confirmation modal changes:
   - ✅ Title: **"Deactivate Vehicle"** (not "Delete Vehicle")
   - ✅ Warning: `"The vehicle will be marked as inactive and hidden from active lists."`
   - ✅ Button text: **"Deactivate"** (not "Delete")
5. Confirm the deactivation
6. Verify:
   - ✅ The vehicle card remains but shows **"Inactive"** status
   - ✅ Backend response: `"Vehicle deactivated (has existing job orders)"`

---

### Test 9 — Branch-Customer Consistency

**Goal:** Verify vehicles must match their customer's branch.

1. Open the Add Vehicle modal
2. Select **Branch A** → Customer dropdown filters to Branch A customers only
3. Change branch to **Branch B** → Customer dropdown resets and shows Branch B customers
4. Verify:
   - ✅ You cannot link a vehicle in Branch A to a customer in Branch B

---

### Test 10 — Branch Scoping

**Goal:** Verify users only see vehicles for their assigned branches.

1. Log in as a non-HM user assigned to one branch
2. Navigate to Vehicles → should only see vehicles in that branch
3. Log in as **HM** → should see vehicles across all branches

---

### Test 11 — Audit Logging

**Goal:** Verify vehicle operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ Vehicle creation (action: CREATE)
   - ✅ Vehicle update (action: UPDATE)
   - ✅ Vehicle deletion/deactivation (action: DELETE / UPDATE)

---

## Summary Checklist

| Requirement                                   | Status |
| --------------------------------------------- | ------ |
| View Vehicles (Card Grid)                     | ⬜     |
| Create Vehicle (All Required Fields)          | ⬜     |
| Plate Number Auto-Uppercase                   | ⬜     |
| Plate Number Uniqueness                       | ⬜     |
| OR/CR Required                                | ⬜     |
| Customer Required (Same Branch)               | ⬜     |
| Branch Set at Creation (Immutable)            | ⬜     |
| Vehicle Type Selection (10 types)             | ⬜     |
| Vehicle Class Selection (Light/Heavy/Extra Heavy) | ⬜     |
| Year Validation (1900 to current+1)           | ⬜     |
| View Vehicle Details                          | ⬜     |
| Update Vehicle                                | ⬜     |
| Search (Plate, Model, OR/CR, Color, Customer) | ⬜     |
| Filter by Status                              | ⬜     |
| Filter by Vehicle Type                        | ⬜     |
| Filter by Branch                              | ⬜     |
| Delete — Hard Delete (No JOs)                 | ⬜     |
| Delete — Deactivate (Has JOs, Pre-check)      | ⬜     |
| Branch-Customer Consistency                   | ⬜     |
| Branch Scoping (HM vs Others)                 | ⬜     |
| Pagination (12 per page)                      | ⬜     |
| Audit Logging                                 | ⬜     |
| RBAC Enforcement (T Cannot Access)            | ⬜     |

