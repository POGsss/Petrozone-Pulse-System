# Pricing Workflow - Testing Guide & Process Documentation

## Important Context

The current system no longer uses a standalone Pricing Matrix page in the frontend. Pricing behavior is now implemented through Labor Items (`LaborManagement`) and resolved per vehicle class in Job Orders.

This file documents how to test the active pricing workflow in the current implementation.

## How Pricing Works in the Current System

Pricing is derived from:
1. Labor item rates (`light_price`, `heavy_price`, `extra_heavy_price`)
2. Inventory cost prices (`cost_price`)
3. Package fixed price (`package_items.price`) with overflow-based labor redistribution in package breakdown

### Key Business Rules

1. Labor items require non-negative prices for all three vehicle classes.
2. Job Order labor line price is selected using the order vehicle class.
3. Package line price always uses package fixed price.
4. Inactive labor items should not be available in active line selectors.
5. Labor delete action is dynamic:
   - hard delete when unreferenced
   - deactivate when referenced by job order lines/items or package labor links

### RBAC (Role-Based Access Control)

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| View labor pricing records | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create labor item rates | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit labor item rates | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete/Deactivate labor items | ✅ | ✅ | ✅ | ✅ | ❌ |

### API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/labor-items` | List labor items |
| GET | `/api/labor-items/:id` | Get labor item details |
| GET | `/api/labor-items/:id/delete-mode` | Check delete/deactivate mode |
| POST | `/api/labor-items` | Create labor item with class rates |
| PUT | `/api/labor-items/:id` | Update labor item rates/status |
| DELETE | `/api/labor-items/:id` | Delete/deactivate labor item |

---

## Sample Data to Populate

### Labor Item Samples
| Name | Light | Heavy | Extra Heavy | Status |
| ---- | ----- | ----- | ----------- | ------ |
| Oil Change Labor | 400 | 600 | 850 | active |
| Brake Cleaning | 350 | 500 | 700 | active |
| Underchassis Inspection | 300 | 450 | 650 | active |
| Legacy Rate Item | 280 | 430 | 600 | inactive |

### Vehicle Samples
| Vehicle | Vehicle Class |
| ------- | ------------- |
| Isuzu NMR | light |
| Hino 500 | heavy |
| UD Quester | extra_heavy |

### Package Sample (for Reference Checks)
| Package | Labor Link |
| ------- | ---------- |
| Basic PMS | Oil Change Labor x1 |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as HM/POC/JS/R for management tests
- At least one job order and one package for reference checks

---

### Test 1 — Labor Pricing List and Stats

Goal: Verify Labor Management list represents pricing records.

1. Open Labor Management page.

Verify:
- ✅ Stats show total/active/inactive counts
- ✅ Table/card rows show labor name and all class rates
- ✅ Status badge reflects active/inactive

---

### Test 2 — Create Labor Item with Valid Prices

Goal: Verify valid create flow.

1. Click Add Labor Item.
2. Enter name and all three prices.
3. Save.

Verify:
- ✅ Record is created
- ✅ New row/card appears with entered rates

---

### Test 3 — Price Validation (Non-Negative)

Goal: Verify pricing validation enforcement.

1. Try creating with a negative price.
2. Try creating with empty price fields.

Verify:
- ✅ Validation blocks save
- ✅ Error message indicates non-negative/required pricing

---

### Test 4 — Edit Labor Pricing

Goal: Verify update flow for rates and status.

1. Edit an existing labor item.
2. Change one or more class rates.
3. Toggle status if needed.
4. Save.

Verify:
- ✅ Changes persist correctly
- ✅ Updated values appear immediately in list

---

### Test 5 — Search and Status Filter

Goal: Verify table filtering behaviors.

1. Search by labor name.
2. Filter by active/inactive/all.

Verify:
- ✅ Results narrow correctly
- ✅ Reset returns full dataset
- ✅ Pagination resets to page 1 on search/filter changes

---

### Test 6 — Delete Mode (Unreferenced Labor)

Goal: Verify hard delete path.

1. Open delete modal for an unreferenced labor item.

Verify:
- ✅ Delete mode check runs
- ✅ Action label is Delete
- ✅ Confirming removes record from list

---

### Test 7 — Delete Mode (Referenced Labor)

Goal: Verify deactivate fallback path.

1. Use labor item referenced by package or job order.
2. Open delete modal.

Verify:
- ✅ Modal switches to Deactivate mode
- ✅ Confirming deactivates instead of hard deleting
- ✅ Success toast indicates deactivation

---

### Test 8 — Job Order Labor Pricing Resolution

Goal: Verify JO uses vehicle-class-specific labor rates.

1. Create JO with vehicle class `light` and add labor line.
2. Repeat for `heavy` and `extra_heavy`.

Verify:
- ✅ Labor line unit price matches corresponding class rate
- ✅ Line total and Grand Total recalculate correctly

---

### Test 9 — Package + Pricing Interaction

Goal: Verify package pricing interaction follows fixed-price rules.

1. Create or edit a package with a fixed price and labor links.
2. Use that package in JO and inspect package breakdown.
3. Add vehicle-specific inventory to the package line in JO.

Verify:
- ✅ Package line total remains equal to package fixed price
- ✅ Package breakdown shows labor and inventory components
- ✅ Overflow-based labor deduction appears only when labor + inventory exceeds package price

---

## Summary Checklist

| Requirement | Status |
| ----------- | ------ |
| Labor-based pricing records available | ⬜ |
| Class-rate create/edit validation | ⬜ |
| Search and status filters working | ⬜ |
| Dynamic delete/deactivate labor flow | ⬜ |
| JO labor line class-rate resolution | ⬜ |
| Package fixed-price interaction validation | ⬜ |
