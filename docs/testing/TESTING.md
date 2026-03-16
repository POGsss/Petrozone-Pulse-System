# Test Case 01
**Description:**  
Create Vehicle Profile  
Validate that an authorized user can create a vehicle profile with required information and link it to the correct customer (if applicable).

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R).
2. Navigate to Vehicle Profiles.
3. Click Create/Add Vehicle.
4. Enter required fields (e.g., Plate No., Model, Make, Year, Vehicle Type).
5. (If applicable) Select Customer to link.
6. Click Save/Submit.

**Expected Result:**
- Vehicle profile is created successfully
- Success message is displayed
- Vehicle appears in the list with correct details
- Vehicle is linked to the selected customer (if applicable)

---

# Test Case 02
**Description:**  
View Vehicle Profile  
Validate that an authorized user can view vehicle profile details and associated records (service history / OR/CR if available).

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Vehicle Profiles list.
3. Select an existing vehicle.
4. Open View/Details.

**Expected Result:**
- Vehicle details are displayed accurately
- Related info (e.g., service history / attachments) loads correctly if available
- No missing or mismatched data is shown

---

# Test Case 03
**Description:**  
Update Vehicle Profile  
Validate that an authorized user can update a vehicle profile and changes persist.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing vehicle profile.
3. Click Edit/Update.
4. Modify at least one field (e.g., contact info, vehicle info).
5. Click Save.

**Expected Result:**
- Vehicle profile is updated successfully
- Changes reflect on details and list views
- No unexpected data loss occurs

---

# Test Case 04
**Description:**  
Delete Vehicle Profile  
Validate that vehicle deletion follows system rules (deactivate/soft delete) and prevents selection if removed/inactive.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing vehicle profile.
3. Click Delete/Deactivate.
4. Confirm action.
5. Attempt to search/select the vehicle in Job Order creation.

**Expected Result:**
- Vehicle is removed or marked inactive based on design
- Vehicle no longer appears as selectable for new transactions (if deactivated/deleted)
- System shows correct status in vehicle list

---

# Test Case 05
**Description:**  
Create Package Item  
Validate that an authorized user can create a global Package item with optional inventory links.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Navigate to Packages.
3. Click "Add New Package".
4. Enter required fields (Name) and optional fields (Description).
5. Optionally add inventory items from the dropdown (draft list).
6. Click "Create Package".

**Expected Result:**
- Package item is created successfully (global, no branch scoping)
- Card appears in the grid with name, status badge, and inventory count
- Linked inventory items (if any) are saved correctly

---

# Test Case 06
**Description:**  
View Package Item  
Validate that authorized roles can view Package item details including linked inventory.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R).
2. Navigate to Packages.
3. Click on a Package item card to open the View modal.

**Expected Result:**
- View modal shows item name, status, description (all read-only)
- Linked inventory section displays associated items (name, SKU, cost/unit)
- Timestamps (created/updated) are displayed
- R role: no Edit/Delete buttons visible. T role: no access to Packages page

---

# Test Case 07
**Description:**  
Update Package Item  
Validate that authorized users can update Package item details and manage inventory links.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Click the Edit (pencil) button on a Package card.
3. Modify fields (Name, Status, Description).
4. Add or remove inventory links (live API calls per action).
5. Click "Save Changes".

**Expected Result:**
- Update is saved successfully
- Card reflects updated name, status, and inventory count
- Inventory link additions/removals are persisted immediately (live, not batched)

---

# Test Case 08
**Description:**  
Delete/Deactivate Package Item  
Validate that deleting a Package item uses hard delete with FK fallback to deactivation.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Click the Delete (trash) button on a Package card.
3. Confirm the action in the modal.
4. Attempt to add the deactivated item in Job Order creation.

**Expected Result:**
- If no FK references: item is permanently deleted (hard delete)
- If referenced by job orders: item is deactivated (status set to inactive) with info toast
- Inactive items are not selectable for new Job Orders
- Historical JO records remain intact

