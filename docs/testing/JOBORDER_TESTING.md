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
5. Package line total is fixed to package price; vehicle-specific package additions are inventory-only and only affect internal package breakdown.
6. Draft line editing is supported in dedicated Packages, Labor, and Inventory sections.
7. Deleting a job order is soft-delete (deactivated state), not physical removal.
8. Grand Total includes line totals plus third-party repairs.
9. Search/filter bar is shown only when job orders exist in the grid.
10. Export to PDF opens a preview modal first, with layout switch options (`System` and `Default`) before download.

### RBAC (Role-Based Access Control)

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| View Job Orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Draft Job Order | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit Draft Job Order | ✅ | ✅ | ✅ | ✅ | ❌ |
| Request Approval | ❌ | ❌ | ❌ | ✅ | ✅ |
| Record Approval | ❌ | ❌ | ❌ | ✅ | ✅ |
| Start Work | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mark Ready | ❌ | ✅ | ❌ | ❌ | ✅ |
| Record Payment | ❌ | ❌ | ❌ | ✅ | ✅ |
| Complete Job Order | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel Job Order | ❌ | ✅ | ✅ | ✅ | ❌ |

### Rework-Specific RBAC

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| Create Rework from Completed JO | ✅ | ✅ | ✅ | ✅ | ❌ |
| Approve/Reject Rework (`approve-rework`) | ✅ | ❌ | ❌ | ❌ | ❌ |

### API Endpoints

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
| POST | `/api/job-orders/rework` | Create backorder rework from completed JO |
| PATCH | `/api/job-orders/:id/approve-rework` | HM approves/rejects rework backorder |

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
| Package | Price | Base Labor | Status |
| ------- | ----- | ---------- | ------ |
| Basic PMS | 1500 | Oil Change Labor x1 | active |
| Brake Service | 800 | Brake Cleaning x1 | active |

### Package Line Composition Notes

- Base package components are labor items only.
- Vehicle-specific package additions are inventory items only.
- Package line total stays fixed to package price.
- Labor deduction starts only when (base labor total + vehicle-specific inventory total) exceeds package price.
- Adding inventory is blocked if any adjusted labor component would become negative.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as role appropriate for each step
- Test data above is available
- At least one branch assignment exists for test user

---

### Test 1 — Empty State and Search/Filter Visibility

Goal: Verify empty-state behavior and conditional search/filter visibility.

1. Ensure no active job orders exist.
2. Open Job Orders page.

Verify:
- ✅ Header loads correctly with `0 orders total`
- ✅ Search/filter bar is hidden
- ✅ Empty message appears in grid

---

### Test 2 — Create Draft with Package Line Only

Goal: Verify package-only draft creation.

1. Click Create Job Order.
2. Fill required order fields.
3. Add one package line.
4. Save draft.

Verify:
- ✅ Draft is created successfully
- ✅ New card appears in grid
- ✅ Package line total equals package fixed price
- ✅ Grand Total reflects package line amount

---

### Test 3 — Create Draft with Labor + Inventory Mix

Goal: Verify mixed line creation and totals.

1. Create another draft.
2. Add one labor line and one inventory line.
3. Save draft.

Verify:
- ✅ Draft saves successfully
- ✅ Both sections are represented in View
- ✅ Grand Total equals labor + inventory totals

---

### Test 4 — Package Breakdown in View Modal

Goal: Ensure package composition details are visible in View.

1. Open a draft containing package lines.
2. Open View modal.

Verify:
- ✅ Packages section is visible when package lines exist
- ✅ Package Price and Package total are shown
- ✅ Base labor components are listed
- ✅ Vehicle-specific inventory components are listed when present
- ✅ Vehicle-specific type selector is not present (inventory-only add flow)
- ✅ Empty sections are hidden

---

### Test 5 — Edit Draft with Section-Based Lines

Goal: Verify Edit modal supports independent sections.

1. Open Edit for a draft.
2. Add/remove/update package, labor, and inventory lines.
3. Save.

Verify:
- ✅ Packages/Labor/Inventory sections work independently
- ✅ Validation blocks save if all lines are removed
- ✅ Saved data matches latest edits in View modal

---

### Test 6 — Third-Party Repairs and Grand Total

Goal: Verify repairs are included in totals.

1. Open repair management for an order.
2. Add at least one third-party repair with cost.
3. Return to card and View modal.

Verify:
- ✅ Repair appears in repair list
- ✅ Grand Total includes repair cost
- ✅ Total consistency: card, order info, and modal all match

---

### Test 7 — Request Approval Validation

Goal: Verify draft -> pending approval flow.

1. From draft, click Request Approval.

