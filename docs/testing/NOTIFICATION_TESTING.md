# Notification & Service Reminder Module — Testing Guide & Process Documentation

---

## Module 1: System Notifications (UC61–UC64)

### Overview

The System Notifications module provides in-app notification management. Notifications are generated automatically by the system (e.g., on Job Order status changes) or created manually by authorized users. Each notification creates receipts for targeted users, supporting read/unread tracking and a bell-icon dropdown for quick access.

### Key Business Rules

1. **Notification types** — `system` (auto-generated), `job_order` (JO status changes), `inventory` (stock alerts), `reminder` (service reminders), `announcement` (manual broadcasts).
2. **Target types** — `all` (all branch users), `role` (users with specified roles), `user` (specific user).
3. **Statuses** — `active` (visible to users), `inactive` (hidden from user views).
4. **Receipts** — when a notification is created, `notification_receipts` are generated for each targeted user. Receipts track `is_read` and `read_at`.
5. **Branch-scoped** — notifications target users within the creator's branch (HM can target all branches).
6. **Auto-generation** — JO status transitions automatically create `job_order` type notifications for all users in the JO's branch.
7. **Soft delete** — notifications are soft-deleted (`is_deleted = true`); related receipts are cascade-updated.
8. **Immutability** — system-generated notifications (type = `system`, `job_order`, `inventory`) cannot be edited or deleted by users.

### RBAC (Roles & Permissions)

| Action                     | HM  | POC | JS  |  R  |  T  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Notifications (own)   | ✅  | ✅  | ✅  | ✅  | ✅  |
| View All Notifications     | ✅  | ✅  | ✅  |  —  |  —  |
| Create Notification        | ✅  | ✅  | ✅  |  —  |  —  |
| Update Notification        | ✅  | ✅  | ✅  |  —  |  —  |
| Delete Notification        | ✅  | ✅  | ✅  |  —  |  —  |
| Mark as Read               | ✅  | ✅  | ✅  | ✅  | ✅  |
| Mark All as Read           | ✅  | ✅  | ✅  | ✅  | ✅  |

---

## Notification API Testing

### Prerequisites

- User account for each role (HM, POC, JS, R, T)
- At least one branch with assigned users
- Phase 4 migration applied (`PHASE4_MIGRATION.sql`)

---

### Test Case N-01: Create Notification (Manual)

**Description:** Validate that HM/POC/JS can create a manual notification targeting all branch users.

**Test Steps:**
1. Log in as POC.
2. Navigate to Notifications page.
3. Click "Create Notification".
4. Enter Title: "System Maintenance Alert".
5. Enter Message: "Scheduled maintenance this weekend."
6. Select Type: `announcement`.
7. Select Target Type: `all`.
8. Click Save.

**Expected Result:**
- Notification appears in the list with status `active`.
- All users in the creator's branch receive a notification receipt.
- Unread count increments for targeted users.
- Audit log entry is created.

---

### Test Case N-02: Create Notification (Role-targeted)

**Description:** Validate role-targeted notification reaches only specified roles.

**Test Steps:**
1. Log in as HM.
2. Create notification with Target Type: `role`, Target Value: `R,T`.
3. Save.

**Expected Result:**
- Only users with role R or T in the branch receive notification receipts.
- POC/JS users do NOT receive receipts.

---

### Test Case N-03: View Own Notifications (Bell Dropdown)

**Description:** Validate bell icon shows user's unread notifications.

**Test Steps:**
1. Log in as R (Receptionist).
2. Observe the bell icon in the header.
3. Click the bell icon.

**Expected Result:**
- Dropdown opens showing recent notifications.
- Unread count badge shows correct number.
- Each notification shows title, message preview, and time ago.

---

### Test Case N-04: Mark Single Notification as Read

**Description:** Validate marking a single notification as read.

**Test Steps:**
1. Log in as any role.
2. Open bell dropdown.
3. Click on an unread notification.

**Expected Result:**
- Notification is marked as read (styling changes).
- Unread count decreases by 1.
- `read_at` timestamp is set on the receipt.

---

### Test Case N-05: Mark All Notifications as Read

**Description:** Validate marking all notifications as read.