---

# Test Case 09
**Description:**  
Create Pricing Matrix  
Validate that authorized users can create a vehicle-class-based pricing matrix for a Package item.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R).
2. Navigate to Pricing Matrix.
3. Click "Add Pricing Rule".
4. Select a Package item, enter Light Vehicle Price, Heavy Vehicle Price, Extra Heavy Vehicle Price.
5. Set status (Active/Inactive) and save.

**Expected Result:**
- Pricing matrix is created successfully
- Entry appears in the table with 3 price columns
- If an active matrix already exists for the same Package item, a 409 conflict error is shown
- Data is stored accurately and usable in Job Order pricing resolution

---

# Test Case 10
**Description:**  
View Pricing Matrix  
Validate that roles can view pricing matrix entries with 3-tier vehicle class prices.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R/T where applicable).
2. Navigate to Pricing Matrix list.
3. View the table: Package Item, Light Price, Heavy Price, Extra Heavy Price, Status.
4. Click on an entry to view details.

**Expected Result:**
- Pricing entries are visible based on access (T is view-only)
- Three price columns display correctly with ₱ formatting
- Stats cards show All Rules / Active / Inactive counts

---

# Test Case 11
**Description:**  
Update Pricing Matrix  
Validate that authorized users can update pricing values (light/heavy/extra heavy) and changes apply to new JOs.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing pricing entry and click Edit.
3. Modify one or more price values (light/heavy/extra heavy) or status.
4. Save.
5. Create a new Job Order using the affected Package item.

**Expected Result:**
- Pricing entry updates successfully
- New Job Orders resolve the updated pricing for the matching vehicle class
- Existing historical Job Orders retain their original pricing snapshots

---

# Test Case 12
**Description:**  
Delete Pricing Matrix Entry  
Validate that removing a pricing entry prevents pricing resolution for new JOs.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing pricing entry.
3. Click Delete and confirm.
4. Attempt to add the affected Package item to a new Job Order.

**Expected Result:**
- Entry is permanently deleted
- When the Package item is added to a JO, the resolve endpoint returns `pricing: null`
- Labor price defaults to 0 in the JO, with a warning toast shown to the user
- Existing JO records with this pricing are not affected

---

# Test Case 13
**Description:**  
Create Job Order  
Validate end-to-end creation of a Job Order including cascading lookups, vehicle class pricing, and inventory template loading.

**Test Steps:**
1. Log in as authorized role (POC/JS/R).
2. Navigate to Job Orders.
3. Click "Create Job Order".
4. Select Branch → Customer (filtered by branch) → Vehicle (filtered by customer).
5. Select Vehicle Class (Light / Heavy / Extra Heavy).
6. Add Package items — pricing resolves automatically (labor price from vehicle class column).
7. Verify inventory items load from Package template, with editable quantities.
8. Review line totals: (labor_price + inventory_cost) × quantity.
9. Optionally add third-party repairs.
10. Click "Create Job Order".

**Expected Result:**
- Job Order is created with auto-generated order number
- Customer and vehicle are linked correctly
- Pricing resolves per vehicle class (0 if no active pricing, with warning)
- Inventory snapshots are saved in job_order_item_inventories
- Line totals and grand total are calculated correctly

---

# Test Case 14
**Description:**  
View Job Order Details  
Validate that users can view Job Order details including items, inventory breakdown, pricing, TPR, and history.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Job Orders list.
3. Click on a Job Order card to open the View modal.

