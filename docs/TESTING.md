# Testing Documentation – Phase 1

---

## User Authentication Validation
Verify that only valid credentials allow system access.

### Steps
1. Enter valid username and password  
2. Attempt login  

### Expected Result
- User successfully authenticated and redirected to assigned homepage  
- Invalid credentials are rejected with an error message  

---

## Role-Based Access Control Enforcement
Ensure users can only access features permitted by their role.

### Steps
1. Login as Receptionist  
2. Browse and check navigation menu  

### Expected Result
- User can only see features permitted by their role  

---

## Session Timeout Handling
Verify automatic logout after inactivity period.

### Steps
1. Login to the system  
2. Remain idle for configured timeout duration  

### Expected Result
- User session expires  
- User is redirected to login screen  

---

## Concurrent User Load Handling
Ensure system remains stable under expected concurrent users.

### Steps
1. Simulate 50 concurrent logins  
2. Perform basic navigation and transactions  

### Expected Result
- No system crashes  
- Response time degradation ≤ 20%  

---

## Configuration of Mandatory Fields
Validate enforcement of required fields across modules.

### Steps
1. Attempt to save job order without required fields  

### Expected Result
- System prevents saving  
- Mandatory fields are highlighted  

---

## Environment Configuration Validation
Verify correct setup across environments (Dev, Test, Prod).

### Steps
1. Deploy system to test environments  
2. Verify database, API endpoints, and logging  

### Expected Result
- System connects to correct environment resources  
- No cross-environment data leakage  

---

## Error Logging and Monitoring
Ensure system errors are logged correctly.

### Steps
1. Trigger a controlled system error  
2. Check application logs  

### Expected Result
- Error is logged with timestamp, user ID and module name  

---

## User Role Assignment Logic
Validate correct role assignment during user creation/update.

### Steps
1. Create a user with role = “Technician”  
2. Retrieve user role from the system  

### Expected Result
- User role is saved and returned exactly as assigned  
- No default or unintended role is applied  

---

## Password Hashing Verification
Validate that passwords are not stored in plain text.

### Steps
1. Create user with password  
2. Inspect stored password value  

### Expected Result
- Stored value is hashed  
- Plain text password is never persisted  

---

## Login Attempt Lockout Logic
Verify that repeated failed login attempts trigger account lockout.

### Steps
1. Submit incorrect password 5 times  
2. Attempt login again with correct credentials  

### Expected Result
- Account temporarily locked  
- Login blocked until lockout period expires  

---

## Branch Profile Management
Includes Create, View, Update, Delete/Deactivate validations.

### Expected Behaviors
- Authorized roles can manage branch profiles  
- Required fields enforced  
- Updates reflect immediately  
- Inactive branches cannot be assigned  

---

## Logout Enforcement
Validate session termination and restricted page blocking.

### Expected Result
- User redirected to login  
- Restricted pages inaccessible without re-authentication  

---

## Forgot & Change Password
Validate password reset and update functionality.

### Expected Result
- Reset request processed successfully  
- Password updated and old password invalid  

---

## User Management (CRUD + Security)
Validate create, view, update, disable/delete user accounts.

### Expected Result
- Role/branch assignment works correctly  
- Disabled users cannot log in  
- Password only visible during creation (never retrievable)  

---

## Mandatory Field Rules Configuration (If Implemented)
Validate create, view, update, disable rule behavior.

### Expected Result
- Rules apply immediately  
- Enforcement changes reflect on target forms  

---

## Audit Log Validation
Validate recording and access control of audit logs.

### Expected Result
- Key admin actions logged with timestamp, actor, module  
- Authentication events logged  
- Only authorized roles can access audit logs  

---

# Testing Documentation – Phase 2

---

## Vehicle Profile Management
Create, View, Update, Delete/Deactivate validations.

### Expected Result
- Vehicle linked to correct customer  
- Required fields enforced  
- Inactive vehicles not selectable in new transactions  

---

## Services / Products / Packages Management
CRUD validation and usage enforcement.

### Expected Result
- Items created successfully  
- Inactive items not selectable in new Job Orders  
- Historical records preserved  

---

## Pricing Matrix Management
Create, View, Update, Delete validations.

### Expected Result
- Updated pricing applies to new Job Orders  
- Historical Job Orders unaffected (per design)  
- Missing pricing handled gracefully  

---

## Job Order Card Management
End-to-end creation, view, update, cancel validations.

### Expected Result
- Unique Job Order ID generated  
- Customer and vehicle linked  
- Totals calculated accurately  
- Status transitions enforced  

---

## Customer Profile Management
CRUD and linkage validation.

### Expected Result
- Customers selectable in Job Orders  
- Inactive customers blocked from new transactions  
- Historical data preserved  

---

## Third-Party Repairs
Add, View, Update, Delete validations.

### Expected Result
- Repair linked correctly  
- Costs included in totals  
- Totals recalculate on update/remove  

---

## Job Order Lifecycle Validation
Draft → Pending Approval → Approved / Rejected / Cancelled.

### Expected Result
- Status transitions enforced  
- Approval timestamps recorded  
- Blocked actions prevented after cancellation  

---

## Pricing & Recalculation Logic
Auto-compute totals, quantity updates, item removal, pricing updates.

### Expected Result
- Accurate subtotal and total calculations  
- No orphaned charges  
- Performance within acceptable range  

---

## Approval Gate Controls
Validate edit restrictions after approval.

### Expected Result
- Edits blocked OR re-approval required (based on design)  

---

## Performance Testing
Job Order list performance and pricing recalculation performance.

### Expected Result
- Acceptable load time  
- No UI freeze or backend timeout  
- Stable under large dataset  

---