**Test Steps:**
1. Log in as any role with multiple unread notifications.
2. Open bell dropdown.
3. Click "Mark all as read".

**Expected Result:**
- All notifications marked as read.
- Unread count becomes 0.
- Badge disappears from bell icon.

---

### Test Case N-06: Auto-notification on JO Status Change

**Description:** Validate that JO status transitions create automatic notifications.

**Test Steps:**
1. Log in as R (Receptionist).
2. Create a Job Order in draft status.
3. Submit for approval (draft → pending_approval).
4. Log in as POC.
5. Check bell icon.

**Expected Result:**
- Notification appears: "Job Order #[JO Number] — Pending Approval".
- Type is `job_order`.
- All users assigned to the JO's branch receive notification receipts.

---

### Test Case N-07: Auto-notification on JO Approval

**Description:** Validate notification is created when JO is approved.

**Test Steps:**
1. Approve a pending JO as HM/POC.
2. Check notifications for all branch users.

**Expected Result:**
- Notification: "Job Order #[JO Number] — Approved".
- All branch users see it in their notifications.

---

### Test Case N-08: Auto-notification on JO Rejection

**Description:** Validate notification is created when JO is rejected.

**Test Steps:**
1. Reject a pending JO as HM/POC with a reason.
2. Check notifications for all branch users.

**Expected Result:**
- Notification: "Job Order #[JO Number] — Rejected".
- All branch users see it in their notifications.

---

### Test Case N-09: View Notification Detail

**Description:** Validate viewing full notification details.

**Test Steps:**
1. Log in as POC.
2. Navigate to Notifications page.
3. Click the eye icon (view) on a notification.

**Expected Result:**
- Modal opens showing full title, message, type, target, status, created date.
- Shows receipt count information.

---

### Test Case N-10: Update Notification

**Description:** Validate editing a manual notification.

**Test Steps:**
1. Log in as POC.
2. Navigate to Notifications page.
3. Click edit on a manual `announcement` notification.
4. Change title and message.
5. Save.

**Expected Result:**
- Notification updated successfully.
- Changes reflected in the list and detail view.
- System-generated notifications (type = `job_order`) do NOT show edit button.

---

### Test Case N-11: Delete Notification (Soft Delete)

**Description:** Validate soft-deleting a notification.

**Test Steps:**
1. Log in as HM.
2. Navigate to Notifications page.
3. Click delete on a manual notification.
4. Confirm deletion.

**Expected Result:**
- Notification is removed from the active list.
- Notification still exists in DB with `is_deleted = true`.
- Audit log entry is created.
- System-generated notifications cannot be deleted.

---

### Test Case N-12: RBAC — R and T Cannot Create

**Description:** Validate that R and T roles cannot create, edit, or delete notifications.

**Test Steps:**
1. Log in as R.
2. Navigate to Notifications page.
3. Attempt to find Create button.

**Expected Result:**
- Create button is NOT visible.
- Edit/Delete actions are NOT visible on any notification.
- User can only view notifications and mark as read.

---

### Test Case N-13: Unread Count Polling

**Description:** Validate that the bell icon polls for new notifications.

**Test Steps:**
1. Log in as T (Technician).
2. Note the current unread count.
3. Have another user (HM) create a notification targeting all.
4. Wait up to 30 seconds.

**Expected Result:**
- Unread count updates automatically without page refresh.
- New notification appears in the dropdown.

---

### Test Case N-14: Pagination and Search

**Description:** Validate notification list pagination and search.

**Test Steps:**
1. Create 15+ notifications.
2. Navigate to Notifications page.
3. Use search box to filter by title.
4. Change page using pagination controls.

**Expected Result:**
- Search filters notifications by title/message.
- Pagination shows correct page counts.
- 10 items per page by default.

---

## Module 2: Service Reminders (UC65–UC69)

### Overview

The Service Reminder module allows authorized staff to create, schedule, and send service reminders to customers. Reminders track customer vehicles, scheduled service dates, and delivery methods (SMS, email, in-app). The module includes mock delivery simulation and a cron-like endpoint for processing scheduled reminders.

### Key Business Rules

