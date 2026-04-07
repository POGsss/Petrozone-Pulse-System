# Packages Module - Testing Guide & Process Documentation

## How Packages Work in the Current System

Packages are global service templates with a fixed price and labor-only composition. These package templates are used in Job Order package lines.

### Key Business Rules

1. Packages are global (not branch-specific).
2. Package name is required.
3. Package price is required and must be greater than 0.
4. Package composition supports labor links only with quantity > 0.
5. Duplicate labor links are blocked per package.
6. Active packages are selectable for new job orders.
7. Delete behavior is dynamic:
   - hard delete if unreferenced
   - deactivate (`status=inactive`) if referenced
8. Delete modal checks mode first and updates copy/actions dynamically.

### RBAC (Role-Based Access Control)

| Action | HM | POC | JS | R |
| ------ | -- | --- | -- | - |
| View packages | ✅ | ✅ | ✅ | ✅ |
| Create package | ✅ | ✅ | ✅ | ❌ |
| Edit package | ✅ | ✅ | ✅ | ❌ |
| Delete/Deactivate package | ✅ | ✅ | ✅ | ❌ |

### API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/packages` | List packages with filters |
| GET | `/api/packages/:itemId` | Get package by ID |
| GET | `/api/packages/:itemId/delete-mode` | Determine delete vs deactivate mode |
| POST | `/api/packages` | Create package |
| PUT | `/api/packages/:itemId` | Update package |
| DELETE | `/api/packages/:itemId` | Delete/deactivate package |
| GET | `/api/packages/:itemId/labor-items` | List labor links |
| POST | `/api/packages/:itemId/labor-items` | Add labor link |
| PUT | `/api/packages/:itemId/labor-items/:linkId` | Update labor link quantity |
| DELETE | `/api/packages/:itemId/labor-items/:linkId` | Remove labor link |

---

## Sample Data to Populate

### Labor Items
| Name | Light | Heavy | Extra Heavy | Status |
| ---- | ----- | ----- | ----------- | ------ |
| Oil Change Labor | 400 | 600 | 850 | active |
| Brake Cleaning | 350 | 500 | 700 | active |
| Wheel Alignment | 600 | 850 | 1200 | active |

### Package Samples
| Name | Description | Price | Labor Links | Status |
| ---- | ----------- | ----- | ----------- | ------ |
| Basic PMS | Standard maintenance | 1500 | Oil Change Labor x1 | active |
| Brake Service | Brake line package | 800 | Brake Cleaning x1 | active |
| Legacy Promo | Inactive archived package | 1200 | Wheel Alignment x1 | inactive |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as HM/POC/JS for create/update/delete tests
- Labor module has active records
- At least one package referenced by a job order, one unreferenced package

---

### Test 1 — Empty State and Search/Filter Visibility

Goal: Verify empty grid behavior.

1. Ensure no packages exist.
2. Open Packages page.

Verify:
- ✅ Empty message is shown
- ✅ Search/filter bar is hidden when there are no package cards

---

### Test 2 — Create Package (Metadata + Labor Components)

Goal: Verify end-to-end package creation.

1. Click Add Package.
2. Enter name, fixed price, and description.
3. Add labor component(s) with quantity.
4. Save.

Verify:
- ✅ Package is created successfully
- ✅ Card appears in grid
- ✅ Price is shown correctly
- ✅ Labor component counts match added links
- ✅ No inventory section is shown in package management

---

### Test 3 — Validation Rules

Goal: Verify required and numeric validation.

1. Try creating with empty name.
2. Try creating with empty/zero/negative price.
2. Try adding component with quantity <= 0.
3. Try duplicate labor links.

Verify:
- ✅ Name required validation is enforced
- ✅ Price validation is enforced
- ✅ Quantity validation is enforced
- ✅ Duplicate labor links are prevented

---

### Test 4 — View Package Breakdown

Goal: Verify package detail modal shows composition.

1. Open View modal on a package card.

Verify:
- ✅ Labor components list is accurate
- ✅ Quantities and item labels are correct

---

### Test 5 — Edit Package Metadata and Composition

Goal: Verify package update flow.

1. Edit package name/description/status.
2. Edit package fixed price.
2. Add/remove component links.
3. Update link quantities.
4. Save.

Verify:
- ✅ Updated metadata persists
- ✅ Updated price persists
- ✅ Composition changes persist
- ✅ Card/list reflects updates

---

### Test 6 — Filter and Search

Goal: Verify list filtering and search behavior.

1. Search by package name and description.
2. Filter by status.

Verify:
- ✅ Results update correctly
- ✅ Combined filter + search behavior is correct
- ✅ Pagination resets to page 1 on filter/search change

---

### Test 7 — Delete Mode Check (Unreferenced)

Goal: Verify hard delete path.

1. Open delete modal for an unreferenced package.

Verify:
- ✅ Modal checks references first
- ✅ Action shows Delete mode
- ✅ Confirming removes package permanently from list

---

### Test 8 — Delete Mode Check (Referenced)

Goal: Verify deactivate fallback path.

1. Open delete modal for a package used by job orders.

Verify:
- ✅ Modal switches to Deactivate mode
- ✅ Confirmation text explains deactivation fallback
- ✅ Confirming sets package status to inactive
- ✅ Success toast indicates deactivation

---

### Test 9 — Job Order Integration

Goal: Verify package availability and use in JO flow.

1. Open Job Order create modal.
2. Check package options.

Verify:
- ✅ Active packages are available for selection
- ✅ Inactive/deactivated packages are excluded from active selection

---

## Summary Checklist

| Requirement | Status |
| ----------- | ------ |
| Package create/edit with fixed price + labor composition | ⬜ |
| Name/price/quantity/duplicate validation rules | ⬜ |
| View breakdown accuracy | ⬜ |
| Search and status filter behavior | ⬜ |
| Dynamic delete/deactivate modal behavior | ⬜ |
| Hard delete for unreferenced packages | ⬜ |
| Deactivate fallback for referenced packages | ⬜ |
| Active-only package selection in Job Orders | ⬜ |

