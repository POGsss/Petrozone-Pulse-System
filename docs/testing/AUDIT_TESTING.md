# Audit Logs — Testing Guide & Process Documentation

---

## How Audit Logs Works in the System

### Overview

The Audit Logs page provides a centralized view of all system activity — logins, logouts, record creation, updates, and deletions. It is a read-only module designed for transparency and accountability. Every user action that modifies data is recorded automatically through database triggers and backend logging. Audit logs cannot be created, edited, or deleted by users.

### Key Business Rules

1. **Read-only** — users can view and filter audit logs but cannot create, modify, or delete them.
2. **Automatic logging** — audit entries are created automatically by database triggers (for INSERT operations) and backend `log_admin_action` RPC calls (for UPDATE/DELETE operations).
3. **Branch scoping** — HM sees all logs globally. POC sees only logs for their assigned branches.
4. **Stats period** — the stats cards show data for the last 30 days by default on page load.
5. **Server-side pagination** — 20 entries per page, fetched from the server.
6. **Client-side search** — the search bar filters the currently loaded page of results.

### RBAC (Roles & Permissions)

| Action              | HM  | POC | JS  |  R  |  T  |
| ------------------- | :-: | :-: | :-: | :-: | :-: |
| View Audit Logs     | ✅  | ✅  |  —  |  —  |  —  |
| View Audit Stats    | ✅  | ✅  |  —  |  —  |  —  |
| View Entity History | ✅  |  —  |  —  |  —  |  —  |
| View User History   | ✅  |  —  |  —  |  —  |  —  |

### API Endpoints

| Method | Endpoint                                  | Auth    | Description                           |
| ------ | ----------------------------------------- | ------- | ------------------------------------- |
| `GET`  | `/api/audit`                              | HM, POC | List audit logs (paginated, filtered) |
| `GET`  | `/api/audit/stats`                        | HM, POC | Audit statistics (last N days)        |
| `GET`  | `/api/audit/entity/:entityType/:entityId` | HM only | Audit history for a specific entity   |
| `GET`  | `/api/audit/user/:userId`                 | HM only | Audit history for a specific user     |

### Query Parameters (GET /api/audit)

| Parameter     | Type   | Description                                              |
| ------------- | ------ | -------------------------------------------------------- |
| `action`      | string | Filter by action (LOGIN, LOGOUT, CREATE, UPDATE, DELETE) |
| `entity_type` | string | Filter by entity type                                    |
| `start_date`  | string | Filter from date                                         |
| `end_date`    | string | Filter to date                                           |
| `limit`       | string | Results per page (default 50)                            |
| `offset`      | string | Pagination offset                                        |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Backend and frontend servers are running
- You are logged in as **HM** or **POC**
- Some system activity has already occurred (logins, record creation/updates/deletes)

---

### Test 1 — Access Control

**Goal:** Verify only HM and POC can access Audit Logs.

1. Log in as **HM** → verify **"Audit Logs"** appears in the sidebar
2. Click **"Audit Logs"** → the page loads with log entries
3. Log in as **POC** → verify **"Audit Logs"** appears in the sidebar
4. Log in as **JS** → verify **"Audit Logs"** does **not** appear
5. Repeat for **R** and **T** → neither should see "Audit Logs"

---

### Test 2 — View Stats Cards

**Goal:** Verify the summary statistics display correctly.

1. Navigate to **Audit Logs**
2. Verify three stats cards at the top:
   - ✅ **Total Events** — total count of events (last 30 days)
   - ✅ **Successful** — count of successful events
   - ✅ **Failed** — count of failed events
3. Verify the numbers are reasonable (e.g., Total = Successful + Failed)

---

### Test 3 — View Audit Log Table

**Goal:** Verify the log table displays entries correctly.

1. Verify the table has these columns:
   - ✅ **Date & Time** — formatted as `"MMM DD, YYYY, HH:MM AM/PM"`
   - ✅ **Action** — badge showing LOGIN, LOGOUT, CREATE, UPDATE, or DELETE
   - ✅ **Status** — badge showing "SUCCESS" (green) or "FAILED" (red)
   - ✅ **Entity** — entity type (e.g., CUSTOMER, VEHICLE) or "—"
   - ✅ **User** — full name or email, or "—"
2. Verify action badges have appropriate colors:
   - ✅ LOGIN/LOGOUT → primary color
   - ✅ CREATE → green (positive)
   - ✅ UPDATE/DELETE → red (negative)

---

