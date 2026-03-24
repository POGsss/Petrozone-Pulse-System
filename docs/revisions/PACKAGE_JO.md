# PACKAGE & JOB ORDER PACKAGE LOGIC REVISION

## IMPORTANT CONTEXT

This revision ONLY affects:
- Package Management
- Package behavior inside Job Order creation

THIS DOES NOT CHANGE:
- Labor (standalone)
- Inventory (standalone)
- Overall Job Order total computation

---

# CURRENT SYSTEM (DO NOT BREAK)

Job Order currently supports:

- Packages
- Labor (standalone)
- Inventory (standalone)

Total formula:

Grand Total =
  package_total
+ labor_total
+ inventory_total

THIS MUST REMAIN UNCHANGED.

---

# OBJECTIVE

We are updating how **Packages behave internally**, NOT how Job Orders compute totals overall.

---

# MODULE 1: PACKAGE MANAGEMENT UPDATE

## GOAL

Convert Package into:
- Fixed-price service
- Contains ONLY labor items
- No inventory logic inside package

---

## REQUIRED CHANGES

### 1. Package Schema

Update packages table:

- name (existing)
- description (existing)
- price (NEW REQUIRED FIELD)

REMOVE:
- Any inventory-related logic or references

---

### 2. Package Composition

Create/Use:

package_labor_items:
- package_id
- labor_id
- labor_price (snapshot or derived)

---

## FRONTEND (PACKAGE PAGE)

Update Create/Edit Package:

Fields:

- Name
- Price (NEW)
- Description
- Labor Items (multi-select)

REMOVE:
- Inventory selection

---

## ACCEPTANCE CRITERIA

- Package has fixed price
- Package contains only labor items
- No inventory in package module

---

# MODULE 2: JOB ORDER PACKAGE LOGIC UPDATE

## GOAL

Update how packages behave inside Job Orders WITHOUT affecting:

- Standalone Labor lines
- Standalone Inventory lines
- Grand Total calculation

---

## JOB ORDER STRUCTURE (FINAL)

Job Order will still have:

1. Package Section (UPDATED LOGIC)
2. Labor Section (UNCHANGED)
3. Inventory Section (UNCHANGED)

---

## DISPLAY STRUCTURE (PACKAGE ONLY)

When selecting a package:

Show:

Package Name  
Package Price  

Base Components:
- Labor Item 1 (cost)
- Labor Item 2 (cost)
- ...

Vehicle-Specific Components:
- Inventory Item 1
- Inventory Item 2
- ...

---

# CORE PACKAGE PRICING LOGIC

## RULE 1: FIXED PACKAGE TOTAL

package_total = package.price

## RULE 2: INVENTORY DOES NOT ADD TO TOTAL

Inventory inside package:
- DOES NOT increase total
- MUST be redistributed from labor cost

## RULE 3: INVENTORY REDISTRIBUTION

inventory_total = SUM(all inventory costs inside package)
labor_count = number of labor items
deduction_per_labor = inventory_total / labor_count

## RULE 4: LABOR ADJUSTMENT

FOR EACH labor:
  adjusted_labor_cost = original_labor_cost - deduction_per_labor

## RULE 5: VALIDATION

IF inventory_total > package.price:
  THROW ERROR ("Inventory exceeds package price")

## RULE 6: FINAL PACKAGE TOTAL

SUM(adjusted_labor_costs) + SUM(inventory_costs) = package.price


# VERY IMPORTANT CONSTRAINT

This redistribution logic applies ONLY to:
Package section inside Job Order

It MUST NOT affect:
- Standalone Labor items
- Standalone Inventory items

# BACKEND CHANGES

## UPDATE ONLY:

- Package selection logic in Job Order
- Package line calculation logic

## REMOVE:

- Package-based inventory templates
- Package inventory auto-generation

## ENSURE:

- Labor inside package is adjusted dynamically
- Inventory is still stored normally
- Package total ALWAYS equals package.price

# FRONTEND CHANGES

## JOB ORDER CREATION

- Package Section
- Show labor breakdown
- Allow adding inventory ONLY (vehicle-specific)

## WHEN ADDING INVENTORY

- Recalculate labor cost dynamically
- Update UI instantly
- Keep package total constant

## UI EXAMPLE

Package Price: 2400
Labor:
- Labor A: 1200 → 1000
- Labor B: 1200 → 1000
Inventory:
- Item 1: 200
- Item 2: 200
Package Total = 2400

## STRICT RULES

DO NOT:
- Add inventory cost to package total
- Modify package price dynamically
- Allow inventory inside package management
- Affect standalone labor/inventory logic
- Change overall Job Order total formula