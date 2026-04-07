# Sprint 2 – Module-by-Module Copilot Prompts

---

## Module 1: Customer Management

```text
You are implementing the Customer Management module for Sprint 2.

Authoritative references:
- docs/PHASE1.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC37–UC40)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Create, view, update, and delete customer profiles
- Enforce mandatory fields at frontend, backend, and database level
- Enforce branch isolation and RBAC
- Record audit logs for all mutations

Mandatory fields:
- full_name
- contact_number OR email (at least one required)
- customer_type (individual | company)
- branch_id

Validations:
- Phone: 7–20 digits (after stripping non-numeric characters)
- Email: standard email format regex
- On update, at least one contact method must remain

Rules:
- Only HM, POC, JS, R can create customers
- All roles (HM, POC, JS, R, T) can view customers
- All roles (HM, POC, JS, R, T) can update customers
- Only HM, POC, JS, R can delete customers
- Customers are always branch-scoped (HM sees all; others see assigned branches)
- Conditional delete: hard delete if no job orders reference the customer (also deletes associated vehicles and audit logs; falls back to soft delete on FK constraint); soft delete (status to "inactive") if job orders exist
- View modal shows linked vehicles and job orders
- All CUD operations are audit-logged via log_admin_action RPC

User Stories:
As a HM, POC, JS, or R, I want to create a customer profile to store customer details and link vehicles and service history.
As a HM, POC, JS, R, or T, I want to view the customer database to access customer information for reference and management.
As a HM, POC, JS, R, or T, I want to update customer records to keep customer information current.
As a HM, POC, JS, or R, I want to delete customer records to remove inactive or invalid entries.

Tasks:
1. Design customers schema with constraints
2. Implement backend CRUD APIs with validation (phone, email, contact method)
3. Apply Supabase RLS policies for branch isolation
4. Build Customer Management page with search, filters, and pagination
5. Add Customers item in sidebar for all roles
6. Maintain consistent styling of components and use available modal components for all actions

Do not implement CRM features, analytics, or reports.
```

---

## Module 2: Vehicle Management

```text
You are implementing the Vehicle Management module for Sprint 2.

Authoritative references:
- docs/PHASE1.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC19–UC22)

Scope:
- Create, view, update, and delete vehicle profiles
- Link vehicles to customers with same-branch enforcement
- Enforce mandatory fields and branch isolation
- Check job order references before delete
- Record audit logs

Mandatory fields:
- plate_number (unique, auto-uppercased)
- vehicle_type (sedan | suv | truck | van | motorcycle | hatchback | coupe | wagon | bus | other)
- orcr (OR/CR number)
- model
- customer_id (must belong to the same branch)
- branch_id

Optional fields:
- color
- year (1900 to current year + 1)
- engine_number
- chassis_number
- notes
- status (defaults to "active")

Rules:
- Only HM, POC, JS, R can manage vehicles (T has no access)
- Plate number uniqueness enforced on create and update
- Vehicle must be in the same branch as its customer
- Conditional delete: hard delete if no job orders reference the vehicle (deletes associated audit logs first); soft delete (status to "inactive") if job orders reference it
- References endpoint (/references) allows frontend to pre-check before delete
- All CUD operations are audit-logged via log_admin_action RPC

User Stories:
As a HM, POC, JS, or R, I want to create vehicle profiles to record customer vehicle details and service history.
As a HM, POC, JS, or R, I want to view vehicle profiles for reference and service tracking.
As a HM, POC, JS, or R, I want to update vehicle profiles to keep vehicle information current.
As a HM, POC, JS, or R, I want to delete vehicle profiles for decommissioned or invalid records.

Tasks:
1. Design vehicles schema with plate_number uniqueness constraint
2. Implement customer-vehicle relationship with branch consistency check
3. Implement backend CRUD with validation and references check
4. Build Vehicle Management page with search and filters (same layout as Branch Management)
5. Add Vehicles item in sidebar for HM, POC, JS, R
6. Audit logging for all changes
7. Maintain consistent styling of components and use available modal components for all actions

No service history, reminders, or fulfillment logic.
```

---

## Module 3: Services / Products / Packages

