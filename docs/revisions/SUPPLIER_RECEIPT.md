# Codex Implementation Prompt – Purchase Order Approval + Receipt Attachment

Scan the repository again before modifying any files.  
You already generated a structural analysis of the Purchase Order module.  
Use that analysis as reference and only modify the existing implementation.

Important architecture constraints:

- All Purchase Order logic is inside `purchaseorders.routes.ts`
- Routes are mounted at `/api/purchase-orders`
- There are no controllers/services for PO logic
- Status enum already exists
- Audit logging uses `log_admin_action`
- RBAC uses `requireRoles`
- Frontend uses `PurchaseOrderManagement.tsx`
- API client functions exist in `api.ts`

Do not refactor the architecture. Extend the current structure.

---

# Goal

Add **Receipt Attachment capability** to the Purchase Order module and enforce that **receiving a purchase order requires a receipt proof**.

Do not modify the existing approval workflow (`draft → submitted → approved → received`).  
Only extend it with receipt validation and upload capability.

---

# 1. Database Changes

Update the `purchase_orders` table.

Add these new nullable fields:

- receipt_attachment TEXT
- receipt_uploaded_by UUID
- receipt_uploaded_at TIMESTAMP

Purpose:

Store uploaded receipt file path or URL.

Ensure the fields appear in the generated types used by the backend (`database.types.ts`).

Do not modify existing status enum values.

---

# 2. Backend Route Changes

Modify `purchaseorders.routes.ts`.

Add a new endpoint:

- POST /:id/upload-receipt

Requirements:

- Must require authentication
- Allowed roles: HM, POC, JS, R
- Accept file upload (image or PDF)
- Validate file type
- Store file
- Save metadata to PO record

Accepted file types:

- jpg
- jpeg
- png
- pdf

Store the file path in:

- receipt_attachment

Also populate:

- receipt_uploaded_by
- receipt_uploaded_at

---

# 3. File Upload System

If the project already uses Supabase storage, use Supabase Storage.

Create bucket:

- purchase-order-receipts

Upload path format:

- purchase-orders/{po_id}/receipt-{timestamp}.{ext}

Return the storage URL.

If Supabase Storage is not configured, implement a minimal upload handler using `multer`.

Do not introduce unnecessary dependencies if storage already exists.

---

# 4. Receive Endpoint Validation

Modify the existing receive endpoint:

- POST /:id/receive

Add a validation rule:

The purchase order **cannot be received unless a receipt is uploaded**.

Before stock processing:

Check:

- receipt_attachment IS NOT NULL

If no receipt exists:

Return error:

Cannot receive purchase order without receipt attachment

---

# 5. Audit Logging

Extend existing audit logging.

When receipt is uploaded:

Call:

log_admin_action

Action name:

PO_RECEIPT_UPLOADED

Include:

- purchase_order_id
- uploaded_by
- timestamp

---

# 6. Frontend Changes

Modify `PurchaseOrderManagement.tsx`.

Add a new section inside the Purchase Order detail view.

Section title:

Receipt Attachment

Behavior:

If receipt does not exist:

Show button:

Receipt

Open file picker.

Allowed files:

- jpg
- jpeg
- png
- pdf

Upload to backend endpoint:

POST /api/purchase-orders/{id}/upload-receipt

---

If receipt exists:

Display:

- Receipt Preview
- Download Receipt
- Replace Receipt

---

# 7. Receive Button Validation (Frontend)

Update receive button behavior.

Current logic:

Receive button visible when status = approved.

New behavior:

Receive button enabled only if:

receipt_attachment exists

Otherwise show message:

Upload receipt before receiving purchase order.

---

# 8. API Client Updates

Update `api.ts`.

Add new function:

uploadPurchaseOrderReceipt(poId, file)

Endpoint:

POST /api/purchase-orders/:id/upload-receipt

Return updated purchase order record.

---

# 9. UI Feedback

Show toast notifications:

On success:

Receipt uploaded successfully

On failure:

Receipt upload failed

---

# 10. Backward Compatibility

Existing purchase orders may already have status `received`.

Do not break them.

Rules:

If status = received and no receipt exists:
Allow upload but do not block.

Only enforce receipt validation for **future receive operations**.

---

# Implementation Rules

Do not refactor the Purchase Order module architecture.

Modify only:

- `purchaseorders.routes.ts`
- `PurchaseOrderManagement.tsx`
- `api.ts`
- database schema

Reuse:

- existing RBAC middleware
- existing audit logger
- existing PO queries

Ensure the current workflow continues to work.