1. **Delivery methods** — `sms`, `email`, `in_app`.
2. **Statuses** — `draft` (editable), `scheduled` (queued for delivery), `sent` (delivered), `failed` (delivery failed), `cancelled` (cancelled before delivery).
3. **Customer validation** — customer must exist and be active; vehicle must belong to the selected customer.
4. **Contact validation** — for SMS, customer must have a phone number; for email, customer must have an email address.
5. **Editable only in draft** — once scheduled or sent, reminders cannot be edited (only cancelled if scheduled).
6. **Branch-scoped** — HM sees all reminders; other roles see only their branch's reminders.
7. **Soft delete** — reminders are soft-deleted (`is_deleted = true`).
8. **Process scheduled** — a cron endpoint processes all reminders where `scheduled_date ≤ now` and status = `scheduled`, simulating delivery.

### RBAC (Roles & Permissions)

| Action                     | HM  | POC | JS  |  R  |  T  |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| View Service Reminders     | ✅  | ✅  | ✅  | ✅  |  —  |
| Create Service Reminder    |  —  | ✅  | ✅  | ✅  |  —  |
| Update Service Reminder    |  —  | ✅  | ✅  | ✅  |  —  |
| Delete Service Reminder    |  —  | ✅  | ✅  | ✅  |  —  |
| Send Service Reminder      |  —  | ✅  | ✅  | ✅  |  —  |
| Cancel Service Reminder    |  —  | ✅  | ✅  | ✅  |  —  |
| Process Scheduled (cron)   | ✅  |  —  |  —  |  —  |  —  |

---

## Service Reminder API Testing

### Prerequisites

- At least one active customer with phone number and email
- At least one vehicle linked to the customer
- Phase 4 migration applied

---

### Test Case SR-01: Create Service Reminder (Draft)

**Description:** Validate creating a service reminder in draft status.

**Test Steps:**
1. Log in as POC.
2. Navigate to Service Reminders page.
3. Click "Create Reminder".
4. Select Customer from dropdown.
5. Select Vehicle (filtered by customer).
6. Select Delivery Method: `sms`.
7. Set Scheduled Date.
8. Enter Message: "Your vehicle is due for service."
9. Click Save.

**Expected Result:**
- Reminder created with status `draft`.
- Reminder appears in the list.
- Customer name and vehicle info displayed correctly.
- Audit log entry is created.

---

### Test Case SR-02: Create with Invalid Customer/Vehicle

**Description:** Validate creation fails with invalid relationships.

**Test Steps:**
1. Log in as JS.
2. Create a reminder and attempt to select a vehicle not belonging to the selected customer.

**Expected Result:**
- Vehicle dropdown only shows vehicles belonging to the selected customer.
- Backend rejects mismatched customer/vehicle combinations.

---

### Test Case SR-03: Create with Missing Contact Info

**Description:** Validate that delivery method requires matching contact info.

**Test Steps:**
1. Select a customer with NO phone number.
2. Set delivery method to `sms`.
3. Attempt to save.

**Expected Result:**
- Error message: "Customer does not have a phone number for SMS delivery."
- Reminder is not created.

---

### Test Case SR-04: Send Reminder (Immediate)

**Description:** Validate sending a reminder immediately.

**Test Steps:**
1. Create a reminder in draft status.
2. Click the "Send" button on the reminder.
3. Confirm sending.

**Expected Result:**
- Status changes from `draft` to `sent`.
- `sent_at` timestamp is populated.
- `sent_by` is set to the current user's ID.
- Success message displayed.
- Audit log entry created.

---

### Test Case SR-05: Send Already Sent Reminder

**Description:** Validate that an already-sent reminder cannot be re-sent.

**Test Steps:**
1. Find a reminder with status `sent`.
2. Attempt to send it again.

**Expected Result:**
- Send button is not visible for sent reminders.
- Backend returns error if API is called directly.

---

### Test Case SR-06: Schedule Reminder

**Description:** Validate scheduling a reminder for future delivery.

**Test Steps:**
1. Create a reminder with a future scheduled date.
2. Status should be `draft`.
3. Edit the reminder and change status to `scheduled` (or use the schedule action).

