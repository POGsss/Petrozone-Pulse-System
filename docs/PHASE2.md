# Sprint 2 – Module-by-Module Copilot Prompts

---

## Module 1: Customer Management

```text
You are implementing the Customer Management module for Sprint 2.

Authoritative references:
- docs/Phase 1.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Create, view, update, and delete customer profiles
- Enforce mandatory fields at frontend, backend, and database level
- Enforce branch isolation and RBAC
- Record audit logs for all mutations

Mandatory fields:
- full_name
- contact_number OR email
- customer_type
- branch_id
- status

Rules:
- Only HM, POC, JS, R can create customers
- Only HM, POC, JS, R, T can view customers
- Only POC, JS, R, T can update customers
- Only POC JS, R can delete customers
- Customers are always branch-scoped
- All actions must be audit-logged

User Stories:
As a HM, POC, JS, or R, I want to create a customer profile to store customer details and link vehicles and service history
As an HM, POC, JS, R, or T, I want to view the customer database to access customer information for reference and management.
As a POC, JS, R, or T, I want to update customer records to keep customer information current.
As a POC, JS, or R, I want to delete customer records to remove inactive or invalid entries.

Tasks:
1. Design database schema with constraints
2. Implement backend APIs with validation
3. Apply Supabase RLS policies
4. Build frontend Customers page
5. Add Customers item in every sidebar for each role
6. Maintain consistent styling of component and use available modal component for every actions

Do not implement CRM features, analytics, or reports.
```

---

## Module 2: Vehicle Management

```text
You are implementing the Vehicle Management module for Sprint 2.

Authoritative references:
- docs/Phase 1.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx

Scope:
- Create, view, update, and delete vehicle profiles
- Link vehicles to customers
- Enforce mandatory fields and branch isolation
- Record audit logs

Mandatory fields:
- plate_number
- vehicle_type
- orcr
- model
- customer (dropdown)
- status

Rules:
- Only HM, POC, JS, R can manage vehicles
- Vehicles must belong to the same branch as the customer
- Plate number uniqueness must be enforced
- Soft delete only

User Stories:
As a HM, POC, JS, or R, I want to create vehicle profiles to record customer vehicle details and service history
As a HM, POC, JS, or R, I want to view vehicle profiles for reference and service tracking
As a HM, POC, JS, or R, I want to update vehicle profiles to keep vehicle information current
As a HM, POC, JS, or R, I want to delete vehicle profiles for decommissioned or invalid records

Tasks:
1. Design vehicle schema and constraints
2. Implement customer-vehicle relationship
3. Backend CRUD with validation
4. Frontend vehicle forms and lists same as Branch management exact copy of style
5. Audit logging for all changes
6. Maintain consistent styling of component and use available modal component for every actions

No service history, reminders, or fulfillment logic yet.
```

---

## Module 3: Services / Products / Packages Catalog

```text
You are implementing the Service, Product, and Package Catalog module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Define what can be sold or included in job orders
- CRUD for services, products, and packages
- Enforce mandatory fields and branch scope
- Audit logging

Mandatory fields:
- name
- type (service | product | package)
- base_price
- status
- branch_id or global flag

Rules:
- No pricing rules or calculations here
- No discounts or promotions
- Used later by job orders

User Stories:
As a HM, POC, or JS, I want to create services, products, and packages so they can be selected during quotations and job orders
As a HM, POC, JS, or R, I want to view services, products, and packages for reference and selection
As a HM, POC, or JS, I want to update services, products, and packages to reflect pricing or scope changes
As a HM, POC, or JS, I want to delete services, products, and packages that are no longer offered

Tasks:
1. Design catalog schema (single or separated tables)
2. Backend CRUD APIs with validation
3. Frontend management pages
4. Audit all changes
5. Maintain consistent styling of component and use available modal component for every actions

Do not link to job orders yet.
```

---

## Module 4: Pricing Matrices

```text
You are implementing the Pricing Matrices module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Define pricing override rules for catalog items
- Support labor and packaging pricing
- Enforce one active pricing rule per condition
- Audit all changes

Mandatory fields:
- catalog_item_id
- pricing_type
- price
- status
- branch_id

Rules:
- Pricing is resolved at job order creation
- No dynamic formulas or promotions
- Prevent conflicting active rules

User Stories:
As an HM, POC, JS, or R, I want to create labor and packaging pricing matrices to define standardized costs.
As an HM, POC, JS, R, or T, I want to view labor and packaging pricing matrices for cost reference.
As an HM, POC, JS, or R, I want to update pricing matrices to reflect cost changes.
As an HM, POC, JS, or R, I want to delete pricing matrices that are no longer applicable.

Tasks:
1. Design pricing_matrix schema
2. Backend validation and conflict detection
3. Frontend pricing matrix CRUD
4. Make the layout same as the User Management/Table style
5. Add the Pricing Matrix sidebar item after Vehicle item
6. Integrate with job order price resolution
7. Audit logging

No discounts, campaigns, or historical pricing yet.
```

---

## Module 5: Job Order Generation

```text
You are implementing the Job Order Generation module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx

Scope:
- Create basic job orders
- Associate customer, vehicle, and catalog items
- Compute total price using pricing matrices
- Status lifecycle limited to CREATED

Mandatory fields:
- customer_id
- vehicle_id
- branch_id
- status
- total_amount

Rules:
- Job orders are immutable after creation (Sprint 2)
- No fulfillment, technician assignment, or completion
- Pricing must be read-only once generated

User Stories:
As a POC, JS, or R, I want to create order cards to track active service work
As a HM, POC, JS, R, or T, I want to view order cards to monitor service progress.
As a POC, JS, R, or T, I want to update order cards as work progresses
As a POC, JS, or R, I want to delete order cards for canceled jobs

Tasks:
1. Design job_order and job_order_items schemas
2. Implement backend creation logic
3. Integrate pricing resolution
4. Frontend job order creation page (Same layout as catalog layout)
5. Put it under Catalog item
6. Audit logging

No status transitions beyond CREATED.
```

---

## Module 6: Third-Party Repairs

```text
You are implementing the Third-Party Repairs module for Sprint 2.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx

Scope:
- Record third-party repair information linked to job orders
- View third-party repair records
- Audit all changes

Mandatory fields:
- job_order_id
- provider_name
- description
- cost
- repair_date

Rules:
- Third-party repairs cannot exist without a job order
- No approval or billing workflows yet

Tasks:
1. Design third_party_repairs schema
2. Backend APIs for create/view
3. Frontend UI within job order context
4. Audit logging

Do not implement vendor management or invoicing.
```

---

## Module 7: Sprint 2 End-to-End Testing

```text
You are validating Sprint 2 modules end-to-end.

Scope:
- Customer creation and validation
- Vehicle creation and linking
- Catalog setup
- Pricing resolution
- Job order creation
- Third-party repair attachment

Tasks:
1. Verify RBAC and branch isolation
2. Verify mandatory field enforcement
3. Verify pricing correctness
4. Verify audit log entries
5. Update docs/checklist/sprint-2-checklist.md

Do not add new features. Fix only Sprint 2 scope issues.
```

---