### Test 4 — View Audit Log Details

**Goal:** Verify clicking a log entry shows full details.

1. Click on any row in the audit log table
2. Verify the **"Audit Log Details"** modal opens with sections:
   - ✅ **Event Information** — Action, Entity Type, Entity ID
   - ✅ **User & Branch** — User name/email, Branch name and code
   - ✅ **Changes** (if applicable) — Old Values and New Values shown as formatted JSON
   - ✅ **Additional Information** — Status, Timestamp

---

### Test 5 — Search Logs

**Goal:** Verify client-side search works.

1. Type a search term in the search bar (e.g., a user's name or `"CREATE"`)
2. Verify:
   - ✅ The table filters to show only matching entries
   - ✅ Search matches against: action, entity type, user name, user email
3. Clear the search → all entries reappear

---

### Test 6 — Filter by Action

**Goal:** Verify the action dropdown filter works.

1. Select **"Login"** from the Action dropdown
2. Verify:
   - ✅ Only LOGIN entries are displayed
3. Select **"Create"** → only CREATE entries shown
4. Select **"All Actions"** → all entries shown again

---

### Test 7 — Filter by Date Range

**Goal:** Verify the date range filter works.

1. Click the **Filters** toggle to expand advanced filters
2. Set a **Start Date** (e.g., yesterday)
3. Set an **End Date** (e.g., today)
4. Click **"Apply"**
5. Verify:
   - ✅ Only entries within the date range are shown
6. Click **"Reset"** → date filters are cleared, all entries shown

---

### Test 8 — Pagination

**Goal:** Verify server-side pagination works.

1. Verify the pagination bar shows: `"{start}-{end} of {total} logs"`
2. If there are more than 20 entries, click **Next** (→)
3. Verify:
   - ✅ The next page of entries loads
   - ✅ The page indicator updates
4. Click **Previous** (←) → returns to the first page

---

### Test 9 — Refresh

**Goal:** Verify the refresh button reloads data.

1. Click the **Refresh** button (circular arrow icon)
2. Verify:
   - ✅ The table reloads with fresh data from the server
   - ✅ If new activity occurred, it appears in the refreshed results

---

### Test 10 — Branch Scoping (POC vs HM)

**Goal:** Verify POC only sees logs for their branches.

1. Log in as **HM** → navigate to Audit Logs
2. Verify:
   - ✅ Logs from all branches are visible
3. Log in as **POC** (assigned to Branch A only) → navigate to Audit Logs
4. Verify:
   - ✅ Only logs related to Branch A are visible
   - ✅ Logs from Branch B are **not** shown

---

### Test 11 — Verify Audit Entries Are Created

**Goal:** Verify that actions across different modules create audit entries.

1. Perform the following actions and then check Audit Logs for each:
   - ✅ **Login** → audit entry with action `LOGIN`
   - ✅ **Logout** → audit entry with action `LOGOUT`
   - ✅ **Create a customer** → audit entry with action `CREATE`, entity `CUSTOMER`
   - ✅ **Update a vehicle** → audit entry with action `UPDATE`, entity `VEHICLE`
   - ✅ **Delete a catalog item** → audit entry with action `DELETE` or `UPDATE` (if soft-deleted)
   - ✅ **Approve a job order** → audit entry with action `UPDATE`, entity `JOB_ORDER`
   - ✅ **Receive a purchase order** → audit entry with action `RECEIVE`, entity `PURCHASE_ORDER`

---

### Test 12 — Empty State

**Goal:** Verify the empty state when no logs match.

1. Apply a filter combination that matches no entries (e.g., action = "Delete" + a date range with no activity)
2. Verify:
   - ✅ Empty state message: `"No audit logs found."`

---

## Summary Checklist

| Requirement                           | Status |
| ------------------------------------- | ------ |
| HM Can Access Audit Logs              | ⬜     |
| POC Can Access Audit Logs             | ⬜     |
| JS/R/T Cannot Access                  | ⬜     |
| Stats Cards Display                   | ⬜     |
| Table Columns & Formatting            | ⬜     |
| View Log Detail Modal                 | ⬜     |
| Client-Side Search                    | ⬜     |
| Filter by Action                      | ⬜     |
| Filter by Date Range                  | ⬜     |
| Pagination (20 per page)              | ⬜     |
| Refresh Button                        | ⬜     |
| Branch Scoping (HM vs POC)            | ⬜     |
| Audit Entries Created for All Modules | ⬜     |
| Empty State                           | ⬜     |
