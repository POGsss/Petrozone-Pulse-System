# Authentication — Testing Guide & Process Documentation

---

## How Authentication Works in the System

### Overview

The Authentication module handles user login, logout, password recovery, and account security. It uses Supabase Auth under the hood with a custom profile layer (`user_profiles`) for role and branch assignments. The system enforces account lockout after repeated failed logins and supports forced password changes for newly created accounts.

### Key Business Rules

1. **Email + Password Login:** Users authenticate with their email and password. There are no social logins or SSO — credentials are managed by admins through User Management.
2. **Account Lockout:** After **5 consecutive failed login attempts**, the account is locked for **15 minutes**. The lockout counter resets on successful login or after the lock period expires.
3. **Forced Password Change:** When an admin creates a user account or resets their password, the `must_change_password` flag is set. The user will see a persistent modal prompting them to change their password until they do so.
4. **Password Complexity:** All passwords must meet these requirements:
   - At least 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
5. **Forgot Password:** Sends a reset link via email. The system does **not** reveal whether the email exists — it always shows the same confirmation message.
6. **Reset Password:** Uses a token from the email link. The token is extracted from the URL hash fragment (`#access_token=...&type=recovery`).
7. **Session Persistence:** Access tokens are stored in `localStorage`. On page load, the system checks for an existing token and re-fetches the user profile.

### RBAC (Roles & Permissions)

| Action          | HM  | POC | JS  |  R  |  T  |
| --------------- | :-: | :-: | :-: | :-: | :-: |
| Login           | ✅  | ✅  | ✅  | ✅  | ✅  |
| Logout          | ✅  | ✅  | ✅  | ✅  | ✅  |
| Forgot Password | ✅  | ✅  | ✅  | ✅  | ✅  |
| Reset Password  | ✅  | ✅  | ✅  | ✅  | ✅  |
| Unlock Account  | ✅  | ✅  | ✅  |  —  |  —  |

### API Endpoints

| Method | Endpoint                    | Auth            | Description                  |
| ------ | --------------------------- | --------------- | ---------------------------- |
| `POST` | `/api/auth/login`           | None            | Login with email/password    |
| `POST` | `/api/auth/logout`          | Yes             | Logout                       |
| `POST` | `/api/auth/refresh`         | None            | Refresh access token         |
| `GET`  | `/api/auth/me`              | Yes             | Get current user info        |
| `POST` | `/api/auth/forgot-password` | None            | Request password reset email |
| `POST` | `/api/auth/reset-password`  | None            | Reset password with token    |
| `POST` | `/api/auth/change-password` | Yes             | Change own password          |
| `POST` | `/api/auth/unlock-account`  | Yes (HM/POC/JS) | Unlock a locked account      |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend server is running (`npm run dev` from the `backend/` folder)
- Frontend dev server is running (`npm run dev` from the `frontend/` folder)
- At least one user account exists in the system (created via User Management)
- Access to an email inbox for the test account (for password reset testing)

---

### Test 1 — Successful Login

**Goal:** Verify a valid user can log in and reach the dashboard.

1. Open the application in a browser — the Login page should load
2. Enter a valid **Email Address** and **Password**
3. Click **"Login"**
4. Verify:
   - ✅ Button shows **"Signing in..."** with a spinner while processing
   - ✅ On success, you are redirected to the **Dashboard**
   - ✅ The sidebar displays navigation items based on your role
   - ✅ Your name and role badges appear on the dashboard

---

### Test 2 — Login with Invalid Credentials

**Goal:** Verify proper error handling for wrong email or password.

1. Enter a valid email but a **wrong password**
2. Click **"Login"**
3. Verify:
   - ✅ Error banner appears below the form: `"Invalid credentials. X attempt(s) remaining before account lockout."`
   - ✅ Error toast also appears with the same message
   - ✅ The remaining attempts count decreases with each failed attempt
4. Try logging in with a **non-existent email**
5. Verify:
   - ✅ An appropriate error message is shown (generic — does not reveal whether the email exists)

---

### Test 3 — Account Lockout

**Goal:** Verify the account locks after 5 failed attempts.

1. Enter a valid email and attempt login with a wrong password **5 times** in a row
2. On the 5th failed attempt, verify:
   - ✅ Error message: `"Account locked due to too many failed attempts. Try again in 15 minutes."`
3. Attempt to log in again immediately with the **correct** password
4. Verify:
   - ✅ Login is blocked with: `"Account is locked due to too many failed attempts. Try again in X minute(s)."`
5. After 15 minutes (or have an admin unlock the account), try again with the correct password
6. Verify:
   - ✅ Login succeeds
   - ✅ Failed attempt counter is reset

---

### Test 4 — Deactivated Account Login

**Goal:** Verify deactivated users cannot log in.

