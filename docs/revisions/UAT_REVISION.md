# System Revision TODO List (Not Started Items)

## Inventory Module

### Access Control
- Current Implementation = Receptionist cannot perform Create/Edit/Delete inventory actions though operationally required  
- Required Implementation = Update RBAC to allow Receptionist role to Create, View, Edit, Delete inventory items  

The current role-based access control (RBAC) configuration restricts the Receptionist role from performing core inventory operations such as creating, editing, and deleting inventory records. However, based on actual business operations, receptionists are responsible for maintaining stock records and ensuring accurate inventory data during daily transactions. This revision requires updating the RBAC permission matrix to explicitly grant the Receptionist role full CRUD (Create, Read, Update, Delete) access to inventory-related resources. Backend middleware and frontend UI guards must both be updated to reflect this change, ensuring consistency across API authorization and user interface behavior.

---

### Usability
- Current Implementation = Inventory list and details fail to load correctly  
- Required Implementation = Fix inventory list and detail view loading issues and ensure data accuracy  

Users are currently unable to reliably load or view inventory data due to issues in list rendering and detail fetching. This may stem from API failures, incorrect query handling, or frontend state management issues. The fix should include validating backend endpoints for inventory retrieval, ensuring correct pagination and filtering logic, and verifying frontend data binding and lifecycle hooks. Error handling should also be improved so that failures are visible and debuggable instead of silently breaking the UI.

---

### Filtering
- Current Implementation = No low stock filter available  
- Required Implementation = Add low stock filter functionality  

The system lacks the ability to quickly identify inventory items that are below a defined stock threshold. This revision requires implementing a low stock filter that allows users to view only items that fall below a configurable minimum quantity. Backend support should include query parameters for threshold-based filtering, while the frontend should provide an accessible toggle or filter option. Optionally, thresholds can be stored per item or globally defined.

---

### Purchase Order
- Current Implementation = PO Number is editable  
- Required Implementation = Make PO Number system-generated and non-editable  

Purchase Order (PO) numbers are currently user-editable, which introduces risks of duplication, inconsistency, and broken audit trails. The revision requires enforcing system-generated PO numbers using a deterministic or sequential format (e.g., prefix + timestamp or incremental ID). Once generated, the PO number must be immutable. Backend validation should reject any attempt to override this field, and the frontend should render it as read-only.

---

### Integration
- Current Implementation = Inventory deduction cannot be validated due to lack of access  
- Required Implementation = Fix RBAC and ensure inventory updates after order completion  

Due to restricted permissions, users cannot validate whether inventory deductions are correctly applied after transactions. This revision requires both fixing RBAC issues and ensuring that inventory updates are triggered correctly after order completion events. Backend logic must verify that stock deduction occurs atomically during order finalization, and audit logs should be introduced or verified to track inventory movements.

---

## Order Fulfillment Module

### Vehicle Profile
- Current Implementation = OR/CR requirement incorrectly enforced for original parts  
- Required Implementation = Make OR/CR optional  

The system currently enforces OR/CR (Official Receipt / Certificate of Registration) as mandatory fields even in scenarios where they are not applicable, such as original parts processing. This creates unnecessary friction in the workflow. The fix involves updating validation rules to make these fields optional, both at the backend schema level and frontend form validation.

---

### Job Order (Fields & Validation)
- Current Implementation = Missing fields (e.g., Technician Name), odometer required unnecessarily  
- Required Implementation = Add required field labels and make odometer optional  

The Job Order form lacks important fields such as Technician Name while enforcing unnecessary requirements like odometer input. This revision requires updating the data model to include missing operational fields and refining validation rules so only truly required fields are enforced. The frontend should clearly indicate required vs optional fields.

---

### Job Order (Printability)
- Current Implementation = No printable Job Order version available  
- Required Implementation = Add printable/exportable Job Order format  

There is currently no way to generate a printable or exportable version of a Job Order, which limits operational usability for documentation and customer transactions. This revision requires implementing a print-friendly layout and export functionality (e.g., PDF generation). The output should include all relevant job order details in a structured and readable format.

---

### Job Order Control
- Current Implementation = Completed Job Orders can still be deactivated  
- Required Implementation = Restrict modification/deactivation of completed Job Orders  

