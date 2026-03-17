# REVISIONS – Job Order & Core System Overhaul

## Authoritative References
- docs/PHASE1.md  
- docs/PHASE2.md  
- docs/PHASE3.md  
- docs/PHASE4.md  
- docs/SYSTEM_CONCEPT.md  
- Meeting Notes – March 16 Standup  
- job_order_flow.html  
- job_rework_flow.html  

---

This revision introduces a major overhaul of the Job Order system, pricing structure, and supporting modules for UAT readiness.

---

## Module 1: Job Order Structure Overhaul

You are implementing the new Job Order structure.

### Scope
- Support Packages, Labor, and Inventory as independent sections  
- Allow “none-to-many” relationships for each section  
- Update total calculation logic  
- Update job order creation UI  

### Functional Requirements
- Job Order must support:
  - Packages (optional)
  - Individual Labor (optional)
  - Individual Inventory (optional)
- Each section can have zero or multiple entries  
- Sections must be independent (no forced dependency)  
- Total must be computed as:
  - Package totals + Labor totals + Inventory totals  
- Inventory must respect vehicle-type filtering  
- Odometer reading is required  

### Rules
- Job Order can exist with any combination:
  - Packages only
  - Labor only
  - Inventory only
  - Any mix of the three  
- Empty job orders are NOT allowed  
- Total must update dynamically on any change  

### Acceptance Criteria
- Job Order saves correctly with any valid combination  
- Totals are accurate  
- UI reflects three independent sections  
- Odometer is required before submission  

### Tasks
1. Refactor job_order schema  
2. Create job_order_packages table  
3. Create job_order_labors table  
4. Create job_order_inventories table  
5. Update API endpoints  
6. Rebuild total calculation logic  
7. Update UI based on provided JO flow  
8. Enforce validation rules  

---

## Module 2: Packages Module (Catalog Refactor)

You are implementing the Packages module.

### Scope
- Rename Catalog → Packages  
- Support package composition (Labor + Inventory)  
- Support base + vehicle-specific components  

### Functional Requirements
- Package contains:
  - Base components (fixed)
  - Vehicle-specific selectable components  
- Package must support:
  - Labor items
  - Inventory items  
- Vehicle-specific filtering must apply  

### Rules
- Base components are non-editable in JO  
- Vehicle-specific components are selectable during JO creation  
- Packages must compute their own subtotal  

### Acceptance Criteria
- Packages can be created and edited  
- Packages integrate with Job Orders  
- Vehicle filtering works correctly  

### Tasks
1. Rename catalog table to packages  
2. Create package_items table  
3. Link package_items to labor and inventory  
4. Update APIs and UI references  
5. Implement package subtotal logic  

---

## Module 3: Labor Module (Pricing Matrix Refactor)

You are implementing the Labor module.

### Scope
- Convert Pricing Matrix → Labor table  
- Remove package logic from pricing matrix  
- Enable reuse across system  

### Functional Requirements
- Labor represents a single service  
- Must be usable:
  - Directly in Job Orders
  - Inside Packages  
- Must support vehicle-type scoping  

### Rules
- Labor is globally defined (not branch-based)  
- Must be searchable (UI improvement)  

### Acceptance Criteria
- Labor can be selected in Job Orders  
- Labor integrates with Packages  
- Search-based UI works  

### Tasks
1. Rename pricing_matrix to labor  
2. Remove package-related fields  
3. Update all references  
4. Implement search-based selection UI  

---

## Module 4: Rework Job Feature

You are implementing the Rework Job workflow.

### Scope
- Create rework job from completed JO  
- Require HM approval  
- Add rework-specific fields  

### Functional Requirements
- Rework job must:
  - Reference original job order  
  - Capture reason for rework  
  - Allow free redo toggle  

### Workflow
1. Select completed JO  
2. Click “Create Rework Job”  
3. Fill rework form  
4. Submit for HM approval  

- Job cannot proceed without approval  

### Fields to Add
- original_job_order_id  
- rework_reason  
- is_free_redo  
- approval_status (pending | approved | rejected)  

### Rules
- Rework jobs default to pending approval  
- Free redo sets total to 0  
- Original JO must be completed  

### Acceptance Criteria
- Rework flow matches UI reference  
- Approval gating works  
- Job is blocked until approved  

### Tasks
1. Update job_order table (no new table)  
2. Implement rework creation endpoint  
3. Implement approval workflow  
4. Update UI based on rework flow  
5. Add notifications for approval  

---

## Module 5: Payment & Invoice Validation

You are implementing payment tracking validation.

### Scope
- Require payment details before closing JO  
- Capture payment mode and reference  

### Functional Requirements
- Required before marking JO as completed:
  - Payment mode (Cash, Card, GCash/Maya)  
  - Reference code  
- Reference code comes from POS receipt  

### Rules
- Job cannot be completed without payment info  
- Payment data must be stored in JO  

### Acceptance Criteria
- Validation blocks completion without payment  
- Data is stored correctly  
- UI modal is triggered before completion  

### Tasks
1. Add payment_mode field  
2. Add payment_reference field  
3. Update completion endpoint  
4. Implement UI modal  
5. Add validation logic  

---

## Module 6: Inventory Flow Update

You are updating inventory behavior.

### Scope
- Support new JO structure  
- Maintain existing PO flow  

### Functional Requirements
- Inventory OUT (JO):
  - Deduct based on:
    - Packages  
    - Individual inventory items  
- Inventory IN (PO):
  - No change  

### Rules
- Deduction occurs on “Start Work”  
- Must handle multiple sources (package + standalone)  

### Acceptance Criteria
- Inventory deducts correctly  
- No duplication or double deduction  
- Works with all JO combinations  

### Tasks
1. Update inventory trigger logic  
2. Adjust stock movement handling  
3. Test all JO scenarios  

---

## Module 7: Vehicle External History

You are implementing external vehicle history tracking.

### Scope
- Track third-party repairs  
- Add new vehicle history records  

### Functional Requirements
- Fields:
  - provider_name  
  - service_date  
  - description  
  - cost  
- Linked to vehicle  

### Rules
- Does not affect inventory  
- Informational only  

### Acceptance Criteria
- History can be created and viewed  
- Properly linked to vehicle  

### Tasks
1. Create vehicle_external_history table  
2. Implement CRUD APIs  
3. Add UI under Vehicle module  

---

## Module 8: Customer-Provided Parts Flag

You are implementing customer-provided inventory tracking.

### Scope
- Track non-inventory parts used in JO  

### Functional Requirements
- Add flag:
  - is_customer_provided  
- Items with this flag:
  - Do NOT deduct inventory  
  - Still included in JO records  

### Acceptance Criteria
- Inventory unaffected when flagged  
- Visible in JO details  

### Tasks
1. Update job_order_items schema  
2. Update deduction logic  
3. Update UI toggle  

---

## Module 9: Odometer Validation

You are implementing odometer enforcement.

### Scope
- Make odometer required  

### Rules
- Cannot create JO without odometer  

### Acceptance Criteria
- Validation enforced backend + frontend  

### Tasks
1. Update schema validation  
2. Update UI form validation  
3. Update API validation  