**Expected Result:**
- JO details load correctly (order #, status, customer, vehicle, branch, vehicle class, notes)
- Items list shows: Package item name, quantity, labor price, inventory cost, line total
- Expandable inventory sub-rows show: inventory item name, qty per unit, unit cost
- Third-party repairs section displays if any exist
- History timeline shows status changes and actions
- Timestamps (created, updated) are displayed

---

# Test Case 15
**Description:**  
Update Job Order (Edit Items and Notes)  
Validate updating a Job Order: edit notes, add/remove items, change quantities (only when status is created or rejected).

**Test Steps:**
1. Log in as authorized role (POC/JS/R for items; POC/JS/R/T for notes).
2. Open a Job Order with status Created or Rejected.
3. Click Edit.
4. Modify notes, add/remove items, or change item quantities.
5. Save changes.

**Expected Result:**
- Job Order updates successfully
- Line totals recalculate: (labor_price + inventory_cost) × new_quantity
- At least one item must remain (cannot remove all)
- New items go through full pricing resolution + inventory template loading
- Items cannot be edited when status is Pending, Approved, or Cancelled

---

# Test Case 16
**Description:**  
Delete/Cancel Job Order  
Validate conditional delete (hard for created, soft for others) and cancel with stock restoration.

**Test Steps:**
1. Log in as authorized role (POC/JS/R).
2. Open a Job Order.
3. Test Delete: confirm action.
4. Test Cancel on an Approved JO: confirm action.
5. Check inventory stock levels after cancelling an approved JO.

**Expected Result:**
- Created status: hard delete (JO and all related records permanently removed)
- Other statuses: soft delete (is_deleted set to true, record hidden from list)
- Cancel on approved JO: stock_in movements created to restore deducted stock
- Cancel on non-approved JO: no stock changes
- Historical records remain consistent

---

# Test Case 17
**Description:**  
Request Approval  
Validate that a Job Order can transition from Created/Rejected to Pending status.

**Test Steps:**
1. Log in as role allowed to request approval (POC/JS/R/T).
2. Open a Job Order with status Created or Rejected.
3. Click "Request Approval".
4. Confirm the action.

**Expected Result:**
- Job Order status updates to "Pending"
- History entry is recorded with user and timestamp
- JO items become non-editable while Pending

---

# Test Case 18
**Description:**  
Record Approval (Approve/Reject)  
Validate that R/T roles can approve or reject a Pending Job Order, triggering stock deduction on approval.

**Test Steps:**
1. Log in as R or T role (roles with approval permission).
2. Open a Pending Job Order.
3. Click Approve or Reject.
4. If approving: check inventory stock levels after approval.

**Expected Result:**
- Approve: status updates to "Approved", approved_at timestamp set, stock_out movements created for all inventory items
- Reject: status updates to "Rejected", items become editable again
- If insufficient stock on approval: error shown, JO remains Pending
- History entry is recorded for the action

---

# Test Case 19
**Description:**  
Create Customer Profile  
Validate that authorized users can create a customer profile and link basic information.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Customer Management.
3. Click Create/Add Customer.
4. Enter required details (name, contact, address if required).
5. Save.

**Expected Result:**
- Customer profile is created successfully
- Customer appears in customer list
- Customer can be selected during Job Order creation

---

# Test Case 20
**Description:**  
View Customer Profile  
Validate that authorized users can view customer details and linked vehicles/job orders.

**Test Steps:**
1. Log in as authorized role.
2. Open a customer record from list.
3. Review linked vehicles/job orders section (if present).

**Expected Result:**
- Customer details display correctly
- Linked vehicles/job orders appear correctly
- No mismatched associations are shown

---

# Test Case 21
**Description:**  
Update Customer Profile  
Validate that authorized users can update customer information and changes persist.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing customer profile.
3. Click Edit/Update.
4. Modify a field (e.g., phone number, address).
5. Save.

**Expected Result:**
- Customer profile updates successfully
- Changes reflect in list and detail view
- Linked data remains intact

---

# Test Case 22
**Description:**  
Delete/Deactivate Customer Profile  
Validate that customer removal follows system rules and prevents selection if inactive.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing customer profile.
3. Click Delete/Deactivate.
4. Confirm action.
5. Attempt to select the customer in Job Order creation.

**Expected Result:**
- Customer is removed or marked inactive based on design
- Inactive customer cannot be selected for new Job Orders
- Historical records remain accessible if required

---

# Test Case 23
**Description:**  
Add Third-Party Repair Record  
Validate that users can record third-party repairs and link them to a Job Order/customer/vehicle where applicable.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to third-party repairs section.
3. Click Add Third-Party Repair.
4. Enter description, cost, vendor (if required), and link to Job Order/customer/vehicle.
5. Save.

**Expected Result:**
- Third-party repair record is saved successfully
- Record appears under the correct Job Order/customer/vehicle
- Cost is reflected in totals if included in pricing

---

# Test Case 24
**Description:**  
View Third-Party Repair Record  
Validate that users can view third-party repair details and linked references.

**Test Steps:**
1. Log in as authorized role.
2. Open a record with third-party repair.
3. Open third-party repair details view.

**Expected Result:**
- Details display accurately
- Linked references are correct

---

# Test Case 25
**Description:**  
Update Third-Party Repair Record  
Validate that authorized users can update third-party repair details and totals update accordingly.

**Test Steps:**
1. Log in as authorized role.
2. Open existing third-party repair.
3. Click Edit/Update.
4. Modify cost/description.
5. Save.
6. Recheck totals if linked.

**Expected Result:**
- Record updates successfully
- Updated fields persist
- Totals recalculate correctly if linked

---

# Test Case 26
**Description:**  
Delete/Remove Third-Party Repair Record  
Validate removing a third-party repair record and totals update if applicable.

**Test Steps:**
1. Log in as authorized role.
2. Open existing third-party repair.
3. Click Delete/Remove.
4. Confirm.
5. Validate totals if linked.

**Expected Result:**
- Record is deleted/removed successfully
- Record no longer appears
- Totals update correctly without removed cost

---

# Test Case 27
**Description:**  
Job Order Lifecycle – Draft to Pending Approval  
Validate status transition from Draft/Created to Pending Approval when approval is requested.

**Test Steps:**
1. Create a new Job Order with at least 1 item.
2. Save Job Order.
3. Click Request Approval.
4. Refresh/reopen the Job Order.

**Expected Result:**
- Status updates to Pending Approval
- Approval request action is recorded/visible

---

# Test Case 28
**Description:**  
Job Order Lifecycle – Approval to Approved  
Validate status transition from Pending Approval to Approved and unlock post-approval actions.

**Test Steps:**
1. Open Job Order with Pending Approval.
2. Perform approval action.
3. Refresh/reopen Job Order.
4. Attempt next allowed post-approval action.

**Expected Result:**
- Status updates to Approved
- Approval indicator is recorded
- Post-approval actions follow role rules

---

# Test Case 29
**Description:**  
Job Order Lifecycle – Reject Approval  
Validate rejection flow updates status and prevents proceeding without re-approval.

**Test Steps:**
1. Open Job Order with Pending Approval.
2. Perform Reject/Decline Approval action.
3. Refresh/reopen Job Order.
4. Attempt to proceed without re-requesting approval.

**Expected Result:**
- Status updates to Rejected/Declined
- System prevents proceeding until approval is requested again (or per design)

---

# Test Case 30
**Description:**  
Job Order Lifecycle – Cancel Job Order  
Validate cancel rules and ensure blocked actions on cancelled Job Orders based on permission/workflow rules.

**Test Steps:**
1. Open an existing Job Order.
2. Click Cancel and confirm.
3. Attempt to edit/add items/request approval.

**Expected Result:**
- Status updates to Cancelled
- Blocked actions show clear message
- Permissions/workflow rules are enforced

---

# Test Case 31
**Description:**  
Job Order Pricing — Auto Compute Totals  
Validate totals are computed correctly using the formula: (labor_price + inventory_cost) × quantity.

**Test Steps:**
1. Create a Job Order with a known vehicle class (e.g., Light).
2. Add a Package item with a known pricing matrix (e.g., light_price = 500).
3. Verify inventory items load from the Package template (e.g., 2 items totaling ₱930).
4. Save Job Order.
5. Review pricing breakdown and totals.

**Expected Result:**
- Labor price = light_price from pricing matrix (e.g., ₱500)
- Inventory cost = Σ(unit_cost × quantity_per_unit) (e.g., ₱930)
- Line total = (500 + 930) × 1 = ₱1,430
- Grand total = sum of all line totals
- Breakdown is consistent with the formula

---

# Test Case 32
**Description:**  
Job Order Pricing — Quantity and Recalculation  
Validate changing item quantity or inventory quantities updates line total correctly.

**Test Steps:**
1. Open a Job Order with priced items.
2. Change the item quantity (e.g., from 1 to 3).
3. Verify line_total = (labor_price + inventory_cost) × 3.
4. Change inventory quantity_per_unit for one sub-item.
5. Verify inventory_cost recalculates, then line_total recalculates.
6. Save.

**Expected Result:**
- Totals recalculate correctly on both item quantity and inventory quantity changes
- Grand total updates accordingly
- No rounding or formatting issues

---

# Test Case 33
**Description:**  
Job Order Pricing – Remove Item Recalculation  
Validate removing an item updates totals and does not leave orphaned charges.

**Test Steps:**
1. Open Job Order with multiple items.
2. Remove one item.
3. Save.
4. Verify totals and breakdown.

**Expected Result:**
- Removed item is no longer listed
- Totals adjust correctly
- No leftover charges remain

---

# Test Case 34
**Description:**  
Job Order Pricing – Update Pricing Matrix Impact  
Validate pricing matrix updates apply to new Job Orders and confirm behavior for existing ones.

**Test Steps:**
1. Create Job Order A using an item with known rate.
2. Update Pricing Matrix rate.
3. Create Job Order B using same item.
4. Compare totals A vs B.

**Expected Result:**
- New Job Orders use updated pricing
- Existing Job Orders follow defined behavior consistently

---

# Test Case 35
**Description:**  
Pricing Missing Configuration Handling  
Validate system behavior when a Package item has no active pricing matrix.

**Test Steps:**
1. Select a Package item that has no active pricing matrix (or delete/deactivate its pricing).
2. Add it to a Job Order.
3. Observe the pricing resolution result.

**Expected Result:**
- Labor price defaults to 0
- Warning toast is shown to the user indicating no active pricing
- Inventory cost still calculates normally (from template links)
- Line total = (0 + inventory_cost) × quantity
- JO can still be created (no blocking error)

---

# Test Case 36
**Description:**  
Third-Party Repair Cost Included in Totals  
Validate third-party repair costs reflect properly in totals and breakdown.

**Test Steps:**
1. Open/Create a Job Order.
2. Add third-party repair with known cost.
3. Save.
4. Review totals and breakdown.

**Expected Result:**
- Third-party repair is reflected correctly
- Total increases correctly
- No duplication after refresh

---

# Test Case 37
**Description:**  
Third-Party Repair Update Recalculation  
Validate updating third-party repair cost triggers recalculation.

**Test Steps:**
1. Open Job Order with third-party repair.
2. Update cost and save.
3. Verify totals and breakdown.

**Expected Result:**
- Updated cost persists
- Totals recalculates correctly
- Breakdown reflects updated value

---

# Test Case 38
**Description:**  
Approval Gate – Prevent Pricing Changes After Approval  
Validate restrictions on edits after approval and required re-approval if edits are allowed.

**Test Steps:**
1. Approve a Job Order.
2. Attempt to add/remove items or change quantity.
3. Attempt to request approval again if edits are allowed.

**Expected Result:**
- If edits blocked: system prevents changes with clear message
- If edits allowed: system requires re-approval and updates status accordingly
- Behavior matches intended workflow

---

# Test Case 39
**Description:**  
Job Order Versioning / History (If Available)  
Validate that key changes (items/pricing/status) appear in Job Order history/status trail if supported.

**Test Steps:**
1. Create a Job Order and save.
2. Update item quantity and save.
3. Request approval and approve.
4. Review history/status trail section.

**Expected Result:**
- Trail shows key events accurately (created/edited/approval requested/approved)
- Timestamps and actor are recorded correctly (if supported)

---

# Test Case 40
**Description:**  
Job Order List Performance  
Validate Job Orders list loading/search performance with large data volume.

**Test Steps:**
1. Ensure environment has many Job Orders (or seeded data).
2. Open Job Orders list page.
3. Perform search/filter and pagination actions.

**Expected Result:**
- List loads within acceptable time
- Search/filter responds consistently
- No UI freezing or timeout occurs

---

# Test Case 41
**Description:**  
Pricing Recalculation Performance  
Validate pricing recalculation performance when Job Order has many line items.

**Test Steps:**
1. Create a Job Order with many items (e.g., 20–30 services/products).
2. Update quantity of one item.
3. Save and observe recalculation behavior.

**Expected Result:**
- Recalculation completes within acceptable time
- Totals remain correct
- No crash/timeout occurs

---

# Test Case 42
**Description:**  
Create Report  
Validate that an authorized user can create a report with name, type, branch, and optional date range.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R).
2. Navigate to Reports.
3. Click "New Report".
4. Enter Report Name, select Report Type, select Branch, set Date From/To.
5. Click "Create Report".