1. Have an admin deactivate a user account via User Management
2. Attempt to log in with the deactivated account's credentials
3. Verify:
   - ✅ Error message: `"Account is deactivated. Contact your supervisor."`
   - ✅ Login is blocked even with correct credentials

---

### Test 5 — Password Visibility Toggle

**Goal:** Verify the show/hide password toggle works.

1. On the Login page, type a password in the password field
2. Click the **eye icon** next to the password field
3. Verify:
   - ✅ Password is revealed as plain text
4. Click the eye icon again
5. Verify:
   - ✅ Password is masked again

---

### Test 6 — Forgot Password Flow

**Goal:** Verify the password reset email flow.

1. On the Login page, click **"Recover Password"**
2. Verify:
   - ✅ A modal opens with the title **"Forgot Password"**
3. Enter an email address and click **"Send Reset Link"**
4. Verify:
   - ✅ Button shows **"Sending..."** while processing
   - ✅ Success message appears: `"Check your email"` with text `"If an account exists with {email}, you will receive a password reset link shortly."`
   - ✅ Toast: `"Password reset email sent successfully"`
5. Click **"Back to Login"** to return to the login form
6. Test with a non-existent email — the same success message should appear (no email leak)

**Edge cases to test:**

- Submit with an empty email field → should show HTML validation
- Click **"Cancel"** → modal closes without sending

---

### Test 7 — Reset Password Page

**Goal:** Verify the password reset form works with the email token.

1. Click the reset link from the email received in Test 6
2. Verify:
   - ✅ The Reset Password page loads with two password fields
   - ✅ A hint is displayed: `"Password must be at least 8 characters with uppercase, lowercase, and a number."`
3. Start typing a new password — verify the **real-time requirements checklist** appears:
   - ✅ "At least 8 characters" (green check when met)
   - ✅ "One uppercase letter" (green check when met)
   - ✅ "One lowercase letter" (green check when met)
   - ✅ "One number" (green check when met)
4. Enter a valid new password and a matching confirm password
5. Click **"Reset Password"**
6. Verify:
   - ✅ Success page appears: `"Password Reset!"` with message `"Your password has been successfully reset."`
   - ✅ Toast: `"Password reset successfully"`
   - ✅ Click **"Go to Login"** → redirects to the login page
7. Log in with the new password → should succeed

**Edge cases to test:**

- Password shorter than 8 characters → error: `"Password must be at least 8 characters"`
- Missing uppercase letter → error: `"Password must contain at least one uppercase letter"`
- Missing lowercase letter → error: `"Password must contain at least one lowercase letter"`
- Missing number → error: `"Password must contain at least one number"`
- Passwords don't match → error: `"Passwords do not match"`
- Invalid or expired token → page shows: `"Invalid Reset Link"` with message `"This password reset link is invalid or has expired."`

---

### Test 8 — Forced Password Change Modal

**Goal:** Verify newly created users are prompted to change their temporary password.

1. Have an admin create a new user account with a temporary password (via User Management)
2. Log in with the new account's email and temporary password
3. Verify:
   - ✅ Login succeeds and you reach the dashboard
   - ✅ A modal immediately appears: **"Change Your Password"**
   - ✅ Message: `"For security purposes, you are required to change your temporary password."`
   - ✅ Dismissal note: `"You can dismiss this reminder, but it will appear again until your password is changed."`
4. Click **"Cancel"** to dismiss the modal
5. Navigate to any other page via the sidebar
6. Verify:
   - ✅ The modal reappears when you navigate away from Profile Settings
7. Click **"Change"** → you are taken to **Profile Settings** where you can change your password
8. After changing the password, the modal should no longer appear

---

### Test 9 — Logout

**Goal:** Verify logging out clears the session.

1. While logged in, click the **logout** button (in the sidebar or header)
2. Verify:
   - ✅ You are redirected to the Login page
   - ✅ Refreshing the page does not auto-login (session is cleared)
   - ✅ Navigating to a protected URL (e.g., `/dashboard`) redirects to Login

---

### Test 10 — Session Persistence

**Goal:** Verify the session survives a page refresh.

1. Log in successfully
2. Refresh the browser page (F5 or Ctrl+R)
3. Verify:
   - ✅ You remain logged in (not redirected to Login page)
   - ✅ Your user info and role are still available

---

## Summary Checklist

| Requirement                           | Status |
| ------------------------------------- | ------ |
| Successful Login                      | ⬜     |
| Invalid Credentials Error             | ⬜     |
| Account Lockout (5 attempts / 15 min) | ⬜     |
| Deactivated Account Blocked           | ⬜     |
| Password Show/Hide Toggle             | ⬜     |
| Forgot Password Flow                  | ⬜     |
| Reset Password with Token             | ⬜     |
| Password Complexity Validation        | ⬜     |
| Forced Password Change Modal          | ⬜     |
| Logout Clears Session                 | ⬜     |
| Session Persistence on Refresh        | ⬜     |

