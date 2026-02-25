# Sprint 1 – Module-by-Module Copilot Prompts

---

## Module 1: Branch Management

```text
You are implementing the Branch Management module for Sprint 1.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC1-UC4)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Create, view, update, and delete branch profiles
- Enforce mandatory fields at frontend, backend, and database level
- Enforce branch isolation via Supabase RLS
- Record audit logs for all mutations

Mandatory fields:
- name
- code (unique, auto-uppercased)
- address
- phone
- email

Rules:
- Only HM, POC, JS, R can create branches
- All authenticated users can view branches (HM sees all; others see assigned branches via RLS)
- Only HM, POC, JS, R can update branches
- Only HM, POC, JS, R can delete branches
- Branch code must be unique and is automatically uppercased
- Duplicate code check enforced on both create and update
- Conditional delete: hard delete if no users are assigned; soft delete (sets is_active = false) if users exist
- Branches are always scoped by assignment
- All CUD operations are audit-logged via log_admin_action RPC
- Failed operations are audit-logged via logFailedAction helper

User Stories:
As a HM, POC, JS, or R, I want to create a branch profile so the branch can be registered in the system.
As a HM, POC, JS, or R, I want to view branch profile details for reference and management.
As a HM, POC, JS, or R, I want to update branch profile information to keep records current.
As a HM, POC, JS, or R, I want to delete a branch profile to remove inactive branches.

Tasks:
1. Design branches schema with code uniqueness constraint
2. Implement backend CRUD APIs with validation and duplicate checking
3. Apply Supabase RLS policies for branch isolation
4. Build Branch Management page with search and status filter
5. Add Branch Management item in sidebar for HM, POC, JS, R
6. Maintain consistent styling of components and use available modal components for all actions

Do not implement business workflows, service tracking, or customer linking.
```

---

## Module 2: Authentication & Account Management

```text
You are implementing the Authentication & Account Management module for Sprint 1.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC5-UC9)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Log in and log out of the system
- View and update own profile (full_name, email, phone)
- Forgot password with email recovery link
- Reset password via recovery token
- Change password with complexity validation
- Account lockout after failed login attempts
- Must-change-password enforcement on first login or admin reset

Mandatory fields:
- Login: email, password
- Profile update: full_name, phone (7-20 digits)
- Change password: currentPassword, newPassword, confirmPassword

Password complexity rules:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

Account lockout rules:
- 5 failed login attempts triggers a 15-minute lockout
- Counter resets on successful login or when lock expires
- Remaining attempts shown in error messages
- Locked accounts return HTTP 423
- Deactivated accounts return HTTP 403

Rules:
- All roles (HM, POC, JS, R, T) can log in, log out, view account, and change password
- Forgot password is publicly accessible and always returns success (security measure)
- Reset password uses Supabase email recovery with access token
- must_change_password flag is set on user creation and admin password reset; cleared when user changes password
- Email changes in profile also update the auth.users table
- Login/logout events are logged via log_auth_event RPC
- Password changes and profile updates are logged via log_admin_action RPC
- Disposable Supabase clients are used for auth operations to avoid corrupting the singleton

User Stories:
As a HM, POC, JS, R, or T, I want to log into the system to access my assigned features.
As a HM, POC, JS, R, or T, I want to log out to securely end my session.
As a HM, POC, JS, R, or T, I want to view my account details for verification.
As a HM, POC, JS, R, or T, I want to reset my password if I forget it.
As a HM, POC, JS, R, or T, I want to change my password to maintain account security.

Tasks:
1. Integrate Supabase Auth for email/password login and logout
2. Implement password complexity validation
3. Implement account lockout mechanism (5 attempts, 15-minute lock)
4. Implement forgot-password and reset-password flows via Supabase recovery
5. Build Login page with forgot-password modal
6. Build Reset Password page with token validation
7. Build Profile Settings page with profile edit and password change panels
8. Enforce must_change_password redirect on first login
9. Audit log all authentication events

Do not implement user creation here; that is handled in User Account Management.
```

---

## Module 3: User Account Management

```text
You are implementing the User Account Management module for Sprint 1.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC10-UC13)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- Create, view, update, and delete user accounts
- Assign and manage roles (multiple roles per user)
- Assign and manage branch access (multiple branches per user)
- Activate and deactivate user accounts
- Admin-initiated password reset
- Unlock locked accounts
- Role hierarchy enforcement

Role templates (with hierarchy levels):
- HM (Higher Management) - Level 5
- POC (POC Supervisor) - Level 4
- JS (Junior Supervisor) - Level 3
- R (Receptionist) - Level 2
- T (Technician) - Level 1

Mandatory fields:
- email
- password (complexity-validated)
- full_name
- phone
- roles (at least 1 required)
- branch_ids (at least 1 required)

Rules:
- Only HM, POC, JS can create, view, update, and delete users
- Role hierarchy enforcement: users can only assign or edit roles at or below their own level
- Users with higher role levels than the current user are read-only
- Cannot deactivate or delete your own account
- Cannot reset your own password via the admin endpoint
- Admin password reset sets must_change_password = true
- New users are created with must_change_password = true and email_confirm = true
- Role updates use atomic update_user_roles RPC with permission check
- Branch updates use atomic update_user_branches RPC with permission check
- First assigned branch is automatically set as is_primary
- Hard delete: deletes the Supabase Auth user, which cascades to user_profiles, user_roles, user_branch_assignments
- Status filter includes "Locked" for accounts with active locked_until
- Unlock button is visible for locked accounts in the edit modal
- All actions are audit-logged

User Stories:
As a HM, POC, or JS, I want to create user accounts to grant system access.
As a HM, POC, or JS, I want to view user accounts for oversight and management.
As a HM, POC, or JS, I want to update user account details to reflect role or status changes.
As a HM, POC, or JS, I want to delete user accounts to revoke access.

Tasks:
1. Define user_roles and user_branch_assignments schemas with hierarchy levels
2. Implement backend CRUD APIs with role-level hierarchy validation
3. Implement atomic role and branch assignment RPCs with hierarchy checks
4. Implement activate/deactivate and admin password reset endpoints
5. Implement account unlock for locked users
6. Apply Supabase RLS policies
7. Build User Management page with table layout and pagination (10 items per page)
8. Add User Management item in sidebar for HM, POC, JS
9. Audit log all user management actions

Do not implement user self-registration or business workflows.
```

