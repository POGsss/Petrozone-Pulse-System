# Job Order Module - Testing Guide & Process Documentation

## How Job Orders Work in the Current System

The Job Order module now runs on a line-based workflow. A job order can contain any mix of:
- Package lines
- Labor lines
- Inventory lines

Third-party repairs are managed separately but are still included in the displayed Grand Total.

### Key Business Rules

1. Job orders are branch-scoped; non-HM users only operate within assigned branches.
2. Create requires customer, vehicle, branch, odometer reading, and vehicle bay.
3. At least one line is required to create or save a valid draft.
4. Labor pricing is vehicle-class-aware (`light`, `heavy`, `extra_heavy`).
5. Package lines can include base components and vehicle-specific components.
6. Draft line editing is supported in dedicated Packages, Labor, and Inventory sections.
7. Deleting a job order is soft-delete (deactivated state), not physical removal.
8. Grand Total includes line totals plus third-party repairs.
9. Search/filter bar is shown only when job orders exist in the grid.

### RBAC (Role-Based Access Control)

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| View Job Orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Draft Job Order | ❌ | ✅ | ✅ | ✅ | ❌ |
| Edit Draft Job Order | ❌ | ✅ | ✅ | ✅ | ❌ |
| Request Approval | ❌ | ✅ | ✅ | ✅ | ❌ |
| Record Approval | ❌ | ❌ | ❌ | ✅ | ✅ |
| Start Work | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mark Ready | ❌ | ✅ | ❌ | ❌ | ✅ |
| Record Payment | ❌ | ❌ | ❌ | ✅ | ✅ |
| Complete Job Order | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel Job Order | ❌ | ✅ | ✅ | ✅ | ❌ |

## Core API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/job-orders` | List job orders with filters/pagination |
| GET | `/api/job-orders/:id` | Get one job order with lines/details |
| POST | `/api/job-orders` | Create line-based draft |
| PATCH | `/api/job-orders/:id` | Update line-based draft |
| DELETE | `/api/job-orders/:id` | Soft-delete (deactivate) job order |
| PATCH | `/api/job-orders/:id/request-approval` | Draft -> Pending Approval |
| PATCH | `/api/job-orders/:id/record-approval` | Pending Approval -> Approved (stock-validated) |
| PATCH | `/api/job-orders/:id/reject` | Pending Approval -> Rejected |
| PATCH | `/api/job-orders/:id/cancel` | Draft/Pending -> Cancelled |
| PATCH | `/api/job-orders/:id/start-work` | Approved -> In Progress |
| PATCH | `/api/job-orders/:id/mark-ready` | In Progress -> Ready for Release |
| PATCH | `/api/job-orders/:id/record-payment` | Ready for Release -> Pending Payment |
| PATCH | `/api/job-orders/:id/complete` | Pending Payment -> Completed |

---

## Sample Data to Populate

Before testing, make sure all linked modules contain data.

### Branches
- Main Branch
- North Branch

### Customers and Vehicles
| Customer | Vehicle | Plate | Vehicle Class | Branch |
| -------- | ------- | ----- | ------------- | ------ |
| Juan Dela Cruz | Isuzu NMR | NAA-1010 | light | Main Branch |
| Maria Santos | Hino 500 | NAB-2020 | heavy | North Branch |
| Logistics Corp | UD Quester | NAC-3030 | extra_heavy | Main Branch |

### Labor Items
| Name | Light | Heavy | Extra Heavy | Status |
| ---- | ----- | ----- | ----------- | ------ |
| Brake Cleaning | 350 | 500 | 700 | active |
| Oil Change Labor | 400 | 600 | 850 | active |
| Underchassis Inspection | 300 | 450 | 650 | active |

### Inventory Items
| Item | Cost Price | Stock | Branch | Status |
| ---- | ---------- | ----- | ------ | ------ |
| Engine Oil 15W40 | 420 | 200 | Main Branch | active |
| Oil Filter OF-22 | 180 | 100 | Main Branch | active |
| Brake Fluid 1L | 220 | 75 | North Branch | active |

### Packages
| Package | Base Labor | Base Inventory | Status |
| ------- | ---------- | -------------- | ------ |
| Basic PMS | Oil Change Labor x1 | Engine Oil 15W40 x6, Oil Filter OF-22 x1 | active |
| Brake Service | Brake Cleaning x1 | Brake Fluid 1L x2 | active |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as role appropriate for each step
- Test data above is available
- At least one branch assignment exists for test user

---

### Test 1 - Empty State and Search/Filter Visibility

Goal: Verify empty-state behavior and conditional search/filter visibility.

