# System Settings — Testing Guide & Process Documentation

---

## How System Settings Works in the System

### Overview

The System Settings page provides system-wide UI/theme configuration. It controls dark mode, primary color, sidebar behavior, and font scaling. Settings apply globally to all users and are fetched on every page load (including the Login page) so the theme is consistent pre- and post-login. Only Higher Management (HM) can modify settings.

### Key Business Rules

1. **HM-only access** — only users with the Higher Management role can view and modify system settings. Other roles do not see the "Settings" item in the sidebar.
2. **Global effect** — changes apply to all users across the entire system.
3. **Draft pattern** — changes are held locally until the user clicks **"Save"**. This prevents partial saves.
4. **Public read** — the GET endpoint has no authentication requirement so the login page can apply the theme.
5. **Reset to defaults** — a Reset button restores all settings to their factory defaults.
6. **Singleton row** — there is only one settings row in the `system_settings` table.

### Settings Controls

| Setting           | Type              | Options                                     | Description                                               |
| ----------------- | ----------------- | ------------------------------------------- | --------------------------------------------------------- |
| Dark Mode         | Toggle switch     | On / Off                                    | Switches between dark and light theme                     |
| Primary Color     | Color preset grid | 12 color presets                            | 3×4 grid of named color swatches                          |
| Sidebar Collapsed | Toggle switch     | On / Off                                    | Whether sidebar starts collapsed (icons only) or expanded |
| Font / UI Size    | 3-option selector | Small (14px) / Medium (16px) / Large (18px) | Base font and element sizing                              |

### RBAC (Roles & Permissions)

| Action              | HM  | POC | JS  |  R  |  T  |
| ------------------- | :-: | :-: | :-: | :-: | :-: |
| View Settings Page  | ✅  |  —  |  —  |  —  |  —  |
| Modify Settings     | ✅  |  —  |  —  |  —  |  —  |
| Read Settings (API) | ✅  | ✅  | ✅  | ✅  | ✅  |

### API Endpoints

| Method | Endpoint        | Auth          | Description                   |
| ------ | --------------- | ------------- | ----------------------------- |
| `GET`  | `/api/settings` | None (public) | Fetch current system settings |
| `PUT`  | `/api/settings` | Yes (HM only) | Update system settings        |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM** (Higher Management)

---

### Test 1 — Access Control

**Goal:** Verify only HM can see and access System Settings.

1. Log in as **HM** → verify **"Settings"** appears in the sidebar
2. Click **"Settings"** → the System Settings page loads
3. Log out and log in as **POC** → verify **"Settings"** does **not** appear in the sidebar
4. Repeat for **JS**, **R**, and **T** roles → none should see "Settings"

---

### Test 2 — View Current Settings

**Goal:** Verify all settings controls load with current values.

1. Navigate to **Settings** as HM
2. Verify the page title: **"System Settings"** with subtitle **"Customize the look and feel of the system"**
3. Verify the following controls are visible:
   - ✅ **Dark Mode** toggle — shows current state (`"Dark theme is selected"` or `"Light theme is selected"`)
   - ✅ **Primary Color** — grid of color swatches with one highlighted
   - ✅ **Sidebar Collapsed** toggle — shows current state
   - ✅ **Font / UI Size** — 3 buttons (Small / Medium / Large) with one active

---

### Test 3 — Change Dark Mode

**Goal:** Verify toggling dark mode works.

1. Toggle the **Dark Mode** switch
2. Verify:
   - ✅ The label updates to reflect the new state
   - ✅ The **Save** button becomes enabled (changes detected)
   - ✅ The page does NOT change visually yet (draft pattern)
3. Click **"Save"**
4. Verify:
   - ✅ Button shows **"Saving..."** then **"Saved"** briefly
   - ✅ Toast: `"Settings have been updated successfully."`
   - ✅ The entire UI switches to the new theme (dark ↔ light)

---

### Test 4 — Change Primary Color

**Goal:** Verify changing the primary color updates the theme.

1. Click a different color swatch in the **Primary Color** grid
2. Verify the swatch gets a selection indicator (ring/border)
3. Click **"Save"**
4. Verify:
   - ✅ Toast: `"Settings have been updated successfully."`
   - ✅ Buttons, badges, and UI accents change to the new primary color
5. Log out and check the Login page
6. Verify:
   - ✅ The Login page also uses the new primary color

---

### Test 5 — Change Sidebar Collapsed Default

**Goal:** Verify sidebar starts collapsed or expanded based on setting.

1. Toggle the **Sidebar Collapsed by Default** switch
2. Click **"Save"**
3. Refresh the page (F5)
4. Verify:
   - ✅ If set to collapsed: sidebar starts in collapsed mode (icons only)
   - ✅ If set to expanded: sidebar starts in expanded mode (full labels)

---

### Test 6 — Change Font / UI Size

**Goal:** Verify font size changes affect the entire UI.

1. Click **"Small"** (14px) in the Font / UI Size selector
2. Click **"Save"** → verify text and elements shrink
3. Click **"Large"** (18px) → Save → verify text and elements grow
4. Click **"Medium"** (16px) → Save → verify the default size is restored

---

### Test 7 — Draft Pattern (Unsaved Changes)

**Goal:** Verify changes are only applied on Save.

1. Toggle Dark Mode
2. Change the primary color
3. Do **not** click Save
4. Verify:
   - ✅ The UI has NOT changed yet (dark mode, color still old)
   - ✅ The Save button is enabled
5. Navigate away from the page (e.g., click Dashboard)
6. Come back to Settings → verify:
   - ✅ The draft changes are lost — controls show the last saved values

---

### Test 8 — Reset to Defaults

**Goal:** Verify the Reset button restores factory settings.

1. Change multiple settings (dark mode, color, font size, sidebar)
2. Click **"Save"** to apply them
3. Click **"Reset"**
4. Verify:
   - ✅ Toast: `"System settings have been reset to defaults."`
   - ✅ All settings revert to their default values
   - ✅ The UI immediately reflects the defaults
5. Refresh the page → verify defaults persist

---

### Test 9 — Settings Apply on Login Page

**Goal:** Verify the theme applies even before login.

1. As HM, change the primary color and dark mode setting, then Save
2. Log out
3. Verify:
   - ✅ The Login page shows the updated theme (dark/light mode, primary color)
   - ✅ This confirms the GET `/api/settings` endpoint is public (no auth required)

---

## Summary Checklist

| Requirement                         | Status |
| ----------------------------------- | ------ |
| HM-Only Access                      | ⬜     |
| Other Roles Cannot Access           | ⬜     |
| View Current Settings               | ⬜     |
| Toggle Dark Mode                    | ⬜     |
| Change Primary Color                | ⬜     |
| Change Sidebar Collapsed Default    | ⬜     |
| Change Font / UI Size               | ⬜     |
| Draft Pattern (no save = no change) | ⬜     |
| Save Success Toast                  | ⬜     |
| Reset to Defaults                   | ⬜     |
| Settings Apply on Login Page        | ⬜     |
