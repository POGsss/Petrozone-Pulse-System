# Profile Settings — Testing Guide & Process Documentation

---

## How Profile Settings Works in the System

### Overview

The Profile Settings page allows any authenticated user to update their personal information (name, email, phone) and change their account password. It is accessible from the sidebar and is not restricted by role. This page is also where users go to fulfill the forced password change requirement after receiving a temporary password.

### Key Business Rules

1. **Full Name is required** — cannot be left empty.
2. **Phone is required** — must be 7–20 digits (allows `+`, `-`, `()`, and spaces).
3. **Email change** — updating the email also updates the Supabase auth record. If the auth update fails, the profile change is reverted.
4. **Password complexity** — new passwords must meet: 8+ characters, 1 uppercase, 1 lowercase, 1 number.
5. **Current password verification** — users must enter their current password to change it. The system verifies it by attempting a sign-in.
6. **Forced password change** — after changing the password, the `must_change_password` flag is cleared and the modal prompt stops appearing.

### RBAC (Roles & Permissions)

| Action          | HM  | POC | JS  |  R  |  T  |
| --------------- | :-: | :-: | :-: | :-: | :-: |
| View Profile    | ✅  | ✅  | ✅  | ✅  | ✅  |
| Update Profile  | ✅  | ✅  | ✅  | ✅  | ✅  |
| Change Password | ✅  | ✅  | ✅  | ✅  | ✅  |

### API Endpoints

| Method | Endpoint                    | Auth | Description         |
| ------ | --------------------------- | ---- | ------------------- |
| `GET`  | `/api/auth/profile`         | Yes  | Get own profile     |
| `PUT`  | `/api/auth/profile`         | Yes  | Update own profile  |
| `POST` | `/api/auth/change-password` | Yes  | Change own password |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as any user

---

### Test 1 — View Profile Information

**Goal:** Verify the profile page loads with current user data.

1. Click **"Profile Settings"** in the sidebar (or navigate via the profile icon)
2. Verify the page displays two side-by-side cards:
   - ✅ **"Profile Information"** card with subtitle `"Update your personal details"`
   - ✅ **"Change Password"** card with subtitle `"Update your account password"`
3. Verify the Profile Information card shows:
   - ✅ **Full Name** — pre-filled with your current name
   - ✅ **Email Address** — pre-filled with your current email
   - ✅ **Phone Number** — pre-filled with your current phone number
4. Verify the Change Password card shows:
   - ✅ **Current Password** — empty
   - ✅ **New Password** — empty
   - ✅ **Confirm New Password** — empty

---

### Test 2 — Update Profile Information

**Goal:** Verify profile details can be updated.

1. Change the **Full Name** to a new value (e.g., `"Juan Dela Cruz"`)
2. Change the **Phone Number** to a new value (e.g., `"+63 912 345 6789"`)
3. Click **"Save Changes"**
4. Verify:
   - ✅ Button shows **"Saving..."** while processing
   - ✅ Inline success message: `"Profile updated successfully"`
   - ✅ Toast: `"Profile updated successfully"`
   - ✅ The sidebar/header updates to show your new name

**Edge cases to test:**

- Clear the Full Name and save → error: `"Full name is required"`
- Clear the Phone and save → error: `"Phone number is required"`
- Enter a phone with fewer than 7 digits → error: `"Phone number must be between 7 and 20 digits"`
- Enter a phone with more than 20 digits → error: `"Phone number must be between 7 and 20 digits"`

---

### Test 3 — Update Email Address

**Goal:** Verify email can be changed and syncs with the auth system.

1. Change the **Email Address** to a new valid email
2. Click **"Save Changes"**
3. Verify:
   - ✅ Profile updates successfully
   - ✅ The new email is reflected in the profile
4. Log out and log back in using the **new email** address
5. Verify:
   - ✅ Login works with the new email

---

### Test 4 — Change Password Successfully

**Goal:** Verify the password change flow works end-to-end.

1. In the **Change Password** card, enter:
   - **Current Password:** your current password
   - **New Password:** a valid new password (e.g., `"NewPass123"`)
   - **Confirm New Password:** same as above
2. Verify the **real-time requirements checklist** appears as you type the new password:
   - ✅ "At least 8 characters" — green check when met
   - ✅ "One uppercase letter" — green check when met
   - ✅ "One lowercase letter" — green check when met
   - ✅ "One number" — green check when met
3. Click **"Change Password"**
4. Verify:
   - ✅ Button shows **"Changing..."** while processing
   - ✅ Inline success: `"Password changed successfully"`
   - ✅ Toast: `"Password changed successfully"`
   - ✅ All password fields are cleared
5. Log out and log back in with the **new password**
6. Verify:
   - ✅ Login succeeds with the new password

---

### Test 5 — Password Validation Errors

**Goal:** Verify all password complexity rules are enforced.

1. Leave Current Password empty and try to submit → error: `"Current password is required"`
2. Leave New Password empty → error: `"New password is required"`
3. Enter a new password shorter than 8 characters → error: `"New password must be at least 8 characters"`
4. Enter a password without uppercase → error: `"Password must contain at least one uppercase letter"`
5. Enter a password without lowercase → error: `"Password must contain at least one lowercase letter"`
6. Enter a password without numbers → error: `"Password must contain at least one number"`
7. Enter mismatched New Password and Confirm Password → error: `"Passwords do not match"`

---

### Test 6 — Wrong Current Password

**Goal:** Verify the system rejects an incorrect current password.

1. Enter an **incorrect** current password
2. Enter a valid new password and confirmation
3. Click **"Change Password"**
4. Verify:
   - ✅ Error: `"Current password is incorrect"`
   - ✅ Password is not changed

---

### Test 7 — Password Show/Hide Toggles

**Goal:** Verify each password field has an independent show/hide toggle.

1. Type into all three password fields
2. Click the eye icon on each field individually
3. Verify:
   - ✅ Each field can be toggled independently
   - ✅ Clicking the eye reveals the password as plain text
   - ✅ Clicking again masks it

---

### Test 8 — Phone Number Sanitization

**Goal:** Verify special characters in phone numbers are handled.

1. Try entering letters in the phone field (e.g., `"abc"`)
2. Verify:
   - ✅ Letters are stripped — only numbers, `+`, `-`, `(`, `)`, and spaces are kept
3. Enter a valid phone number with formatting: `"+63 (912) 345-6789"`
4. Verify:
   - ✅ The phone number is accepted and saved correctly

---

### Test 9 — Forced Password Change Dismissal

**Goal:** Verify the forced password change modal is cleared after changing the password.

1. Log in as a user who has the `must_change_password` flag set (e.g., a newly created user)
2. Verify the modal appears: **"Change Your Password"**
3. Click **"Change"** → navigate to Profile Settings
4. Change the password successfully
5. Navigate to another page (e.g., Dashboard)
6. Verify:
   - ✅ The forced password change modal **no longer** appears
   - ✅ The user can navigate freely

---

## Summary Checklist

| Requirement                       | Status |
| --------------------------------- | ------ |
| View Profile Information          | ⬜     |
| Update Full Name                  | ⬜     |
| Update Phone Number               | ⬜     |
| Update Email Address              | ⬜     |
| Phone Number Sanitization         | ⬜     |
| Profile Validation (empty fields) | ⬜     |
| Change Password Successfully      | ⬜     |
| Password Complexity Validation    | ⬜     |
| Wrong Current Password Rejected   | ⬜     |
| Password Show/Hide Toggles        | ⬜     |
| Real-Time Requirements Checklist  | ⬜     |
| Forced Password Change Cleared    | ⬜     |
