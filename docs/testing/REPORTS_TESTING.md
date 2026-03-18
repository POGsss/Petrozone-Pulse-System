# Reports Module — Testing Guide & Process Documentation

## How Reports Works in the System

The Reports module allows authorized users to create, configure, view, edit, delete, and export reports. Reports pull dynamic data from the system (sales, inventory, job orders, staff performance) based on configurable filters (date range, branch). Reports can be exported as styled **PDF** or **Excel (.xlsx)** files that match the system's current theme color.

### Key Business Rules

1. Reports support four types: **Sales**, **Inventory**, **Job Order**, and **Staff Performance**.
2. Each report is scoped to a **branch** or **all branches**.
3. Reports can have optional **date range filters** (start/end date).
4. Report data is generated dynamically from the database each time it is viewed or exported.
5. PDF and Excel exports are generated **client-side** using the theme's primary color.
6. Deleting a report is **mode-based**:
  - hard delete when no references exist,
  - soft deactivate (`is_deleted = true`) when references exist.
7. All report actions (create, update, delete, export) are **audit-logged**.

### RBAC (Role-Based Access Control)

| Action          | HM | POC | JS | R |
| --------------- | -- | --- | -- | - |
| View reports    | ✅ | ✅  | ✅ | ✅ |
| Create report   | ✅ | ✅  | ✅ | ✅ |
| Edit report     | ✅ | ✅  | ✅ | ✅ |
| Delete report   | ✅ | ✅  | ✅ | ✅ |
| Export (PDF/XLSX)| ✅ | ✅  | ✅ | ✅ |

> **HM** = Head Manager, **POC** = Point of Contact, **JS** = Job Specialist, **R** = Regular

### API Endpoints

| Method | Endpoint                           | Description                          |
| ------ | ---------------------------------- | ------------------------------------ |
| GET    | `/api/reports`                     | List reports with filtering/pagination |
| GET    | `/api/reports/:id/delete-mode`     | Check delete mode (delete/deactivate) |
| GET    | `/api/reports/:id`                 | Get a single report                  |
| POST   | `/api/reports`                     | Create a new report                  |
| PUT    | `/api/reports/:id`                 | Update a report's configuration      |
| DELETE | `/api/reports/:id`                 | Hard delete or soft deactivate based on references |
| POST   | `/api/reports/:id/generate`        | Generate report data dynamically     |
| POST   | `/api/reports/generate-preview`    | Generate preview without saving      |
| GET    | `/api/reports/:id/export/:format`  | Export report as CSV (backend)       |

> **Note:** PDF and Excel exports are now generated client-side. The backend CSV export route is still available but the frontend uses `jspdf` for PDF and `exceljs` for Excel.

### Report Types

| Type               | Value              | Data Source                        |
| ------------------ | ------------------ | ---------------------------------- |
| Sales Report       | `sales`            | Sales/transactions data            |
| Inventory          | `inventory`        | Inventory stock and movements      |
| Job Order          | `job_order`        | Job order records                  |
| Staff Performance  | `staff_performance`| Staff activity and performance     |

---

## Sample Data to Populate

Before testing, ensure the system has some existing data in the relevant modules (sales, inventory, job orders, staff records) and at least 2 active branches.

| # | Report Name               | Type               | Branch       | Date From   | Date To     |
|---|---------------------------|--------------------|--------------|-------------|-------------|
| 1 | Monthly Sales Summary     | Sales Report       | Main Branch  | 2024-01-01  | 2024-01-31  |
| 2 | Q1 Inventory Snapshot     | Inventory          | All Branches |             |             |
| 3 | January Job Orders        | Job Order          | Branch A     | 2024-01-01  | 2024-01-31  |
| 4 | Staff Performance Q1      | Staff Performance  | Main Branch  | 2024-01-01  | 2024-03-31  |
| 5 | Weekly Sales Report       | Sales Report       | Branch B     | 2024-02-01  | 2024-02-07  |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as a user with **HM**, **POC**, **JS**, or **R** role
- At least 2 active branches exist in the system
- Some data exists in sales, inventory, job orders, or staff performance modules

---

### Test 1 — View Reports List (Empty State)

**Goal:** Verify the reports page displays correctly with no reports.

1. Navigate to the **Reports** page
2. Observe the page layout

Verify:
- ✅ Page header shows "Reports" title with "0 reports total" subtitle
- ✅ "New Report" button is visible in the header
- ✅ Empty state message: `No reports found. Click "New Report" to create one.`
- ✅ No search/filter bar is shown when there are 0 reports

---

### Test 2 — Create a New Report

**Goal:** Verify a report can be created with all fields.

