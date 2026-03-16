# Copilot Implementation Prompt – Job Order Revision (Package + Inventory + Additional Fields)

Scan the entire codebase first to understand the current implementation of the following modules:

* Job Orders
* Package
* Inventory
* Job Order Items / Materials
* Related UI forms

Do not redesign the architecture. Only modify the necessary parts to support the revised Package and job order behavior.

The job order status updates have already been implemented, so do not modify status logic.

---

# 1. Inventory Type Support

Extend the inventory system to support classification by type.

Add a new column to the `inventory_items` table if it does not exist.

```
type TEXT NOT NULL
```

Examples of values:

```
lube
filter
tire
battery
coolant
brake_fluid
```

This column will allow Package items to define **required inventory type instead of a specific inventory item**.

Do not remove existing inventory relationships.

---

# 2. Package Item Inventory Type Reference

Update Package items so they define **inventory requirements by type** instead of referencing a specific inventory item.

If the Package currently stores `inventory_item_id`, modify or extend the structure so the Package can store:

```
inventory_type
```

Example Package definition:

Package: Oil Change

Required Materials:

```
lube
filter
```

The Package should not enforce a specific inventory product.

---

# 3. Job Order Inventory Selection Behavior

Modify the job order item/material selection logic.

Current behavior:

* Package defines specific inventory items
* Job order only changes quantity

New behavior:

1. User selects a Package item.
2. System loads the required inventory types from the Package.
3. For each required type, fetch available inventory items using:

```
SELECT * FROM inventory_items WHERE type = :inventory_type
```

4. The user selects the specific inventory item from the filtered list.
5. The user sets the quantity.

This allows the system to support multiple inventory brands for the same Package requirement.

Example:

Package requires `lube`.

Job order may select:

* Shell Helix
* Castrol GTX
* Mobil Super

---

# 4. Additional Job Order Fields

Add the following fields to the `job_orders` table if they do not exist.

```
odometer_reading INTEGER
vehicle_bay TEXT
assigned_technician_id UUID
```

Remove the payment_method and payment_notes in supabase using mcp because I dont use it in my current implementation after marking the status to pending payment the next step is marking it as complete no other step for recording the notes and method, just button click.

Field descriptions:

### odometer_reading

Optional numeric value representing the vehicle mileage.

### vehicle_bay

Represents the service bay where the vehicle is assigned.

Temporary implementation values:

```
bay1
bay2
```

Use a dropdown in the UI.

### assigned_technician_id

References the technician responsible for the job.

Initially this field shouldnt appear until work begins. Only show this field in the view modal if the Job order started up until the completion.

# 5. Job Order History Display

Update the job order view modal UI to display a history section.

Behavior:

* Display the **most recent 3–5 history entries** in the job order view same as the current Job Order History Modal.

If the user clicks the history section, open the current Job Order History Modal and close the view modal.

This prevents the job order view from becoming excessively long.

---

# 7. UI Updates

Update the following forms if necessary:

### Job Order Create Form

Add inputs for:

* odometer reading
* vehicle bay

### Job Order View

Add:

* technician field (disabled initially)
* history preview section

### Inventory Selection

When selecting materials for a job order:

* display inventory filtered by `inventory_items.type`
* allow users to select the specific inventory item
* allow quantity input

---

# 8. Implementation Rules

* Scan the entire codebase before modifying files.
* Reuse existing controllers and services whenever possible.
* Reuse existing components for UI and copy the styling of the current UI.
* Do not introduce new architectural patterns.
* Follow the current coding style of the repository.
* Ensure existing functionality remains unchanged.
* Only extend the system to support the revised Package and job order logic.