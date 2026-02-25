# User Management — Testing Guide & Process Documentation

---

## How User Management Works in the System

### Overview

The User Management module allows supervisory roles (HM, POC, JS) to create, manage, and remove user accounts. It handles role assignment, branch assignment, account activation/deactivation, password resets, and account unlocking. A role hierarchy system prevents lower-ranked users from editing those above them.

### Role Hierarchy

| Role | Level | Full Name         |
| ---- | ----- | ----------------- |
| HM   | 5     | Higher Management |
| POC  | 4     | POC Supervisor    |
| JS   | 3     | Junior Supervisor |
| R    | 2     | Receptionist      |
| T    | 1     | Technician        |

Users can only **edit, delete, or reset passwords** for users at or below their own role level. For users with a higher role, only a read-only **View** (eye icon) is available.

### Key Business Rules

1. **Role-based editing** — you can only manage users whose highest role level is ≤ your own.
2. **At least one role and one branch** — every user must have at least one role and one branch assigned.
3. **First branch is primary** — the first selected branch is automatically set as the primary branch.
4. **Temporary password** — newly created users have `must_change_password = true`. They are forced to change their password on first login.
5. **Admin password reset** — supervisors can reset another user's password, which sets `must_change_password = true`.
6. **Cannot self-delete or self-deactivate** — users cannot delete or deactivate their own account.
7. **Hard delete** — user deletion is permanent (cascades to profile, roles, and branch assignments via Supabase Admin API).
8. **Account lockout** — locked accounts show a "Locked" status badge and an "Unlock" button in the Edit modal.
9. **Phone validation** — must be 7–20 digits.

### RBAC (Roles & Permissions)

| Action                      | HM  | POC | JS  |  R  |  T  |
| --------------------------- | :-: | :-: | :-: | :-: | :-: |
| View User List              | ✅  | ✅  | ✅  |  —  |  —  |
| Create User                 | ✅  | ✅  | ✅  |  —  |  —  |
| Update User (at/below role) | ✅  | ✅  | ✅  |  —  |  —  |
| Delete User                 | ✅  | ✅  | ✅  |  —  |  —  |
| Reset Password              | ✅  | ✅  | ✅  |  —  |  —  |
| Unlock Account              | ✅  | ✅  | ✅  |  —  |  —  |
| Activate/Deactivate         | ✅  | ✅  | ✅  |  —  |  —  |

### API Endpoints

| Method   | Endpoint                                 | Description                        |
| -------- | ---------------------------------------- | ---------------------------------- |
| `GET`    | `/api/rbac/roles`                        | List available roles               |
| `GET`    | `/api/rbac/users`                        | List all users with roles/branches |
| `POST`   | `/api/rbac/users`                        | Create user                        |
| `PUT`    | `/api/rbac/users/:userId`                | Update user profile                |
| `PUT`    | `/api/rbac/users/:userId/roles`          | Update user roles                  |
| `PUT`    | `/api/rbac/users/:userId/branches`       | Update branch assignments          |
| `PUT`    | `/api/rbac/users/:userId/status`         | Activate/deactivate user           |
| `DELETE` | `/api/rbac/users/:userId`                | Delete user (permanent)            |
| `POST`   | `/api/rbac/users/:userId/reset-password` | Admin password reset               |
| `POST`   | `/api/auth/unlock-account`               | Unlock locked account              |

---

## Sample Data to Populate

Use the **"Add a New User"** button. Create each user below:

| #   | Full Name    | Email               | Password  | Phone            | Roles | Branches    |
| --- | ------------ | ------------------- | --------- | ---------------- | ----- | ----------- |
| 1   | Maria Santos | maria@petrozone.ph  | TempPass1 | +63 917 111 2222 | POC   | MAIN        |
| 2   | Jose Reyes   | jose@petrozone.ph   | TempPass1 | +63 918 333 4444 | JS    | MAIN, NORTH |
| 3   | Ana Garcia   | ana@petrozone.ph    | TempPass1 | +63 919 555 6666 | R     | NORTH       |
| 4   | Carlos Cruz  | carlos@petrozone.ph | TempPass1 | +63 920 777 8888 | T     | SOUTH       |

> **Note:** All users will have `must_change_password = true` and will be prompted to change their password on first login.

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM**, **POC**, or **JS**
- At least one branch exists in the system

---

### Test 1 — View User List

**Goal:** Verify the user table loads correctly with stats.