**Expected Result:**
- Reminder status becomes `scheduled`.
- Reminder appears with scheduled date in the list.

---

### Test Case SR-07: Cancel Scheduled Reminder

**Description:** Validate cancelling a scheduled reminder.

**Test Steps:**
1. Find a reminder with status `scheduled`.
2. Click "Cancel" button.
3. Confirm cancellation.

**Expected Result:**
- Status changes to `cancelled`.
- `cancelled_at` and `cancelled_by` fields populated.
- Reminder remains in list but is no longer actionable.
- Audit log entry created.

---

### Test Case SR-08: Cancel Draft Reminder

**Description:** Validate cancelling a draft reminder.

**Test Steps:**
1. Find a reminder with status `draft`.
2. Click "Cancel" button.
3. Confirm cancellation.

**Expected Result:**
- Status changes to `cancelled`.
- Reminder is no longer editable or sendable.

---

### Test Case SR-09: Cannot Cancel Sent Reminder

**Description:** Validate that sent reminders cannot be cancelled.

**Test Steps:**
1. Find a reminder with status `sent`.
2. Check for Cancel button.

**Expected Result:**
- Cancel button is NOT visible.
- API returns error if called directly for a sent reminder.

---

### Test Case SR-10: Edit Draft Reminder

**Description:** Validate editing a draft reminder.

**Test Steps:**
1. Find a reminder with status `draft`.
2. Click Edit.
3. Change message and delivery method.
4. Save.

**Expected Result:**
- Changes saved successfully.
- Updated values reflected in list and detail views.

---

### Test Case SR-11: Cannot Edit Non-Draft Reminder

**Description:** Validate that scheduled/sent/cancelled reminders cannot be edited.

**Test Steps:**
1. Find a reminder with status `sent`.
2. Check for Edit button.

**Expected Result:**
- Edit button is NOT visible for non-draft reminders.

---

### Test Case SR-12: Delete Reminder (Soft Delete)

**Description:** Validate soft-deleting a reminder.

**Test Steps:**
1. Find a reminder with status `draft` or `cancelled`.
2. Click Delete.
3. Confirm deletion.

**Expected Result:**
- Reminder removed from list.
- Record still exists in DB with `is_deleted = true`.
- Audit log entry created.

---

### Test Case SR-13: Process Scheduled Reminders (Cron)

**Description:** Validate the batch processing of scheduled reminders.

**Test Steps:**
1. Create several reminders with `scheduled` status and past `scheduled_date`.
2. Call POST `/api/service-reminders/process-scheduled` as HM.

**Expected Result:**
- All eligible reminders transition from `scheduled` to `sent`.
- `sent_at` timestamps are set.
- Response includes count of processed reminders.
- Failed reminders (if any) marked as `failed` with error message.

---

### Test Case SR-14: RBAC — T Cannot Access Service Reminders

**Description:** Validate that Technician role cannot access service reminders.

**Test Steps:**
1. Log in as T (Technician).
2. Check sidebar navigation.

**Expected Result:**
- "Service Reminders" nav item is NOT visible.
- Direct API calls return 403 Forbidden.

---

### Test Case SR-15: RBAC — HM Can View But Not Create

**Description:** Validate that HM can view all reminders but creation is restricted per RBAC.

**Test Steps:**
1. Log in as HM.
2. Navigate to Service Reminders.
3. Verify reminders from all branches are visible.

**Expected Result:**
- All branches' reminders are visible.
- HM can view details of any reminder.
- Process Scheduled button is available (HM only).

---

### Test Case SR-16: Customer/Vehicle Cascade Filter

**Description:** Validate that vehicle dropdown filters based on selected customer.

**Test Steps:**
1. Open Create Reminder form.
2. Select Customer A (who has 2 vehicles).
3. Check vehicle dropdown.
4. Change to Customer B (who has 1 vehicle).
5. Check vehicle dropdown again.

**Expected Result:**
- Vehicle dropdown only shows vehicles belonging to the selected customer.
- Changing customer resets the vehicle selection.
- Vehicle list updates immediately upon customer change.

---

### Test Case SR-17: Stats Cards Accuracy

**Description:** Validate stats cards show correct counts.

