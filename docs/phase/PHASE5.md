# Sprint 5 – Reporting & Analytics Module

Authoritative References:
- docs/PHASE1.md
- docs/PHASE2.md
- docs/PHASE3.md
- docs/PHASE4.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC70–UC79)
- Functional & Non-Functional Requirements

This phase implements Real-Time Dashboards, Staff Performance Analytics, and Custom Reports.

---

## Module 1: Real-Time Dashboards

You are implementing the Real-Time Dashboard module.

Scope:
1. View real-time dashboards (UC70)
2. Filter real-time dashboards (UC71)

RBAC:
- View & Filter: HM, POC, JS, R

Metrics Required:
- Total Sales (daily, weekly, monthly)
- Completed Job Orders
- Active Job Orders
- Inventory Low-Stock Count
- Revenue per Branch
- Top Services

Filtering Options:
- Branch
- Date range
- Service category
- Staff

Technical Requirements:
- Real-time updates using Supabase subscriptions.
- Dashboard cards must refresh on JO status change.
- Charts:
  - Line chart (sales over time)
  - Bar chart (top services)
  - Pie chart (job status distribution)

Acceptance Criteria:
- Dashboard loads within ≤3 seconds.
- Filters update data dynamically.
- Charts reflect accurate aggregated data.
- No direct table scans without indexing.

Tasks:
1. Create aggregated SQL views.
2. Implement dashboard API endpoints.
3. Implement subscription listeners.
4. Build dashboard page with charts (Replace the first page of the sidebar item).
5. Copy the layout of the attached image but keep the styling of the cards same as the other pages, use available components or create one if none.
5. Add filtering controls.
6. Apply branch isolation rules.
7. Optimize queries with indexes.

---

## Module 2: Staff Performance Analytics

Scope:
1. Create staff performance analytics (UC72)
2. View staff performance analytics (UC73)
3. Update staff performance analytics (UC74)
4. Delete staff performance analytics (UC75)

RBAC:
- Create / Update / Delete: HM, POC, JS
- View: HM, POC, JS, R, T

Metrics:
- Jobs completed per staff
- Average job completion time
- Revenue generated per staff
- On-time completion rate

Fields:
- staff_id
- metric_type
- metric_value
- period_start
- period_end
- branch_id

Rules:
- Auto-calculate metrics from Job Order data.
- Cannot manually override computed values.
- Soft delete only.

Acceptance Criteria:
- Metrics computed accurately.
- Reports reflect correct data.
- Only authorized roles can modify.

Tasks:
1. Create staff_performance table.
2. Implement aggregation queries.
3. Implement CRUD APIs.
4. Build Staff Performance Table in the 4th row in the dashboard.
5. Add filters and charts.
6. Enforce RBAC.
7. Audit log changes.

---

## Module 3: Customizable Reports

Scope:
1. Create customizable reports (UC76)
2. View customizable reports (UC77)
3. Export customizable reports (UC78)
4. Delete customizable reports (UC79)

RBAC:
- Create / View / Export / Delete: HM, POC, JS, R

Report Types:
- Sales Report
- Inventory Report
- Job Order Report
- Staff Performance Report

Features:
- Date range filtering
- Branch filtering
- Export to:
  - PDF
  - Excel (CSV acceptable)
- Save report configuration template

Report Fields:
- report_name
- report_type
- filters (JSON)
- generated_by
- generated_at
- branch_id

Rules:
- Reports are generated dynamically.
- Export must use server-side generation.
- Saved templates reusable.
- Soft delete only.

Acceptance Criteria:
- Report generation under ≤5 seconds.
- Export files download correctly.
- Filters applied accurately.
- Branch isolation enforced.
- All actions audit logged.

Tasks:
1. Create reports table.
2. Implement report generation service.
3. Implement export endpoints.
4. Generate PDF/CSV.
5. Build Reports management page.
6. Add Reports sidebar item.
7. Enforce RBAC.
8. Audit log all actions.