Completed Job Orders should be considered final records and must not be modifiable or deactivatable. The current implementation allows this, which compromises data integrity. The revision requires enforcing strict state-based rules where completed records are locked. Backend validation must reject such actions, and the UI should disable or hide these controls.

---

### Third-Party Repair (Parts)
- Current Implementation = Missing support for third-party parts  
- Required Implementation = Add functionality for third-party parts tracking  

The system supports third-party repair services but lacks functionality for handling third-party supplied parts. This revision requires extending the data model to include third-party parts, linking them to job orders, and ensuring they are included in pricing and reporting where applicable.

---

### Approval Workflow (Testing)
- Current Implementation = Cannot fully test approval due to system limitations (sample customer)  
- Required Implementation = Enable real or simulated approval testing mechanism  

The approval workflow cannot be fully validated due to lack of realistic testing scenarios. This revision requires implementing a test mode or mock environment where approvals can be simulated without affecting production data. Alternatively, seed data or test accounts can be introduced.

---

### Approval Workflow (Rejection)
- Current Implementation = Rejection workflow incomplete or unclear  
- Required Implementation = Improve rejection flow and enforce re-approval logic  

The rejection process lacks clarity and proper system enforcement. This revision requires defining a clear rejection state, capturing rejection reasons, and ensuring that rejected items must go through a re-approval process before proceeding. UI feedback and backend state transitions must align.

---

### Approval Control
- Current Implementation = Editing after approval not properly controlled  
- Required Implementation = Enforce approval gate rules (restrict edits or require re-approval)  

Approved records can still be edited without restriction, which undermines the integrity of the approval system. This revision requires enforcing approval gates where edits are either completely restricted or automatically trigger a re-approval process. Backend checks and UI restrictions must be synchronized.

---

## Core Architecture

### Access Control
- Current Implementation = Receptionist can edit Branch Profile despite restrictions  
- Required Implementation = Restrict edit permissions based on role  

Sensitive configuration such as Branch Profile should not be editable by unauthorized roles like Receptionists. The RBAC system must be updated to restrict access to authorized roles only (e.g., Admin or Manager). Both backend authorization and frontend UI access must be aligned.

---

## Customer Management Module

### Notifications
- Current Implementation = Cannot test SMS/email notifications using sample data  
- Required Implementation = Integrate testable notification environment or mock service  

Notification features cannot be validated due to lack of a testing mechanism. This revision requires integrating a mock SMS/email service or sandbox environment that allows developers and testers to simulate message delivery without sending real messages.

---

### Reminders
- Current Implementation = Missing time field and message templates  
- Required Implementation = Add time field and predefined message templates  

The reminders feature lacks essential components such as scheduling time and reusable message templates. This revision requires extending the reminder model to include time fields and implementing a template system for standardized messaging.

---

### Delivery
- Current Implementation = Cannot validate reminder sending and scheduling  
- Required Implementation = Enable full reminder delivery testing capability  

Reminder delivery cannot be verified end-to-end. This revision requires ensuring that scheduling logic, queue processing, and delivery mechanisms are fully testable. Logging and status tracking should also be added for visibility.

---

## Reporting & Analytics

### Usability
- Current Implementation = Missing sample/default text when creating reports  
- Required Implementation = Add placeholder/sample text for report fields  

Users lack guidance when creating reports due to empty input fields. This revision requires adding placeholder text or sample values to guide users in filling out report parameters correctly.

---

## End-to-End (E2E) Workflow

### Integration
- Current Implementation = Inventory deduction cannot be completed due to access issues  
- Required Implementation = Fix RBAC and ensure inventory updates post-transaction  

The full workflow from order completion to inventory deduction is currently broken due to permission issues. This revision requires aligning RBAC permissions and ensuring that inventory updates are triggered reliably after transactions.

---

### Order Completion
- Current Implementation = Receptionist cannot complete order due to missing permissions (e.g., payment)  
- Required Implementation = Grant necessary permissions for order completion  

Receptionists are unable to complete orders due to missing permissions such as payment processing. This blocks the entire workflow. The revision requires granting the necessary permissions and ensuring that order completion logic is accessible to appropriate roles without compromising security.