**Expected Result:**
- Report is created successfully
- Success toast message is displayed
- Report appears in the card grid with correct details
- Report count increases in the header subtitle

---

# Test Case 43
**Description:**  
Edit Report  
Validate that an authorized user can edit an existing report's configuration.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Reports.
3. Click the Edit (pencil) button on a report card.
4. Modify the report name, type, branch, or date filters.
5. Click "Save Changes".

**Expected Result:**
- Edit modal opens pre-populated with existing data
- Changes are saved successfully
- Success toast message is displayed
- Card reflects the updated information

---

# Test Case 44
**Description:**  
View Report Data  
Validate that clicking a report card opens a view modal with dynamically generated data.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Reports.
3. Click on a report card (not on action buttons).
4. Wait for data to load.

**Expected Result:**
- View modal displays report information (type, branch, dates, generated by)
- Report preview shows summary data and data table
- Loading spinner appears while generating data
- Table shows up to 50 rows with message for additional rows

---

# Test Case 45
**Description:**  
Delete Report  
Validate that a report can be soft-deleted with confirmation.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Reports.
3. Click the Delete (trash) button on a report card.
4. Confirm deletion in the modal.

**Expected Result:**
- Confirmation modal shows report name
- Report is removed from the list after confirmation
- Success toast message is displayed
- Report count decreases