**Test Steps:**
1. Navigate to Service Reminders page.
2. Note the counts for Total, Draft, Scheduled, Sent, Failed.
3. Cross-reference with the table data.

**Expected Result:**
- Stats cards reflect accurate counts matching filtered/unfiltered data.
- Counts update after create/send/cancel/delete operations.

---

### Test Case SR-18: Search and Filter

**Description:** Validate search and filter functionality.

**Test Steps:**
1. Navigate to Service Reminders page.
2. Enter a customer name in the search box.
3. Select status filter "sent".
4. Select delivery method filter "sms".

**Expected Result:**
- Results filtered by all active criteria.
- Empty state shown if no matches.
- Clearing filters restores full list.
- Pagination updates correctly.

---

## Cross-Module Integration Tests

### Test Case INT-01: JO Notification → Bell Dropdown

**Description:** Validate end-to-end flow from JO status change to bell notification.

**Test Steps:**
1. Create and submit a JO (draft → pending_approval).
2. Log in as another user in the same branch.
3. Check bell icon within 30 seconds.

**Expected Result:**
- Auto-generated notification appears in bell dropdown.
- Clicking it marks it as read.
- Notification also appears in the Notifications management page.

---

### Test Case INT-02: Notification Management → Bell Sync

**Description:** Validate that marking notifications read in management page syncs with bell.

**Test Steps:**
1. View Notifications management page.
2. Note unread count in bell icon.
3. Mark a notification as read on the management page.
4. Check bell icon unread count.

**Expected Result:**
- Bell unread count decreases after marking read on management page.
- Consistency between both views.

---

### Test Case INT-03: Service Reminder with In-App Delivery

**Description:** Validate in-app delivery creates a notification.

**Test Steps:**
1. Create a service reminder with delivery method `in_app`.
2. Send the reminder.
3. Check if a notification is created for the customer's linked user (if applicable).

**Expected Result:**
- Reminder status becomes `sent`.
- If the system creates an in-app notification, it appears in the target user's notifications.
- If mock delivery, success message is shown.

---

## Common Error Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Create notification without title | Validation error: "Title is required" |
| Create notification without message | Validation error: "Message is required" |
| Create reminder without customer | Validation error: "Customer is required" |
| Create reminder without vehicle | Validation error: "Vehicle is required" |
| Send reminder for inactive customer | Error: customer not found or inactive |
| Edit sent notification/reminder | Edit button not shown; API returns 400 |
| Delete system-generated notification | Error: cannot delete system notifications |
| Access notifications API without auth | 401 Unauthorized |
| R/T role creates notification via API | 403 Forbidden |
| T role accesses service reminders | 403 Forbidden |

---

## API Endpoints Reference

### Notifications

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET    | `/api/notifications` | List all notifications (admin) | HM, POC, JS |
| GET    | `/api/notifications/my` | Get user's notifications | All |
| GET    | `/api/notifications/unread-count` | Get unread count | All |
| GET    | `/api/notifications/:id` | Get notification detail | HM, POC, JS |
| POST   | `/api/notifications` | Create notification | HM, POC, JS |
| PUT    | `/api/notifications/:id` | Update notification | HM, POC, JS |
| DELETE | `/api/notifications/:id` | Soft-delete notification | HM, POC, JS |
| POST   | `/api/notifications/:id/mark-read` | Mark as read | All |
| POST   | `/api/notifications/mark-all-read` | Mark all read | All |

### Service Reminders

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET    | `/api/service-reminders` | List all reminders | HM, POC, JS, R |
| GET    | `/api/service-reminders/:id` | Get reminder detail | HM, POC, JS, R |
| POST   | `/api/service-reminders` | Create reminder | POC, JS, R |
| PUT    | `/api/service-reminders/:id` | Update reminder | POC, JS, R |
| DELETE | `/api/service-reminders/:id` | Soft-delete reminder | POC, JS, R |
| POST   | `/api/service-reminders/:id/send` | Send reminder | POC, JS, R |
| POST   | `/api/service-reminders/:id/cancel` | Cancel reminder | POC, JS, R |
| POST   | `/api/service-reminders/process-scheduled` | Process scheduled | HM |