1. Ensure no active job orders exist.
2. Open Job Orders page.

Verify:
- ✅ Header loads correctly with `0 orders total`
- ✅ Search/filter bar is hidden
- ✅ Empty message appears in grid

---

### Test 2 - Create Draft with Package Line Only

Goal: Verify package-only draft creation.

1. Click Create Job Order.
2. Fill required order fields.
3. Add one package line.
4. Save draft.

Verify:
- ✅ Draft is created successfully
- ✅ New card appears in grid
- ✅ Package line total is computed
- ✅ Grand Total reflects package line amount

---

### Test 3 - Create Draft with Labor + Inventory Mix

Goal: Verify mixed line creation and totals.

1. Create another draft.
2. Add one labor line and one inventory line.
3. Save draft.

Verify:
- ✅ Draft saves successfully
- ✅ Both sections are represented in View
- ✅ Grand Total equals labor + inventory totals

---

### Test 4 - Package Breakdown in View Modal

Goal: Ensure package composition details are visible in View.

1. Open a draft containing package lines.
2. Open View modal.

Verify:
- ✅ Packages section is visible when package lines exist
- ✅ Base components are listed
- ✅ Vehicle-specific components are listed when present
- ✅ Empty sections are hidden

---

### Test 5 - Edit Draft with Section-Based Lines

Goal: Verify Edit modal supports independent sections.

1. Open Edit for a draft.
2. Add/remove/update package, labor, and inventory lines.
3. Save.

Verify:
- ✅ Packages/Labor/Inventory sections work independently
- ✅ Validation blocks save if all lines are removed
- ✅ Saved data matches latest edits in View modal

---

### Test 6 - Third-Party Repairs and Grand Total

Goal: Verify repairs are included in totals.

1. Open repair management for an order.
2. Add at least one third-party repair with cost.
3. Return to card and View modal.

Verify:
- ✅ Repair appears in repair list
- ✅ Grand Total includes repair cost
- ✅ Total consistency: card, order info, and modal all match

---

### Test 7 - Request Approval Validation

Goal: Verify draft -> pending approval flow.

1. From draft, click Request Approval.

Verify:
- ✅ Status changes to Pending Approval
- ✅ Validation rejects invalid quantities/invalid lines

---

### Test 8 - Record Approval with Stock Check

Goal: Verify stock-sensitive approval.

1. Open pending order with sufficient stock and approve.
2. Repeat with insufficient stock scenario.

Verify:
- ✅ Sufficient stock: status becomes Approved
- ✅ Insufficient stock: approval is blocked with error

---

### Test 9 - Work Execution Status Flow

Goal: Verify full lifecycle transitions.

1. Approved -> Start Work
2. In Progress -> Mark Ready
3. Ready for Release -> Record Payment
4. Pending Payment -> Complete

Verify:
- ✅ Each transition is allowed only in valid prior status
- ✅ Final status is Completed

---

### Test 10 - Reject and Cancel Flows

Goal: Verify alternate transition paths.

1. Reject one pending order with reason.
2. Cancel one draft/pending order with reason.

Verify:
- ✅ Rejected status is stored with rejection reason
- ✅ Cancelled status is stored with cancellation reason

---

### Test 11 - Delete (Soft Deactivate) Behavior

Goal: Verify delete does not hard-remove records.

1. Delete a job order from the list.
2. Switch to status filter `deactivated`.

Verify:
- ✅ Order is removed from default active list
- ✅ Order is visible under deactivated status
- ✅ Historical references remain intact

---

### Test 12 - Search and Filter Behavior with Records

Goal: Verify list filtering once records exist.

1. Ensure at least one order exists.
2. Use search by order number/customer/vehicle.
3. Filter by status and branch.

Verify:
- ✅ Search/filter bar is visible when records exist
- ✅ Search narrows results correctly
- ✅ Status and branch filters apply correctly
- ✅ Pagination resets to page 1 when filter/search changes

---

## Summary Checklist

| Requirement | Status |
| ----------- | ------ |
| Line-based Create/Edit (Package/Labor/Inventory) | ⬜ |
| View modal shows package breakdown details | ⬜ |
| Empty sections hidden in View modal | ⬜ |
| Grand Total includes lines + repairs | ⬜ |
| Draft -> Approval -> Execution -> Completion flow | ⬜ |
| Reject/Cancel paths with reasons | ⬜ |
| Soft delete (deactivated) behavior | ⬜ |
| Search/filter hidden on empty state | ⬜ |
| Search/filter shown when records exist | ⬜ |
| Branch-scoped access and RBAC | ⬜ |