---

# Test Case 46
**Description:**  
Export Report as PDF  
Validate that a report can be exported as a styled PDF file.

**Test Steps:**
1. Navigate to Reports.
2. Open a report's view modal or use the card's "More" dropdown.
3. Click "Export PDF" or "Save as PDF".

**Expected Result:**
- A .pdf file downloads with the report name as filename
- PDF has a styled header matching the theme color
- PDF contains report details, summary data, and a formatted table
- Page numbers appear in the footer

---

# Test Case 47
**Description:**  
Export Report as Excel  
Validate that a report can be exported as a styled Excel (.xlsx) file.

**Test Steps:**
1. Navigate to Reports.
2. Open a report's view modal or use the card's "More" dropdown.
3. Click "Export Excel" or "Save as Excel".

**Expected Result:**
- A .xlsx file downloads with the report name as filename
- Excel has styled header rows matching the theme color
- Report details and summary are shown as label/value rows
- Data table has colored headers, borders, alternating rows, and auto-sized columns

---

# Test Case 48
**Description:**  
Search and Filter Reports  
Validate search and filter functionality on the reports page.

**Test Steps:**
1. Create several reports of different types.
2. Type a report name or type in the search bar.
3. Use the Type filter dropdown to filter by a specific type.

**Expected Result:**
- Cards filter in real-time by search query
- Type filter shows only matching reports
- Search and filter work together
- Empty state message when no results match
- Pagination resets to page 1 on filter change