```text
You are implementing the Services, Products, and Packages module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC23–UC26)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Define package items (services, products, packages) that can be selected in job orders
- CRUD for package items with branch scope or global flag
- Enforce mandatory fields and RBAC
- Audit logging

Mandatory fields:
- name
- type (service | product | package)
- base_price (non-negative number)
- Either branch_id or is_global = true (not both)

Rules:
- Only HM, POC, JS can create, update, and delete package items
- HM, POC, JS, R can view package items (T has no access)
- Global items (is_global = true): only HM can create, edit, and delete; branch_id is set to null
- Branch-scoped items require a valid branch_id
- Branch scoping: HM sees all; others see global items plus their branch items
- Only HM can toggle the is_global flag on updates
- Conditional delete: try hard delete first; if FK constraint (from pricing_matrices or job_order_items), fall back to soft delete (status to "inactive") and return { deactivated: true }
- All CUD operations are audit-logged via log_admin_action RPC

User Stories:
As a HM, POC, or JS, I want to create services, products, and packages so they can be selected during quotations and job orders.
As a HM, POC, JS, or R, I want to view services, products, and packages for reference and selection.
As a HM, POC, or JS, I want to update services, products, and packages to reflect pricing or scope changes.
As a HM, POC, or JS, I want to delete services, products, and packages that are no longer offered.

Tasks:
1. Design package_items schema with type enum and is_global flag
2. Implement backend CRUD APIs with validation and global/branch logic
3. Apply Supabase RLS policies for branch isolation
4. Build Packages Management page with type, status, and branch filters
5. Add Packages in the sidebar for HM, POC, JS, R
6. Audit all changes
7. Maintain consistent styling of components and use available modal components for all actions

Do not link to job orders yet.
```

---

## Module 4: Pricing Matrices

```text
You are implementing the Pricing Matrices module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC27–UC30)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Define pricing override rules for package items (labor and packaging)
- Support resolution of pricing at job order creation
- Enforce one active pricing rule per condition
- Provide resolve and bulk-resolve endpoints for price computation
- Audit all changes

Mandatory fields:
- package_item_id (must exist)
- pricing_type (labor | packaging)
- price (non-negative number)
- branch_id (must exist)

Optional fields:
- status (defaults to "active")
- description

Rules:
- All roles (HM, POC, JS, R, T) can view pricing matrices
- Only HM, POC, JS, R can create, update, and delete pricing matrices
- Active uniqueness constraint: only one active pricing rule per (package_item_id, pricing_type, branch_id) combination; returns 409 Conflict if violated
- Conditional delete: try hard delete first; if FK constraint, fall back to soft delete (status to "inactive") and return { deactivated: true }
- Pricing is resolved at job order creation time via resolve endpoints
- Resolve endpoint: GET /resolve/:packageItemId returns { base_price, labor, packaging }
- Bulk resolve: POST /resolve-bulk accepts { branch_id, package_item_ids } and returns a map of resolved prices
- All CUD operations are audit-logged via log_admin_action RPC

User Stories:
As a HM, POC, JS, or R, I want to create labor and packaging pricing matrices to define standardized costs.
As a HM, POC, JS, R, or T, I want to view labor and packaging pricing matrices for cost reference.
As a HM, POC, JS, or R, I want to update pricing matrices to reflect cost changes.
As a HM, POC, JS, or R, I want to delete pricing matrices that are no longer applicable.

Tasks:
1. Design pricing_matrices schema with partial unique index for active rules
2. Implement backend CRUD with active uniqueness validation and conflict detection
3. Implement resolve and bulk-resolve endpoints for price computation
4. Build Pricing Matrix page with stats bar (total/active/inactive) and custom filters (5 items per page)
5. Add Pricing Matrix item in sidebar after Vehicles
6. Audit logging
7. Maintain consistent styling of components and use available modal components for all actions

No discounts, campaigns, or historical pricing.
```

---

## Module 5: Job Order Management

