# MODULE 5 IMPLEMENTATION PROMPT: Rework / Backorder Job Orders

Use this prompt with Copilot to implement Module 5 safely in the existing Petrozone Pulse System.

---

## Prompt Start

You are implementing a lifecycle-level feature in an existing React + TypeScript frontend and Express + TypeScript backend with Supabase.

Project root:
- backend/
- frontend/
- docs/

Primary files likely affected:
- backend/src/routes/joborders.routes.ts
- backend/src/types/database.types.ts
- frontend/src/lib/api.ts
- frontend/src/types/index.ts
- frontend/src/pages/subpages/JobOrderManagement.tsx
- docs/testing/JOBORDER_TESTING.md

### Hard requirements

1. A Rework Job is a NEW job order.
2. Rework must NOT be implemented as a job_order_item.
3. Rework must reference an existing COMPLETED job order.
4. Rework must have full traceability to the original job order.
5. Rework uses the SAME approval_status field already used in job orders (do NOT add rework_approval_status).
6. Keep existing normal job order behavior intact.

### Core data model changes (job_orders)

Add fields to job_orders:
- job_type: text/enum with values ('normal', 'backorder'), default 'normal'
- reference_job_order_id: uuid nullable, FK to job_orders.id
- rework_reason: text nullable at DB level but required in validation when job_type = 'backorder'
- is_free_rework: boolean default true

Do NOT remove or replace existing fields.
Do NOT change status enum flow for normal jobs.

### Validation rules

On rework creation (job_type = 'backorder'):
- reference_job_order_id is required
- rework_reason is required and non-empty
- referenced original job must exist and be status = 'completed'
- new rework job should be created with status = 'pending_approval'
- approval_status should be set consistently with current flow when pending approval (reuse existing convention)

On start work:
- if job_type = 'backorder', job must be approved through existing approval flow before start
- block start-work with clear error if not approved

On completion:
- if is_free_rework = true, skip payment detail enforcement for completion
- else enforce existing payment detail requirements unchanged

### Required endpoints

Implement or extend these endpoints in backend/src/routes/joborders.routes.ts:

1) POST /api/job-orders/rework
- Creates a new backorder job order from an existing completed job order.
- Request body should include at least:
  - reference_job_order_id
  - rework_reason
  - is_free_rework (optional, default true)
  - notes (optional)
- Determine customer_id, vehicle_id, branch_id, vehicle_class from original job order for consistency.
- Create a separate JO row with job_type = 'backorder'.
- Keep line items decoupled from original unless explicit cloning is designed; if cloning is needed, do it as new job_order_lines rows, not references.
- Return full JO payload compatible with existing frontend types.

2) PATCH /api/job-orders/:id/approve-rework
- HM-only endpoint.
- Reuse approval_status field and existing status progression semantics.
- Accept decision approved/rejected.
- On approve, keep flow compatible with existing approved -> in_progress transition.
- On reject, keep rejected semantics and persist rejection_reason when provided.
- Return updated JO payload.

Note:
- Reuse existing helper behavior where possible (branch access checks, audit logs, notifications).
- Do not break existing /request-approval and /record-approval for normal JOs.

### Lifecycle requirements

Rework lifecycle must follow:
- pending_approval -> approved/rejected -> in_progress -> ready_for_release -> pending_payment -> completed

Rules:
- No start-work before approved.
- No shortcuts.
- If rejected, cannot proceed until re-approved via valid flow.

### Frontend behavior requirements

In frontend/src/pages/subpages/JobOrderManagement.tsx:

1) Job card/list behavior
- Rework JOs render as normal cards in the same list.
- Add BACKORDER badge on rework cards.
- Show reference text: "Rework of JO-XXXX".
- Do NOT nest reworks inside original card.

2) Original job card indicator
- If an original job has rework children, show indicator like:
  - "Has Rework" or "Reworks: X"

3) More actions menu
- Add "Rework Job" action for completed job orders only.
- Keep action hidden for non-completed jobs.

4) Rework modal
- Fields:
  - Original Job Order (readonly)
  - Rework Reason (required)
  - Free Redo toggle (same visual pattern as Edit User active toggle)
  - Notes (optional)
- Actions:
  - Cancel
  - Submit

5) Job details modal
- If current JO is rework:
  - Show "Rework of JO-XXXX"
  - Show approval_status
  - Show rework_reason
  - Show is_free_rework
- If current JO is original and has related reworks:
  - Show list of related rework JO numbers and statuses

### API client and types

Update frontend/src/lib/api.ts:
- add jobOrdersApi.createRework(...)
- add jobOrdersApi.approveRework(...)

Update frontend/src/types/index.ts JobOrder interface:
- add job_type: 'normal' | 'backorder' (or string union aligned with backend)
- add reference_job_order_id: string | null
- add rework_reason: string | null
- add is_free_rework: boolean
- optionally add related_reworks payload type if returned by API

Update backend/src/types/database.types.ts accordingly.

### Audit and notifications

For rework actions, add/extend audit logs with explicit actions:
- REWORK_CREATED
- REWORK_APPROVED or APPROVAL_RECORDED with clear context job_type=backorder
- REWORK_REJECTED

Notification messages should clearly indicate rework context.

### Backward compatibility constraints

1. Do not break existing normal JO create/edit/approval/start/payment/complete flows.
2. Do not remove legacy fallback behavior unless explicitly required.
3. Do not change existing status labels/colors in a way that regresses current UI.
4. Do not modify original JO items when creating rework.

### Testing checklist (must execute)

Backend tests/manual verification:
1. Create rework from completed JO succeeds.
2. Create rework from non-completed JO fails with clear message.
3. Start work on unapproved rework is blocked.
4. HM approve-rework succeeds and enables start-work.
5. Free rework completion succeeds without payment details.
6. Paid rework still requires payment details.
7. Branch access restrictions still apply.
8. Audit log entries exist and include job_type context.

Frontend tests/manual verification:
1. Completed JO shows "Rework Job" action.
2. Rework modal validates required reason.
3. Rework card displays BACKORDER and reference JO.
4. Original JO shows rework count/indicator when applicable.
5. Rework details appear correctly in Job Order Details modal.
6. Existing non-rework JO UX remains unchanged.

### Implementation approach

Implement in small, reviewable patches in this order:
1. DB migration and type updates.
2. Backend endpoints and lifecycle guards.
3. API client updates.
4. Frontend UI and modal updates.
5. Verification and docs update.

After coding:
- Run type checks/build for backend and frontend.
- Fix any introduced errors.
- Summarize changed files and key behavior changes.

## Prompt End