1. Click the **"New Report"** button in the page header
2. The "Create New Report" modal opens (medium-sized)
3. Fill in:
   - **Report Name:** "Monthly Sales Summary"
   - **Report Type:** Select "Sales Report"
   - **Branch:** Select "Main Branch"
   - **Date From:** 2024-01-01
   - **Date To:** 2024-01-31
4. Click **"Create Report"**

Verify:
- ✅ Modal displays "Report Configuration" section with name, type, branch fields
- ✅ Modal displays "Date Range Filter" section with from/to date inputs
- ✅ Success toast: "Report created successfully"
- ✅ Modal closes automatically
- ✅ New report appears in the card grid
- ✅ Report count updates in subtitle (e.g., "1 reports total")

---

### Test 3 — Create Report Validation

**Goal:** Verify required field validation.

1. Click **"New Report"**
2. Leave **Report Name** and **Report Type** empty
3. Try to click **"Create Report"**

Verify:
- ✅ The "Create Report" button is disabled when name or type is empty
- ✅ Branch and date fields are optional (can be left empty)

---

### Test 4 — View Report Cards

**Goal:** Verify report cards display correct information.

1. Create several reports (use sample data above)
2. Observe the card grid

Verify:
- ✅ Each card shows the report icon (file icon in primary color)
- ✅ Card title = report name
- ✅ Card subtitle = branch name (or "All Branches")
- ✅ Status badge shows report type with appropriate color
- ✅ Card details show "Generated: [date]" and "By: [user name]"
- ✅ Cards are displayed in a responsive grid layout

---

### Test 5 — Edit a Report

**Goal:** Verify reports can be edited.

1. On a report card, click the **"Edit"** button (pencil icon)
2. The "Edit Report" modal opens pre-filled with the report's data
3. Change the **Report Name** to "Updated Sales Summary"
4. Change the **Branch** to "All Branches"
5. Click **"Save Changes"**

Verify:
- ✅ Edit modal opens with all fields pre-populated correctly
- ✅ All fields are editable (name, type, branch, date from, date to)
- ✅ Success toast: "Report updated successfully"
- ✅ Modal closes automatically
- ✅ Card updates to reflect the new name and branch

---

### Test 6 — View a Report (Report Data Modal)

**Goal:** Verify clicking a report card opens the view modal with generated data.

1. Click on a report card (not on the Edit/Delete buttons)
2. The view modal opens

Verify:
- ✅ Modal title shows the report name
- ✅ "Report Information" section shows:
  - Type and Branch (side by side)
  - Start Date and End Date (side by side)
  - Generated By (full width)
  - All fields are disabled/read-only
- ✅ "Report Preview" section shows:
  - Loading spinner while data is being generated
  - Summary cards in a 3-column grid (if summary data exists)
  - Data table with styled header and alternating row colors
  - Table shows up to 50 rows with "Showing 50 of N records" message if more
- ✅ "Actions" section shows Export Excel and Export PDF buttons (if data exists)

---

### Test 7 — Export as PDF

**Goal:** Verify PDF export generates a styled PDF file.

#### 7a — Export from View Modal
1. Open a report's view modal (click on a card)
2. Wait for data to load
3. Click the **"Export PDF"** button in the Actions section

Verify:
- ✅ A `.pdf` file downloads with the report name as filename
- ✅ PDF has a colored header bar matching the theme's primary color
- ✅ PDF shows "Report Details" section with type, branch, generated by, dates, and summary data
- ✅ PDF has a styled data table with colored header row and alternating rows
- ✅ Page numbers appear in the footer
- ✅ Success toast: "Report exported as PDF"

#### 7b — Export from Card Dropdown
1. On a report card, click the **"More"** (ellipsis) icon
2. A dropdown appears with "Save as PDF" and "Save as Excel" options
3. Click **"Save as PDF"**

Verify:
- ✅ Dropdown closes
- ✅ A `.pdf` file downloads
- ✅ PDF matches the same format as 7a
- ✅ Success toast: "Report exported as PDF"

---

### Test 8 — Export as Excel

**Goal:** Verify Excel export generates a styled .xlsx file.

#### 8a — Export from View Modal
1. Open a report's view modal
2. Wait for data to load
3. Click the **"Export Excel"** button

Verify:
- ✅ A `.xlsx` file downloads
- ✅ Excel has a colored header row matching the theme's primary color
- ✅ Subtitle row shows report type, branch, and date
- ✅ Report details + summary are combined as label/value rows
- ✅ Data table has colored header, alternating row shading, and borders
- ✅ Columns are auto-sized
- ✅ Success toast: "Report exported as XLSX"

#### 8b — Export from Card Dropdown
1. Click the **"More"** icon on a card → click **"Save as Excel"**

Verify:
- ✅ A `.xlsx` file downloads with the same formatting
- ✅ Success toast: "Report exported as XLSX"

