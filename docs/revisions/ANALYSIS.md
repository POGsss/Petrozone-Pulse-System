# SYSTEM ANALYSIS PROMPT – PRE-REVISION SCAN (JOB ORDER OVERHAUL)

You are acting as a Senior System Analyst and Technical Architect.

DO NOT implement anything yet.

Your task is to:
1. Scan the current system implementation
2. Analyze existing architecture and data flow
3. Identify constraints, risks, and dependencies
4. Prepare the system for a major revision

---

## CONTEXT

We are preparing for a major system revision before UAT.

The following core modules will undergo significant changes:
- Job Order (JO)
- Catalog (to be renamed as Packages)
- Pricing Matrix (to be refactored into Labor)

This is a structural and workflow-level change affecting:
- Database schema
- API design
- UI flows
- Inventory logic
- Business rules

---

## INSTRUCTIONS – PHASE 1: SYSTEM SCAN

Perform a full repository scan and provide a structured analysis of:

### 1. Job Order Module
- Current schema (tables, relationships)
- How services are currently attached (packages, items, etc.)
- Total calculation logic
- Status lifecycle (draft → in progress → completed)
- Inventory deduction trigger (when and how)
- API endpoints and responsibilities
- UI workflow (based on forms/components)

### 2. Catalog Module
- Current structure of catalog items
- How catalog links to job orders
- Whether catalog mixes labor and inventory
- Any constraints or assumptions in current design

### 3. Pricing Matrix Module
- Current schema and purpose
- How pricing is applied
- Relationship with job orders and catalog
- Any embedded package logic

### 4. Inventory Flow
- Current stock movement logic
- How deduction is triggered from job orders
- Edge cases (partial usage, multiple items, etc.)

### 5. Cross-Module Dependencies
- Tight coupling between:
  - Job Orders ↔ Catalog
  - Job Orders ↔ Pricing Matrix
  - Job Orders ↔ Inventory
- Identify hardcoded assumptions that may break with new design

---

## INSTRUCTIONS – PHASE 2: IDENTIFY CURRENT LIMITATIONS

Based on your scan, identify:

- Structural limitations of current Job Order design
- Why current system forces package-only behavior
- Risks in modifying existing schema
- Any technical debt or fragile logic
- Gaps between current implementation and desired flexibility

---

## INSTRUCTIONS – PHASE 3: REVISION CONTEXT (DO NOT IMPLEMENT YET)

We will introduce the following changes:

### Job Order Overhaul
- Job Orders must support:
  - Packages (renamed from Catalog)
  - Individual Labor
  - Individual Inventory
- All three are optional and independent (none-to-many)

### Packages (Catalog Refactor)
- Catalog will be renamed to Packages
- Packages will contain:
  - Labor + Inventory
- Must support:
  - Base components (fixed)
  - Vehicle-specific selectable components

### Pricing Matrix → Labor
- Pricing Matrix will be converted into Labor table
- Labor will:
  - Be reusable
  - Be selectable directly in Job Orders
  - Be used inside Packages

### Rework Job Feature
- Create new Job Orders from completed ones
- Requires HM approval
- Adds fields to job_order table (no new table)

### Payment Tracking
- Job Order cannot be completed without:
  - Payment mode
  - Payment reference (POS-based)

### Additional Changes
- Odometer becomes required
- Add is_customer_provided flag (no inventory deduction)
- Add Vehicle External History module
- Update inventory deduction logic to support new JO structure

---

## INSTRUCTIONS – PHASE 4: GAP ANALYSIS

Compare:
- Current implementation (from scan)
VS
- Required new behavior (above)

Then provide:

1. Schema gaps
2. API gaps
3. UI/UX gaps
4. Business logic gaps
5. Risk areas (breaking changes)

---

## INSTRUCTIONS – PHASE 5: RECOMMEND NEXT STEPS

DO NOT implement.

Instead, propose:

1. Suggested migration strategy:
   - Safe refactor vs full redesign
2. Order of implementation (high-level phases)
3. Critical blockers to resolve first
4. Suggested DB migration approach
5. Any assumptions that need clarification

---

## OUTPUT FORMAT

Return a structured report:

1. Current System Analysis
2. Identified Limitations
3. Gap Analysis
4. Risk Assessment
5. Recommended Next Steps

Be specific. Reference actual files, tables, and endpoints where possible.

Do NOT write code yet.
Focus on analysis, architecture, and planning.