Verify:
- ✅ Status changes to Pending Approval
- ✅ Validation rejects invalid quantities/invalid lines

---

### Test 8 — Record Approval with Stock Check

Goal: Verify stock-sensitive approval.

1. Open pending order with sufficient stock and approve.
2. Repeat with insufficient stock scenario.

Verify:
- ✅ Sufficient stock: status becomes Approved
- ✅ Insufficient stock: approval is blocked with error

---

### Test 9 — Work Execution Status Flow

Goal: Verify full lifecycle transitions.

1. Approved -> Start Work
2. In Progress -> Mark Ready
3. Ready for Release -> Record Payment
4. Pending Payment -> Complete

Verify:
- ✅ Each transition is allowed only in valid prior status
- ✅ Final status is Completed

---

### Test 10 — Reject and Cancel Flows

Goal: Verify alternate transition paths.

1. Reject one pending order with reason.
2. Cancel one draft/pending order with reason.

Verify:
- ✅ Rejected status is stored with rejection reason
- ✅ Cancelled status is stored with cancellation reason

---

### Test 11 — Delete (Soft Deactivate) Behavior

Goal: Verify delete does not hard-remove records.

1. Delete a job order from the list.
2. Switch to status filter `deactivated`.

Verify:
- ✅ Order is removed from default active list
- ✅ Order is visible under deactivated status
- ✅ Historical references remain intact

---

### Test 12 — Search and Filter Behavior with Records

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

### Test 13 — Create Rework from Completed Job

Goal: Verify rework creates a new backorder JO linked to a completed original.

1. Open a completed job order card.
2. Click `More` -> `Rework Job`.
3. Enter required reason and submit.

Verify:
- ✅ New JO is created as a separate record (not nested item)
- ✅ New JO has `job_type = backorder`
- ✅ New JO status is `pending_approval` with approval status requested
- ✅ New JO references original job order ID and shows `Rework of JO-XXXX`

---

### Test 14 — Reject Invalid Rework Source

Goal: Ensure rework cannot be created from non-completed jobs.

1. Attempt rework creation on a non-completed JO.

Verify:
- ✅ API blocks request with clear validation message

---

### Test 15 — Rework Approval and Start Guard

Goal: Ensure backorder must be approved before work start.

1. Create a rework and keep it pending approval.
2. Attempt `Start Work`.
3. Approve rework via HM `approve-rework`.
4. Attempt `Start Work` again.

Verify:
- ✅ Start is blocked while unapproved
- ✅ Start succeeds after approval

---

### Test 16 — Rework Completion Payment Rules

Goal: Validate free vs paid rework payment requirements.

1. Create free rework (`is_free_rework = true`) and progress lifecycle.
2. Complete without payment details.
3. Create paid rework (`is_free_rework = false`) and progress lifecycle.
4. Attempt completion without payment details.

Verify:
- ✅ Free rework can complete without payment detail enforcement
- ✅ Paid rework still enforces existing payment detail requirements

---

### Test 17 — Rework UI Indicators

Goal: Ensure list and details show rework traceability.

1. Open card list with original + rework jobs.
2. Inspect rework card and original card.
3. Open both details modals.

Verify:
- ✅ Rework card shows `BACKORDER` badge
- ✅ Rework card shows `Rework of JO-XXXX`
- ✅ Original card shows `Reworks: X` when children exist

---

### Test 18 — PDF Preview Before Download

Goal: Verify PDF export now uses preview-first behavior with layout switching.

1. Open an existing job order card.
2. Click `More` -> `Export to PDF`.
3. In `Job Order PDF Preview`, confirm the `Preview Customization` section appears.
4. Switch between `System` and `Default` layout options.
5. Confirm the iframe preview reloads when the layout changes.
6. Click `Download PDF`.

Verify:
- ✅ Export action opens preview modal first (no immediate download)
- ✅ `System` layout preview renders successfully
- ✅ `Default` layout preview renders successfully
- ✅ Download only starts after clicking `Download PDF`
- ✅ Downloaded file name follows `{order_number}_estimate.pdf`
- ✅ Rework details show approval status, rework reason, free redo flag
- ✅ Original details show related rework JO numbers/statuses

---

### Test 18 — Rework Audit and Branch Access

Goal: Verify rework actions are logged and branch restrictions remain enforced.

1. Create and approve/reject rework.
2. Review audit logs.
3. Attempt cross-branch rework operations as non-HM user.

Verify:
- ✅ Audit includes `REWORK_CREATED`
- ✅ Audit includes `REWORK_APPROVED` or `REWORK_REJECTED`
- ✅ Audit payload includes `job_type = backorder`
- ✅ Branch access restrictions still apply

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

