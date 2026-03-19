# PHASE 5 – REVISED IMPLEMENTATION PLAN

Migration Principle:
Break the package-centric architecture and transition into a modular Job Order system while minimizing production risk.

Design Standard:
- Modular (Labor, Packages, Inventory are independent)
- Consistent naming (no legacy “package_item” confusion)
- Backend-driven validation (not frontend-dependent)
- Clear lifecycle enforcement

---

# PRIORITY 1 (FOUNDATION – 2–3 DAYS)
## MODULE 1: Pricing Matrix → Labor System

### Objective
Transform pricing matrix into a standalone Labor module that can be reused across Job Orders and Packages.

---

### Implementation Prompt (Backend)

1. Create new table:

labor_items

id (uuid)

name (string)

vehicle_type (enum: light | heavy | extra_heavy)

price (numeric)

status (active | inactive)

created_at


2. Data Migration:
- Extract all rows from `pricing_matrices`
- Convert each into `labor_items`
- Preserve pricing per vehicle type

3. Remove coupling:
- Remove dependency on `package_item_id`
- Stop using pricing resolve endpoints tied to packages

4. Replace logic:
- All JO labor pricing must come from `labor_items`

---

### Implementation Prompt (Frontend)

- Replace pricing selection with labor selection
- Remove `/pricing/resolve` usage
- Add labor dropdown in JO UI

---

### Sample Scenario

Before:
- Select Package → System fetches price from pricing matrix

After:
- Select Labor (e.g. Wheel Alignment)
- System directly uses labor price

---

# PRIORITY 2 (CORE SYSTEM – 3–4 DAYS)
## MODULE 2: Job Order Structure Overhaul

### Objective
Allow Job Orders to support:
- Labor (0 to many)
- Packages (0 to many)
- Inventory (0 to many)

---

### Implementation Prompt (Backend)

1. Create new table:

job_order_lines

id

job_order_id

line_type (labor | package | inventory)

reference_id (nullable)

name (snapshot)

quantity

unit_price

total


2. Remove legacy dependency:
- REMOVE:
  - package_item_id
  - package_item_type

3. API Updates:
- POST /job-orders
  - Accept mixed line types
- PATCH /job-orders/:id
  - Add/update/remove lines per type

4. Total Calculation:

total = SUM(job_order_lines.total)


---

### Implementation Prompt (Frontend)

- Split JO UI into 3 sections:
  - Packages
  - Labor
  - Inventory
- Allow independent additions

---

### Sample Scenario

User creates JO:
- Adds Package: PMS (₱1500)
- Adds Labor: Alignment (₱500)
- Adds Inventory: Oil x2 (₱300)

Total = ₱2300

---

# PRIORITY 3 (STRUCTURE – 2–3 DAYS)
## MODULE 3: Packages Refactor

### Objective
Convert Packages into reusable compositions of Labor + Inventory.

---

### Implementation Prompt (Backend)

1. Rename:
- `catalog` → `packages`

2. Create:

package_labor_items

id

package_id

labor_id

quantity

package_inventory_items

id

package_id

inventory_item_id

quantity


3. Remove:
- pricing dependency from packages

---

### Implementation Prompt (Frontend)

- Package builder UI:
  - Add labor
  - Add inventory
- No pricing logic inside packages

---

### Sample Scenario

Package: Basic PMS
- Labor: Oil Change
- Inventory: Oil + Filter

---

# PRIORITY 4 (BUSINESS LOGIC – 2 DAYS)
## MODULE 4: Inventory Logic Enhancement

### Objective
Support customer-provided inventory and accurate deduction.

---

### Implementation Prompt (Backend)

1. Add column:

job_order_line_inventories

is_customer_provided (boolean)


2. Deduction Logic:

IF is_customer_provided = true
→ SKIP stock deduction


3. Update stock movement logic

---

### Implementation Prompt (Frontend)

- Add toggle:
  "Customer Provided"

---

### Sample Scenario

Customer brings oil:
- Mark as customer provided
- No deduction happens

---

# PRIORITY 5 ( 2 DAYS)
# MODULE 5: Rework / Backorder Job Orders

## IMPORTANT DESIGN DECISION

- A Rework Job is a **NEW Job Order**
- It MUST NOT be implemented as a job_order_item
- It MUST reference an existing COMPLETED Job Order
- It MUST follow its own lifecycle and approval flow

---

## OBJECTIVE

Introduce a Rework / Backorder workflow that:

- Allows creating a new Job Order from a completed one
- Requires Hiring Manager (HM) approval
- Maintains full traceability between original and rework job
- Supports free or controlled-cost redo

---

# BACKEND IMPLEMENTATION

## 1. Schema Changes (job_orders)

Add the following fields:

- job_type: enum ('normal', 'backorder') DEFAULT 'normal'
- reference_job_order_id: uuid (nullable, FK → job_orders.id)
- rework_reason: text (required if backorder)
- is_free_rework: boolean DEFAULT true
- approval_status: enum ('pending', 'approved', 'rejected') DEFAULT 'pending'