---

### Test 9 — Theme Color in Exports

**Goal:** Verify exports dynamically use the current theme primary color.

1. Go to **Settings** and change the primary color (e.g., to Teal or Rose)
2. Navigate back to **Reports**
3. Export a report as **PDF** and as **Excel**

Verify:
- ✅ PDF header bar uses the new primary color
- ✅ PDF table header uses the new primary color
- ✅ Excel header row uses the new primary color
- ✅ Excel table header uses the new primary color

---

### Test 10 — Delete/Deactivate a Report

**Goal:** Verify dynamic delete mode works correctly.

1. On a report card, click the **"Delete"** button (trash icon)
2. A confirmation modal opens and checks mode

Verify:
- ✅ While mode is loading, primary button shows `Checking...`
- ✅ Modal title and primary action adapt by mode:
  - `Delete Report` + `Delete` when no references
  - `Deactivate Report` + `Deactivate` when references exist
- ✅ Clicking "Cancel" closes the modal without deleting
- ✅ Delete mode removes the report row from DB and list
- ✅ Deactivate mode hides the report from active list
- ✅ Success toast matches action (`deleted` or `deactivated`)
- ✅ Report count in subtitle decreases

---

### Test 11 — Search Reports

**Goal:** Verify the search functionality.

1. With multiple reports in the list, type a report name in the search bar
2. Type a report type label (e.g., "Sales")

Verify:
- ✅ Search bar only appears when there are reports (count > 0)
- ✅ Cards filter in real-time as you type
- ✅ Search matches against report name and report type label
- ✅ "No reports match your search or filters." message when no results
- ✅ Clearing the search shows all reports again

---

### Test 12 — Filter by Report Type

**Goal:** Verify the type filter dropdown.

1. Click the **"Type"** filter dropdown
2. Select "Sales Report"

Verify:
- ✅ Only Sales Report cards are shown
- ✅ Selecting "All Types" shows all reports again
- ✅ Filter works in combination with search

---

### Test 13 — Filter by Status (Active/Deactivated)

**Goal:** Verify the status filter supports deactivated reports.

1. Open the **Status** filter
2. Select **Active**
3. Select **Deactivated**
4. Select **All Status**

Verify:
- ✅ Active shows only `is_deleted = false` reports
- ✅ Deactivated shows only `is_deleted = true` reports
- ✅ All Status shows both active and deactivated reports
- ✅ Status filter works in combination with search and type filter

---

### Test 14 — Pagination

**Goal:** Verify pagination works with many reports.

1. Create more than 12 reports (the page size is 12)
2. Observe the pagination controls at the bottom

Verify:
- ✅ First page shows 12 cards
- ✅ Pagination controls appear at the bottom
- ✅ Clicking next/page numbers shows the remaining cards
- ✅ Search and filters reset to page 1

---

### Test 15 — Card Dropdown Behavior

**Goal:** Verify the "More" dropdown closes correctly.

1. Click the **"More"** icon on a card — dropdown opens
2. Click outside the dropdown

Verify:
- ✅ Dropdown closes when clicking outside
- ✅ Only one dropdown can be open at a time (clicking another card's "More" closes the first)
- ✅ Dropdown shows "Save as PDF" and "Save as Excel" options
- ✅ Dropdown buttons show disabled state while exporting

---

### Test 16 — Error Handling

**Goal:** Verify error states are handled gracefully.

1. Simulate a network error (disconnect, etc.)
2. Try to load the Reports page

Verify:
- ✅ Error alert displays with retry button
- ✅ Clicking retry attempts to reload data
- ✅ Create/edit modals show inline error messages on failure
- ✅ Export failures show error toast

---

## Summary Checklist

| Requirement                                   | Status |
| --------------------------------------------- | ------ |
| Reports list with card grid layout            | ⬜     |
| Create report with name, type, branch, dates  | ⬜     |
| Edit report (pre-filled form)                 | ⬜     |
| View report with generated data               | ⬜     |
| Delete/deactivate report (dynamic mode)       | ⬜     |
| Search by name and type                       | ⬜     |
| Filter by report type                         | ⬜     |
| Filter by status (active/deactivated)         | ⬜     |
| Pagination (12 per page)                      | ⬜     |
| Export as PDF (styled, theme color)            | ⬜     |
| Export as Excel (styled, theme color)          | ⬜     |
| Card dropdown with More actions               | ⬜     |
| View modal with report info + preview         | ⬜     |
| RBAC enforcement (HM, POC, JS, R)             | ⬜     |
| Dynamic theme color in exports                | ⬜     |
| Error handling and retry                       | ⬜     |
| Audit logging for all actions                 | ⬜     |