1. Navigate to **User Management** from the sidebar
2. Verify the **stats cards** at the top:
   - ✅ **All Users** — total count
   - ✅ **Active** — active user count
   - ✅ **Inactive** — inactive user count
3. Verify the table shows columns:
   - ✅ **Name** — full name
   - ✅ **Email** — email address
   - ✅ **Roles** — highest role displayed as a badge
   - ✅ **Branches** — primary branch code as a badge
   - ✅ **Status** — "Active", "Inactive", or "Locked" (with lock icon)
   - ✅ **Actions** — Edit/Delete icons (or View icon for higher-role users)

---

### Test 2 — Create User

**Goal:** Verify a new user can be created with roles and branches.

1. Click **"Add a New User"** → the **"Add New User"** modal opens
2. Fill in the form with Sample Data User #1 (Maria Santos):
   - Full Name: `Maria Santos`
   - Email: `maria@petrozone.ph`
   - Password: `TempPass1`
   - Phone: `+63 917 111 2222`
3. In **Assign Roles**, click the **POC** role button to select it
4. In **Assign to Branches**, click the **MAIN** branch button
5. Click **"Create User"**
6. Verify:
   - ✅ Button shows **"Creating..."** while processing
   - ✅ Toast: `"User created successfully"`
   - ✅ User appears in the table with correct name, email, role, and branch
   - ✅ Status shows **"Active"**
7. Repeat for all 4 sample users

**Edge cases to test:**

- Submit with empty name → HTML validation prevents submission
- Submit with empty email → HTML validation prevents submission
- Submit with password shorter than 8 chars → HTML validation (minLength=8)
- Submit with no roles selected → error: `"Please select at least one role"`
- Submit with no branches selected → error: `"Please assign at least one branch"`
- Submit with empty phone → error: `"Phone number is required"`
- Submit with phone outside 7–20 digits → error: `"Phone number must be between 7 and 20 digits"`
- Verify only roles at/below your level are available (e.g., POC cannot assign HM role)

---

### Test 3 — Search & Filter Users

**Goal:** Verify search and filter capabilities.

1. **Search** by name: type `"Maria"` → only Maria Santos should appear
2. **Search** by email: type `"jose@"` → only Jose Reyes should appear
3. **Filter by Status**: select `"Active"` → only active users shown
4. **Advanced Filters** (click toggle):
   - **Filter by Role**: select `"POC"` → only POC users shown
   - **Filter by Branch**: select `"NORTH"` → only users assigned to NORTH
5. Click **"Apply"** to apply advanced filters
6. Click **"Reset"** to clear all filters
7. Verify pagination: `"{start}-{end} of {total} users"` (10 per page)

---

### Test 4 — View User (Higher Role)

**Goal:** Verify you can only view (not edit) users with higher roles.

1. Log in as **POC** (role level 4)
2. Find an **HM** user (role level 5) in the table
3. Verify:
   - ✅ The Actions column shows a **View** (eye) icon instead of Edit/Delete
4. Click the View icon → the **"User Details"** modal opens
5. Verify:
   - ✅ All fields are disabled (read-only)
   - ✅ Sections: User Information, Roles Assignments, Branch Assignments

---

### Test 5 — Edit User

**Goal:** Verify user details, roles, and branches can be updated.

1. Click the **Edit** (pencil) icon on a user at/below your role level
2. The **"Edit User"** modal opens with pre-filled data
3. Change the **Full Name** to a new value
4. Change the **Phone** to a new value
5. In **Assign Roles**, add or remove a role (click role buttons)
6. In **Assign to Branches**, add or remove a branch
7. Click **"Save Changes"**
8. Verify:
   - ✅ Toast: `"User updated successfully"`
   - ✅ Table reflects the changes
9. Verify the role restriction note: `"You can only assign roles at or below your permission level."`

**Edge cases to test:**

- Remove all roles → error: `"Please select at least one role"`
- Remove all branches → error: `"Please assign at least one branch"`
- Attempt to edit a higher-role user → error: `"You can only view this user (they have a higher role)"`

---

### Test 6 — Activate / Deactivate User

**Goal:** Verify user status can be toggled.

1. Open the Edit modal for a user
2. Toggle the **Active/Inactive** switch to **Inactive**
3. Click **"Save Changes"**
4. Verify:
   - ✅ User status changes to **"Inactive"** in the table
   - ✅ Stats card: Active count decreases, Inactive increases
