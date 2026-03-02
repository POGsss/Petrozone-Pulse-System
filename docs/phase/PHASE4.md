# Sprint 4 – Customer Communication & Notification Module

Authoritative References:
- docs/PHASE1.md
- docs/PHASE2.md
- docs/PHASE3.md
- docs/SYSTEM_CONCEPT.md
- docs/requirements/UseCase&UserStories.xlsx (UC61–UC69)
- Functional & Non-Functional Requirements
- Roles & Permissions Matrix

This phase implements System Notifications and Service Reminder Delivery features.

---

## Module 1: System Notifications

You are implementing the System Notifications module.

Scope:
1. Create system notifications (UC61)
2. Receive system notifications (UC62)
3. Update system notifications (UC63)
4. Delete system notifications (UC64)
5. Automatic Job Status Alerts (triggered from Job Order lifecycle)

RBAC:
- Create / Update / Delete: HM, POC, JS
- Receive/View: HM, POC, JS, R, T

Functional Requirements:
- Notifications may be:
  - Manual (admin-created)
  - System-triggered (Job Order status changes)
- Each notification can target:
  - Specific roles
  - Specific users
  - All users in a branch
- Notifications must be branch-scoped.
- Must support read/unread status per user.
- Must store delivery timestamp.
- Must allow soft delete.

Notification Fields:
- title (required)
- message (required)
- target_type (role | user | branch)
- target_value (role name, user_id, or branch_id)
- status (active | inactive)
- created_by
- created_at
- updated_at

User Stories:
- HM, POC, JS can create/update/delete notifications.
- All roles can receive relevant notifications.
- Notifications must appear in header dropdown (bell icon).
- Unread count must be visible.

Acceptance Criteria:
- Notifications persist correctly in database.
- Unread count updates instantly.
- Notifications triggered automatically on JO status change.
- All mutations are audit logged.
- Soft delete only (status = inactive).

Tasks:
1. Design notifications table.
2. Design notification_receipts table (per-user read tracking).
3. Implement backend CRUD APIs.
4. Implement automatic notification trigger from Job Order status transitions.
5. Implement mark-as-read endpoint.
6. Implement notification dropdown UI.
7. Apply Supabase RLS for branch isolation.
8. Add notification icon to main layout.
9. Audit log all changes.

---

## Module 2: Service Reminder Delivery

You are implementing the Service Reminder Delivery module.

Scope:
1. Create Service Reminder Delivery (UC65)
2. View Service Reminder Delivery (UC66)
3. Update Service Reminder Delivery (UC67)
4. Delete Service Reminder Delivery (UC68)
5. Send Service Reminder Delivery (UC69)
6. Automated reminder scheduling

RBAC:
- Create / View / Update / Delete / Send: POC, JS, R

Functional Requirements:
- Reminders are linked to:
  - Customer
  - Vehicle
  - Service Type
- Can be scheduled:
  - Specific date/time
  - X days after last completed Job Order
- Delivery methods:
  - Email
  - SMS (mock service if SMS provider not configured)
- Reminder statuses:
  - draft
  - scheduled
  - sent
  - failed
  - cancelled

Reminder Fields:
- customer_id (required)
- vehicle_id (required)
- service_type (required)
- scheduled_at (required)
- delivery_method (email | sms)
- message_template (required)
- status
- sent_at
- created_by
- branch_id

Rules:
- Sending updates status to sent.
- Failed delivery updates status to failed.
- Cancel sets status to cancelled.
- Scheduled reminders auto-trigger via cron or background job simulation.
- Must validate customer contact availability before sending.

User Stories:
- POC, JS, R can create reminders.
- They can track reminder status.
- They can resend reminders.
- Customers are notified on time.

Acceptance Criteria:
- Reminder saved with full validation.
- Reminder list loads accurately.
- Send action updates status correctly.
- Scheduled reminders auto-trigger.
- All actions audit logged.
- Branch isolation enforced.

Tasks:
1. Design service_reminders table.
2. Implement backend CRUD APIs.
3. Implement send endpoint.
4. Implement scheduler (Supabase Edge Function or cron simulation).
5. Integrate email provider (mock allowed).
6. Validate contact data before sending.
7. Build Service Reminder Management page.
8. Add sidebar item under Customer section.
9. Audit log all actions.