---

## 2. Validation Rules

### On Create:

IF job_type = 'backorder':
- reference_job_order_id is REQUIRED
- rework_reason is REQUIRED
- original job MUST be status = 'completed'
- approval_status = 'pending'

---

### On Start Work:

IF job_type = 'backorder' AND approval_status != 'approved':
→ BLOCK action

---

### On Completion:

IF is_free_rework = true:
→ SKIP payment validation

ELSE:
→ enforce existing payment rules

---

## 3. Lifecycle Update

Rework Job Order flow:

draft  
→ pending_approval (REQUIRED)  
→ approved / rejected  
→ in_progress  
→ ready_for_release  
→ completed  

NO shortcuts allowed.

---

## 4. API Requirements

Implement:

- POST /job-orders/rework
  - Creates a new backorder JO from existing JO

- PATCH /job-orders/:id/approve-rework
  - HM approval endpoint

Ensure:
- Proper validation
- Clear error messages
- Reuse existing JO lifecycle endpoints where possible

---

# FRONTEND IMPLEMENTATION

## 1. Job Card (List View)

Rework Job Orders MUST:

- Appear as a NORMAL job order card
- Include a badge: "BACKORDER"
- Display reference:
  "Rework of JO-XXXX"

DO NOT nest inside original job card.

---

## 2. Original Job Card

If job has rework(s):

- Show indicator:
  "Has Rework" or "Reworks: X"

---

## 3. Rework Button

Add inside:
More Actions → "Rework Job"

ONLY visible when:
job.status === 'completed'

---

## 4. Rework Modal

Fields:

- Original Job Order (readonly)
- Rework Reason (required)
- Free Redo Toggle same as the toggle in the Edit User modal (User Management Page)
- Notes (optional)

Actions:
- Cancel
- Submit

---

## 5. Job Details Page

If REWORK:

Show:
- "Rework of JO-XXXX"
- Approval Status
- Reason

If ORIGINAL:

Show:
- List of related rework job orders

---

# SAMPLE FLOW

1. User opens a COMPLETED Job Order
2. Clicks More → Rework Job
3. Fills out form (reason, free redo)
4. Submits → New JO created (status: pending approval)
5. HM approves
6. Work proceeds like normal JO

---

# STRICT RULES

DO NOT:
- Implement rework as a job_order_item
- Modify original job order items
- Skip approval flow
- Mix original and rework data

---

# EXPECTED OUTPUT

Before implementing, analyze current system and provide:

1. Required schema changes
2. Affected backend routes
3. UI components to modify
4. Potential risks or breaking changes
5. Step-by-step implementation plan

DO NOT start coding immediately.
Focus on analysis and safe integration first.

---

# PRIORITY 6 (ENFORCEMENT – 1–2 DAYS)
## MODULE 6: Payment Enforcement

### Objective
Prevent job completion without payment details.

---

### Implementation Prompt (Backend)

1. Add fields:

job_orders

invoice_number

payment_reference

payment_mode


2. Validation Rule:

BLOCK completion IF:
invoice_number IS NULL OR payment_reference IS NULL


---

### Implementation Prompt (Frontend)

- Payment modal must require:
  - Invoice #
  - Payment reference

---

### Sample Scenario

Before completing JO:
- Receptionist inputs GCash ref
- System allows completion

---

# PRIORITY 7 (DATA – 1 DAY)
## MODULE 7: Vehicle External History

### Objective
Track external services done outside the system.

---

### Implementation Prompt (Backend)

1. Create:

vehicle_external_history

id

vehicle_id

service_date

provider_name

description

history_type


2. CRUD APIs

---

### Implementation Prompt (Frontend)

- Add tab in vehicle profile

---

### Sample Scenario

Record:
- “Brake repair at external shop”

---

# PRIORITY 8 (VALIDATION – 0.5–1 DAY)
## MODULE 8: Odometer Requirement

### Objective
Make odometer mandatory for all job orders.

---

### Implementation Prompt

1. DB:

ALTER job_orders
SET odometer_reading NOT NULL


2. Backend validation

3. Frontend required field

---

### Sample Scenario

User cannot submit JO without odometer

---

# FINAL IMPLEMENTATION STRATEGY

## DO:
- Implement per module (in order)
- Test after each module
- Keep old structure temporarily only where needed

## DO NOT:
- Do dual-write (too risky here)
- Patch old package-based JO model
- Mix old and new logic in same endpoint

---

# END GOAL ARCHITECTURE

Job Order =
- Labor lines (direct)
- Package lines (composed)
- Inventory lines (direct)

NO hard dependency between them.

---

# SUCCESS CRITERIA

- JO can exist with:
  - only labor
  - only inventory
  - only packages
  - or any combination

- Pricing is reusable
- Inventory deduction is accurate
- Workflow is enforced
- System is modular and scalable

---