5. Toggle back to **Active** and save → verify the user is reactivated

**Edge case:**

- Try to deactivate your own account → error: `"Cannot deactivate your own account"`

---

### Test 7 — Reset User Password

**Goal:** Verify admin password reset works.

1. Open the Edit modal for a user
2. In the **Reset Password** section, enter a temp password (e.g., `"NewTemp1"`)
3. Click **"Save Changes"** (the password reset is part of the save)
4. Verify:
   - ✅ Toast: `"Password has been reset for {full_name}. They will be required to change it on next login."`
5. Log in as that user with the new temp password
6. Verify:
   - ✅ Login succeeds
   - ✅ The forced password change modal appears

**Temp password validation:**

- Too short → error: `"Temp password must be at least 8 characters"`
- Missing uppercase → error: `"Temp password must contain an uppercase letter"`
- Missing lowercase → error: `"Temp password must contain a lowercase letter"`
- Missing number → error: `"Temp password must contain a number"`
- Cannot reset your own password → error: `"Cannot reset your own password. Use the profile settings instead."`

---

### Test 8 — Unlock Locked Account

**Goal:** Verify a locked account can be unlocked.

1. Lock a user account by entering the wrong password 5 times (on the Login page)
2. Open the User Management page → verify the user shows **"Locked"** status with a lock icon
3. Click Edit on the locked user
4. Verify the locked account alert:
   - ✅ `"This account is locked."`
   - ✅ `"Due to too many failed login attempts."`
   - ✅ `"Locked until: {datetime}"`
   - ✅ **"Unlock"** button is visible
5. Click **"Unlock"**
6. Verify:
   - ✅ Toast: `"Account unlocked successfully"`
   - ✅ The lock alert disappears
7. Verify the user can now log in normally

---

### Test 9 — Delete User

**Goal:** Verify user deletion is permanent.

1. Click the **Delete** (trash) icon on a user at/below your role level
2. Verify the confirmation modal:
   - ✅ Title: **"Delete User"**
   - ✅ Message: `"Are you sure you want to delete {full_name}?"`
   - ✅ Warning: `"This action cannot be undone. All user data will be permanently removed."`
3. Click **"Delete"**
4. Verify:
   - ✅ Toast: `"User deleted successfully"`
   - ✅ User disappears from the table
   - ✅ Stats cards update (total and active counts decrease)

**Edge cases to test:**

- Try to delete your own account → error: `"Cannot delete your own account"`
- Attempt to delete a higher-role user → Delete icon should not be visible

---

### Test 10 — Pagination

**Goal:** Verify pagination works correctly.

1. Ensure more than 10 users exist
2. Verify the pagination bar: `"{start}-{end} of {total} users"`
3. Click **Next** → next page loads
4. Click **Previous** → goes back

---

### Test 11 — Audit Logging

**Goal:** Verify user operations are logged.

1. Navigate to **Audit Logs**
2. Verify entries exist for:
   - ✅ User creation (action: CREATE)
   - ✅ User update (action: UPDATE)
   - ✅ User deletion (action: DELETE)
   - ✅ Password reset (action: UPDATE)

---

## Summary Checklist

| Requirement                                 | Status |
| ------------------------------------------- | ------ |
| View User List with Stats                   | ⬜     |
| Create User (All Fields + Roles + Branches) | ⬜     |
| Password Complexity on Create               | ⬜     |
| Must Change Password Flag Set               | ⬜     |
| Role Hierarchy Enforcement                  | ⬜     |
| View-Only for Higher-Role Users             | ⬜     |
| Edit User (Name, Phone, Roles, Branches)    | ⬜     |
| Activate / Deactivate User                  | ⬜     |
| Cannot Self-Deactivate                      | ⬜     |
| Reset User Password                         | ⬜     |
| Cannot Self-Reset Password                  | ⬜     |
| Unlock Locked Account                       | ⬜     |
| Delete User (Permanent)                     | ⬜     |
| Cannot Self-Delete                          | ⬜     |
| Search (Name, Email, Phone)                 | ⬜     |
| Filter by Status                            | ⬜     |
| Filter by Role (Advanced)                   | ⬜     |
| Filter by Branch (Advanced)                 | ⬜     |
| Pagination (10 per page)                    | ⬜     |
| Audit Logging                               | ⬜     |
| RBAC Enforcement                            | ⬜     |