```text
You are implementing the Job Order Management module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC31–UC36)

Scope:
- Create job orders with associated items and pricing resolution
- View job orders with items and third-party repairs
- Update job order notes
- Add, update, and delete job order items (only when status allows)
- Request and record customer approval
- Cancel job orders with stock restoration
- Delete job orders (conditional: hard or soft)
- Full status lifecycle management

Mandatory fields (Job Order):
- customer_id (must exist)
- vehicle_id (must belong to the selected customer)
- branch_id
- items (non-empty array, each with package_item_id and optional quantity)

Mandatory fields (Job Order Item):
- package_item_id
- quantity (defaults to 1, minimum 1)

Status lifecycle:
- created -> pending (via request-approval)
- pending -> approved (via record-approval, triggers stock deduction)
- pending -> rejected (via record-approval)
- rejected -> pending (via re-submit request-approval)
- created | pending | rejected | approved -> cancelled (via cancel)
- Cancellation of approved orders restores deducted inventory stock

Rules:
- Only POC, JS, R can create job orders (HM cannot create)
- All roles (HM, POC, JS, R, T) can view job orders
- Only POC, JS, R, T can update job order notes
- Only POC, JS, R can delete job orders
- Only POC, JS, R, T can request and record customer approval
- Only POC, JS, R can cancel job orders
- order_number is auto-generated via database trigger
- Pricing resolution at creation: base_price, labor_price, and packaging_price are resolved and stored per item as line_total
- total_amount is recalculated when items are added, updated, or removed
- Item operations (add/update/delete) are only allowed when status is "created" or "rejected"
- Cannot delete the last item from a job order (at least 1 item required)
- Rollback on item insert failure: deletes the created order
- Conditional delete: hard delete only if status is "created" AND has no items AND no third-party repairs (empty draft); soft delete (is_deleted = true) in all other cases
- Stock deduction on approval: inventory is checked and deducted via deductStockForJobOrder; insufficient stock blocks approval with 400 error
- Stock restoration on cancellation of approved orders via restoreStockForJobOrder
- All list and get queries filter by is_deleted = false
- Third-party repairs are fetched alongside orders in list view
- All mutations are audit-logged via log_admin_action RPC

User Stories:
As a POC, JS, or R, I want to create order cards to track active service work.
As a HM, POC, JS, R, or T, I want to view order cards to monitor service progress.
As a POC, JS, R, or T, I want to update order cards as work progresses.
As a POC, JS, or R, I want to delete order cards for canceled jobs.
As a POC, JS, R, or T, I want to request customer approval to proceed with service work.
As a POC, JS, R, or T, I want to record customer approval to proceed with the job.

Tasks:
1. Design job_orders and job_order_items schemas with is_deleted flag
2. Implement auto-generated order_number via database trigger
3. Implement backend creation logic with pricing resolution
4. Implement item management endpoints (add, update, delete) with status checks
5. Implement request-approval and record-approval endpoints with status transitions
6. Implement cancel endpoint with stock restoration for approved orders
7. Implement conditional delete logic (hard/soft)
8. Integrate stock deduction on approval (link with Inventory module)
9. Build Job Order creation page with draft items and pricing preview (same layout as Packages)
10. Build edit modal with item management for created/rejected orders
11. Build approval modal with approve/reject buttons
12. Build cancel confirmation and history modals
13. Add Job Orders item in sidebar for all roles
14. Audit log all mutations

No technician assignment, completion tracking, or invoicing.
```

---

## Module 6: Third-Party Repairs

```text
You are implementing the Third-Party Repairs module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC41–UC44)

Scope:
- Create, view, update, and delete third-party repair records linked to job orders
- Conditional delete based on parent job order status
- Audit all changes

Mandatory fields:
- job_order_id (must exist)
- provider_name
- description
- cost (non-negative number)
- repair_date

Optional fields:
- notes

Rules:
- All roles (HM, POC, JS, R, T) can perform all CRUD operations
- Third-party repairs cannot exist without a job order
- Branch access is determined by the parent job order's branch_id
- When listing without job_order_id filter, branch scoping filters by visible job order IDs
- Conditional delete: hard delete if parent job order status is "created" or "rejected" (still modifiable); soft delete (is_deleted = true) if parent JO has progressed (pending, approved, cancelled)
- All list and get queries filter by is_deleted = false
- No dedicated frontend page — managed entirely through the Job Order Management wrench button modal
- All mutations are audit-logged via log_admin_action RPC

User Stories:
As a HM, POC, JS, R, or T, I want to add third-party repair details for outsourced services.
As a HM, POC, JS, R, or T, I want to view third-party repair information for tracking.
As a HM, POC, JS, R, or T, I want to update third-party repair details as needed.
As a HM, POC, JS, R, or T, I want to delete third-party repair records when no longer applicable.

Tasks:
1. Design third_party_repairs schema with is_deleted flag
2. Implement backend CRUD APIs with branch-scoped access via parent job order
3. Implement conditional delete logic based on parent JO status
4. Build repair management UI within Job Order Management (wrench button modal)
5. Audit logging for all changes

Do not implement vendor management, invoicing, or approval workflows.
```

---

## Module 7: Sprint 2 End-to-End Testing

```text
You are validating Sprint 2 modules end-to-end.

Scope:
- Customer creation, update, delete (conditional), and validation
- Vehicle creation, linking to customers, and delete (conditional)
- Package setup with global and branch-scoped items
- Pricing resolution and active uniqueness enforcement
- Job order creation with pricing, item management, and status lifecycle
- Customer approval request and recording
- Stock deduction on approval and restoration on cancellation
- Third-party repair attachment with conditional delete
- Audit log entries for all mutations

Tasks:
1. Verify RBAC and branch isolation for all modules
2. Verify mandatory field enforcement at frontend and backend
3. Verify customer-vehicle branch consistency
4. Verify pricing resolution correctness
5. Verify job order status lifecycle transitions
6. Verify stock deduction blocks on insufficient inventory
7. Verify conditional delete behavior for all modules
8. Verify audit log entries with correct user and action
9. Update docs/checklist/sprint-2-checklist.md

Do not add new features. Fix only Sprint 2 scope issues.
```

---

