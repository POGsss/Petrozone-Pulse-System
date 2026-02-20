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
Create Services/Products/Packages  
Validate that an authorized user can create a Service, Product, or Package and configure basic details.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Navigate to Services & Products (and Packages if separated).
3. Click Create/Add.
4. Enter required fields (name, category/type, pricing fields if applicable).
5. Save the record.

**Expected Result:**
- New Service/Product/Package is created successfully
- Record appears in the list
- Details are saved correctly

---

# Test Case 06
**Description:**  
View Services/Products/Packages  
Validate that authorized roles can view the list and details of service/product/package items.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R where applicable).
2. Navigate to Services/Products/Packages listing.
3. Select an item and open View/Details.

**Expected Result:**
- List loads correctly
- Item details are displayed accurately
- No unauthorized edit controls are shown to restricted roles

---

# Test Case 07
**Description:**  
Update Services/Products/Packages  
Validate that authorized users can update service/product/package details and mappings as applicable.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Open an existing item.
3. Click Edit/Update.
4. Modify fields (e.g., name, category, mapping).
5. Save changes.

**Expected Result:**
- Update is saved successfully
- Changes reflect in list and details view
- Existing references remain valid (no broken mappings)

---

# Test Case 08
**Description:**  
Delete/Deactivate Services/Products/Packages  
Validate that deleting/deactivating an item follows system rules and prevents use in new Job Orders.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS).
2. Open an existing item.
3. Click Delete/Deactivate.
4. Confirm action.
5. Attempt to add the same item in Job Order creation.

**Expected Result:**
- Item is deleted or marked inactive based on design
- Item is no longer selectable for new Job Orders
- System does not break existing historical records

---

# Test Case 09
**Description:**  
Create Pricing Matrix  
Validate that authorized users can create labor/packaging pricing matrix entries used for quotations.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R).
2. Navigate to Pricing Matrix.
3. Click Create/Add.
4. Input required pricing data (labor type/rate, package pricing rules as applicable).
5. Save.

**Expected Result:**
- Pricing entry is created successfully
- Entry appears in matrix list
- Data is stored accurately and usable in Job Order pricing

---

# Test Case 10
**Description:**  
View Pricing Matrix  
Validate that roles can view pricing matrix entries and retrieve correct values.

**Test Steps:**
1. Log in as authorized role (HM/POC/JS/R/T where applicable).
2. Navigate to Pricing Matrix list.
3. Open an entry details view.

**Expected Result:**
- Pricing matrix entries are visible based on access
- Values displayed match saved configuration
- No incorrect formatting or missing data

---

# Test Case 11
**Description:**  
Update Pricing Matrix  
Validate that authorized users can update pricing values and that updated values apply in new quotations.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing pricing entry.
3. Click Edit/Update.
4. Modify rate/value.
5. Save.
6. Create a new Job Order estimate using affected item.

**Expected Result:**
- Pricing entry updates successfully
- New Job Orders use updated pricing
- Existing historical Job Orders remain unchanged (unless system recalculates by design)

---

# Test Case 12
**Description:**  
Delete/Deactivate Pricing Matrix Entry  
Validate that removing a pricing entry follows system rules and prevents selection in new pricing calculations.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing pricing entry.
3. Click Delete/Deactivate.
4. Confirm action.
5. Attempt to use the removed entry in Job Order pricing.

**Expected Result:**
- Entry is removed/inactivated successfully
- Removed entry is not selectable for new quotations
- System handles missing pricing gracefully (error message or fallback rule)

---

# Test Case 13
**Description:**  
Create Job Order Card  
Validate end-to-end creation of a Job Order card including customer, vehicle, and selected services/products/packages.

**Test Steps:**
1. Log in as authorized role (POC/JS/R).
2. Navigate to Job Orders.
3. Click Create Job Order.
4. Select Customer and Vehicle.
5. Add services/products/packages.
6. Confirm pricing/quotation details.
7. Save Job Order.

**Expected Result:**
- Job Order is created successfully
- Job Order has a unique reference/ID
- Customer and vehicle are linked correctly
- Selected items and totals are saved accurately

---

# Test Case 14
**Description:**  
View Job Order Card  
Validate that users can view Job Order details including items, pricing breakdown, and status history.

**Test Steps:**
1. Log in as authorized role.
2. Navigate to Job Orders list.
3. Open an existing Job Order card.

**Expected Result:**
- Job Order details load correctly
- Items, totals, and pricing breakdown are accurate
- Status and timestamps (if available) are displayed correctly

---

# Test Case 15
**Description:**  
Update Job Order Card  
Validate updating a Job Order card (e.g., add/remove services/products, update quantities) and total recalculation.

**Test Steps:**
1. Log in as authorized role.
2. Open an existing Job Order.
3. Click Edit/Update.
4. Add/remove an item or change quantity.
5. Save changes.

**Expected Result:**
- Job Order updates successfully
- Total recalculates correctly
- Item list reflects updated data
- System keeps a consistent state (no duplicates/unexpected resets)

---

# Test Case 16
**Description:**  
Delete/Cancel Job Order Card  
Validate Job Order deletion/cancellation rules and ensure it does not break linked records.

**Test Steps:**
1. Log in as authorized role.
2. Open a Job Order.
3. Click Delete/Cancel.
4. Confirm action.
5. Check if linked records remain consistent (customer/vehicle history).

**Expected Result:**
- Job Order is deleted or marked cancelled based on design
- Record status is updated correctly
- Linked customer/vehicle records remain consistent
- System prevents actions on cancelled Job Orders

---

# Test Case 17
**Description:**  
Ask for Customer Approval  
Validate that the system can send/trigger a customer approval request for a Job Order quotation.

**Test Steps:**
1. Log in as role allowed to request approval.
2. Open a Job Order with quotation details.
3. Click Request Approval.
4. Confirm sending/trigger action.

**Expected Result:**
- Approval request is generated successfully
- Job Order status updates to “Pending Approval” (or equivalent)
- Customer notification mechanism is triggered based on system design

---

# Test Case 18
**Description:**  
Receive Customer Approval  
Validate that customer approval updates Job Order status and allows next workflow steps.

**Test Steps:**
1. Using customer approval mechanism (link/status update), mark the Job Order as approved.
2. Refresh Job Order view.
3. Attempt next action allowed after approval.

**Expected Result:**
- Job Order status updates to “Approved” (or equivalent)
- Approval timestamp/indicator is recorded
- Next workflow steps become available

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
Job Order Pricing – Auto Compute Totals  
Validate totals are computed correctly based on Pricing Matrix and configured pricing.

**Test Steps:**
1. Create a Job Order.
2. Add items with known pricing setup.
3. Save Job Order.
4. Review pricing breakdown and totals.

**Expected Result:**
- Line item prices match configuration
- Subtotals and total compute correctly
- Breakdown is consistent

---

# Test Case 32
**Description:**  
Job Order Pricing – Quantity and Recalculation  
Validate changing quantities updates totals correctly.

**Test Steps:**
1. Open a Job Order with priced items.
2. Update quantity.
3. Save.
4. Reopen and verify totals.

**Expected Result:**
- Totals recalculates correctly
- Breakdown remains accurate
- No rounding/format issues

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
Validate system behavior when selected item has no configured pricing.

**Test Steps:**
1. Select an item with missing pricing (or disable its pricing entry).
2. Add it to Job Order.
3. Attempt to save or generate quotation.

**Expected Result:**
- System blocks or applies defined fallback behavior
- Clear message is shown
- No silent incorrect totals occur

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