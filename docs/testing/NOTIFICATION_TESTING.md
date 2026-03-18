# Notifications Module - Testing Guide & Process Documentation

## How Notifications Work in the Current System

The Notifications module supports manual notifications with branch-aware targeting and status-driven delivery:
- `draft`
- `scheduled`
- `active`
- `inactive`

Users receive notifications through receipts. Read state is tracked per user.

### Key Business Rules

1. Notifications can target by role, specific user, or branch.
2. Branch access is enforced for non-HM users.
3. Scheduled notifications auto-transition to active at the scheduled time.
4. Sending a draft/scheduled notification generates receipts for target users.
5. Delete action is mode-based in UI:
   - draft/scheduled: hard delete path
   - active/inactive: deactivate path
6. Bell dropdown unread count updates from receipts.
7. Mark as read operations update receipt-level read state.

### RBAC (Role-Based Access Control)

| Action | HM | POC | JS | R | T |
| ------ | -- | --- | -- | - | - |
| View notifications list | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/Edit notification | ✅ | ✅ | ✅ | ❌ | ❌ |
| Send now / Schedule | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete/Deactivate notification | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark read / Mark all read | ✅ | ✅ | ✅ | ✅ | ✅ |

## Core API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/notifications` | Admin list with filters |
| GET | `/api/notifications/my` | Current user's receipts |
| GET | `/api/notifications/unread-count` | Unread badge count |
| GET | `/api/notifications/:id` | Get one notification |
| POST | `/api/notifications` | Create notification |
| PUT | `/api/notifications/:id` | Update notification |
| POST | `/api/notifications/:id/send` | Send now |
| DELETE | `/api/notifications/:id` | Hard delete or deactivate based on references/state |
| POST | `/api/notifications/:id/mark-as-read` | Mark one read |
| POST | `/api/notifications/:id/mark-all-as-read` | Mark all read |

---

## Sample Data to Populate

### Branches
- Main Branch
- North Branch

### Users
| Name | Role | Branch |
| ---- | ---- | ------ |
| Admin HM | HM | Main Branch |
| Ops POC | POC | Main Branch |
| Service JS | JS | North Branch |
| Cashier R | R | Main Branch |
| Technician T | T | North Branch |

### Notification Samples
| Title | Target Type | Target Value | Branch | Status | Scheduled At |
| ----- | ----------- | ------------ | ------ | ------ | ------------ |
| Service Bay Reminder | role | T | North Branch | draft | - |
| End of Day Report | branch | North Branch ID | North Branch | scheduled | +10 minutes |
| Pricing Update | user | Cashier R user ID | Main Branch | active | - |
| Old Promo | branch | Main Branch ID | Main Branch | inactive | - |

---

## Step-by-Step Testing Guide

### Pre-requisites

- Logged in as HM/POC/JS for management tests
- Logged in as R/T for read tests
- At least two branches and multiple users assigned

---

### Test 1 - Notifications List and Stats

Goal: Verify list, stats cards, and table rendering.

1. Open Notifications page.

Verify:
- ✅ Stats cards show total/active/inactive counts
- ✅ List contains notifications with title, target, branch, type, status
- ✅ Mobile cards and desktop table both render correctly

---

### Test 2 - Create Draft Notification

Goal: Verify manual draft creation.

1. Click Create Notification.
2. Fill title/message.
3. Set target type and target value.
4. Leave schedule empty.
5. Save.

Verify:
- ✅ Notification is created with `draft` status
- ✅ Appears in list
- ✅ No immediate delivery until send

---

### Test 3 - Create Scheduled Notification

Goal: Verify scheduled creation.

1. Create notification with schedule delay/unit.

Verify:
- ✅ Status is `scheduled`
- ✅ Scheduled timestamp is set
- ✅ Auto-refresh eventually updates list when time passes

---

### Test 4 - Send Now Flow

Goal: Verify send action transitions status and delivers.

1. On a draft/scheduled notification, click Send Now.

Verify:
- ✅ Status becomes `active`
- ✅ Receipts are created for target audience
- ✅ Target users see notification in personal feed

---

### Test 5 - Target Type Validation

Goal: Verify role/user/branch target logic.

1. Create one notification per target type.

Verify:
- ✅ Role target reaches users of that role in branch scope
- ✅ User target reaches only selected user
- ✅ Branch target reaches users assigned to branch

---

### Test 6 - Edit Notification

Goal: Verify editable fields and schedule adjustments.

1. Edit an existing manual notification.
2. Update title/message and schedule.

Verify:
- ✅ Changes persist after save
- ✅ Updated values display in table/card/view modal

---

### Test 7 - Delete/Deactivate Modal Behavior

Goal: Verify dynamic delete/deactivate wording and action.

1. Open delete on a draft notification.
2. Open delete on an active/inactive notification.

Verify:
- ✅ Draft/scheduled path shows delete behavior
- ✅ Active/inactive path shows deactivate behavior
- ✅ Success toast reflects delete vs deactivate

---

### Test 8 - Search and Filter Behavior

Goal: Verify search and multi-filter handling.

1. Search by title/message.
2. Filter by status.
3. Filter by target type.
4. Filter by branch.

Verify:
- ✅ Combined filters narrow results correctly
- ✅ Reset filters restores default view
- ✅ Pagination resets to page 1 on filter change

---

### Test 9 - View Modal Integrity

Goal: Verify detail view accuracy.

1. Open View for a notification.

Verify:
- ✅ Title/message/branch/target/status values are accurate
- ✅ Read-only fields display correctly

---

### Test 10 - Bell Dropdown and Unread Count

Goal: Verify topbar notification dropdown behavior.

1. Trigger unread notifications for current user.
2. Open bell dropdown.
3. Mark one as read, then mark all.

Verify:
- ✅ Unread badge reflects unread count
- ✅ Mark single decrements count
- ✅ Mark all sets unread count to zero
- ✅ Notification settings icon routes to Notifications page

---

### Test 11 - Role Restrictions

Goal: Verify management controls are role-protected.

1. Log in as R or T.
2. Open Notifications page.

Verify:
- ✅ Create/Edit/Delete controls are hidden/blocked
- ✅ View and read actions remain available

---

## Summary Checklist

| Requirement | Status |
| ----------- | ------ |
| Draft/scheduled/active/inactive workflow | ⬜ |
| Targeting by role/user/branch | ⬜ |
| Scheduled auto-activation | ⬜ |
| Send now receipt creation | ⬜ |
| Dynamic delete/deactivate behavior | ⬜ |
| Search and filter controls | ⬜ |
| Bell dropdown unread count flow | ⬜ |
| Mark single/all as read | ⬜ |
| Role-based management restrictions | ⬜ |