---

## Module 4: System Settings

```text
You are implementing the System Settings module for Sprint 1.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- View system-wide UI and theme settings
- Update system settings (HM only)
- Reset system settings to defaults
- Settings apply globally and are accessible on the login page for consistent theming

Settings fields:
- dark_mode (boolean — dark/light theme toggle)
- primary_color (string — accent color hex code from preset options)
- sidebar_collapsed (boolean — sidebar default state)
- font_size (enum: "small" | "medium" | "large")

Rules:
- Only HM can update system settings
- Settings are publicly accessible for viewing (no auth required) so the login page displays the correct theme
- Singleton row pattern — a single settings row is fetched and updated
- Draft/save pattern: changes are local on the frontend until "Save" is clicked
- "Reset to defaults" button restores DEFAULT_SETTINGS
- Settings updates are audit-logged
- System Settings page is accessible in the sidebar for HM only

User Stories:
As a HM, I want to view system settings to understand the current configuration.
As a HM, I want to update system settings to customize the application appearance.
As a HM, I want to reset system settings to restore the default configuration.

Tasks:
1. Design system_settings schema as a singleton table
2. Implement GET (public) and PUT (HM only) APIs
3. Build System Settings page with theme preview and color presets
4. Implement draft/save pattern for settings changes
5. Implement reset to defaults functionality
6. Add System Settings item in sidebar for HM only
7. Audit log settings changes

Do not implement dynamic mandatory field configuration or per-user preferences.
```

---

## Module 5: Audit Logging

```text
You are implementing the Audit Logging module for Sprint 1.

Authoritative references:
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC18)
- docs/requirements/FunctionalAndNonFunctionalRequirements.docx

Scope:
- View audit logs with filtering and pagination
- View audit log details with old and new values
- View audit statistics and summaries
- View entity-specific and user-specific audit histories
- Record all system mutations and auth events automatically

Audit log fields:
- id, user_id, action, entity_type, entity_id
- old_values (JSON), new_values (JSON)
- ip_address, user_agent
- branch_id, status, created_at

Action types:
- LOGIN, LOGOUT, CREATE, UPDATE, DELETE

Status values:
- SUCCESS, FAILED

Rules:
- Only HM and POC can view audit logs
- HM sees all audit logs across all branches
- POC sees only logs for their assigned branches
- Audit logs are append-only and immutable - they cannot be modified or deleted
- Pagination: 20 items per page on the frontend
- Client-side search across action, entity_type, user name, and user email
- Date range filter (applied on button click)
- Stats endpoint returns counts for the last N days (default 30)
- Detail modal shows old_values and new_values as formatted JSON

How audit entries are created:
- Auth events (login/logout): via log_auth_event RPC
- CUD operations (create/update/delete): via log_admin_action RPC
- Failed operations: via logFailedAction() helper with status = 'FAILED'

User Stories:
As a HM or POC, I want system actions to be logged for traceability and compliance.

Tasks:
1. Design audit_logs schema with proper indexes
2. Implement log_auth_event and log_admin_action RPCs
3. Implement logFailedAction helper for error tracking
4. Implement list, entity-specific, user-specific, and stats query APIs
5. Apply RLS policies: HM sees all, POC sees own branches
6. Build Audit Logs page with filters, pagination, and detail modal
7. Add Audit Logs item in sidebar for HM and POC

Audit logs must never be modified or deleted by any user.
```

---

## Module 6: Sprint 1 End-to-End Testing

```text
You are validating Sprint 1 modules end-to-end.

Scope:
- Branch CRUD and isolation
- Authentication flows (login, logout, forgot/reset password, account lockout)
- User account CRUD with role hierarchy
- System settings configuration
- Audit log recording and viewing

Tasks:
1. Verify RBAC enforcement for all module endpoints
2. Verify branch isolation (HM sees all, others see only assigned)
3. Verify mandatory field enforcement at frontend and backend levels
4. Verify password complexity rules and account lockout behavior
5. Verify must_change_password flow on first login and after admin reset
6. Verify audit log entries for all CUD and auth events
7. Verify conditional delete for branches (hard if no users, soft if users exist)
8. Verify hard delete cascade for user accounts
9. Verify role hierarchy prevents unauthorized role assignments

Do not add new features. Fix only Sprint 1 scope issues.
```

---
