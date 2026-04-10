import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();
const PO_NUMBER_PATTERN = /^PO-[A-Z0-9]+-[0-9]{1,6}$/;
const RECEIPT_BUCKET = "purchase-order-receipts";
const RESTORABLE_PO_STATUSES = ["draft", "submitted", "approved", "partially_received", "received", "cancelled"] as const;
const ALLOWED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];

function isRestorablePurchaseOrderStatus(value: unknown): value is (typeof RESTORABLE_PO_STATUSES)[number] {
  return typeof value === "string" && (RESTORABLE_PO_STATUSES as readonly string[]).includes(value);
}

function mapPoActionToStatus(
  action: string | null | undefined,
  newValues?: Record<string, unknown> | null
): (typeof RESTORABLE_PO_STATUSES)[number] | null {
  if (action === "UPDATE") {
    const statusFromNewValues = newValues?.status;
    if (isRestorablePurchaseOrderStatus(statusFromNewValues)) {
      return statusFromNewValues;
    }
  }

  switch (action) {
    case "CREATE":
      return "draft";
    case "SUBMIT":
      return "submitted";
    case "APPROVE":
      return "approved";
    case "CANCEL":
      return "cancelled";
    default:
      return null;
  }
}

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error("Invalid file type. Allowed: jpg, jpeg, png, pdf"));
      return;
    }
    cb(null, true);
  },
});

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  const ext = parts.length > 1 ? parts.pop() : "";
  return (ext || "bin").toLowerCase();
}

function parseQuantityInput(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
    return parsed;
  }
  return null;
}

// All purchase-order routes require authentication
router.use(requireAuth);

// GET /api/purchase-orders
// List purchase orders � UC50
// Roles: HM, POC, JS, R
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))", { count: "exact" })
        .order("created_at", { ascending: false });

      // Branch scoping
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (status) {
        query = query.eq(
          "status",
          status as "draft" | "submitted" | "approved" | "partially_received" | "received" | "cancelled" | "deactivated"
        );
      } else {
        query = query.neq("status", "deactivated");
      }
      if (search) {
        const s = `%${search}%`;
        query = query.or(`po_number.ilike.${s},supplier_name.ilike.${s}`);
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: orders, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: orders || [],
        pagination: {
          total: count ?? 0,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get purchase orders error:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  }
);

// --- GET /api/purchase-orders/:id --------------------------------------
// Get single PO with items � UC50
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;
      const { data: po, error } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure, cost_price))")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      res.json(po);
    } catch (error) {
      console.error("Get purchase order error:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  }
);

// --- POST /api/purchase-orders -----------------------------------------
// Create PO � UC49
// Roles: HM, POC, JS, R
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        po_number,
        supplier_id,
        supplier_name,
        order_date,
        expected_delivery_date,
        branch_id,
        notes,
        items, // Array<{ inventory_item_id, quantity_ordered, unit_cost }>
      } = req.body;

      // Validations
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }
      if (!order_date) {
        res.status(400).json({ error: "Order date is required" });
        return;
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "At least one item is required" });
        return;
      }

      const manualPoNumber = typeof po_number === "string" ? po_number.trim().toUpperCase() : "";
      if (manualPoNumber && !PO_NUMBER_PATTERN.test(manualPoNumber)) {
        res.status(400).json({ error: "PO number must follow PO-BRANCH-123456 format (max 6 digits)." });
        return;
      }

      // Branch access
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Resolve supplier_name from supplier_id if provided
      let resolvedSupplierName = supplier_name?.trim() || null;
      if (supplier_id) {
        const { data: supplier } = await supabaseAdmin
          .from("suppliers")
          .select("supplier_name")
          .eq("id", supplier_id)
          .single();
        if (!supplier) {
          res.status(400).json({ error: "Supplier not found" });
          return;
        }
        resolvedSupplierName = supplier.supplier_name;
      }

      // Validate each item
      for (const item of items) {
        if (!item.inventory_item_id) {
          res.status(400).json({ error: "Each item must have an inventory_item_id" });
          return;
        }
        if (!item.quantity_ordered || parseInt(item.quantity_ordered) < 1) {
          res.status(400).json({ error: "Quantity ordered must be at least 1" });
          return;
        }
        if (item.unit_cost === undefined || parseFloat(item.unit_cost) < 0) {
          res.status(400).json({ error: "Unit cost must be a non-negative number" });
          return;
        }
      }

      // Verify all inventory items belong to the same branch
      const itemIds = items.map((i: { inventory_item_id: string }) => i.inventory_item_id);
      const { data: invItems, error: invCheckError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id")
        .in("id", itemIds);

      if (invCheckError) {
        res.status(500).json({ error: "Failed to verify inventory items" });
        return;
      }

      const missingIds = itemIds.filter((id: string) => !(invItems ?? []).some((inv: any) => inv.id === id));
      if (missingIds.length > 0) {
        res.status(400).json({ error: "One or more inventory items not found" });
        return;
      }

      const wrongBranchItems = (invItems ?? []).filter((inv: any) => inv.branch_id !== branch_id);
      if (wrongBranchItems.length > 0) {
        res.status(400).json({ error: "One or more inventory items do not belong to the selected branch" });
        return;
      }

      // Calculate total
      const total = items.reduce(
        (sum: number, i: { quantity_ordered: number | string; unit_cost: number | string }) =>
          sum + parseInt(String(i.quantity_ordered)) * parseFloat(String(i.unit_cost)),
        0
      );

      // Insert purchase order
      const { data: po, error: poError } = await supabaseAdmin
        .from("purchase_orders")
        .insert({
          po_number: manualPoNumber || "", // trigger auto-generates if empty
          supplier_id: supplier_id || null,
          supplier_name: resolvedSupplierName,
          status: "draft",
          order_date,
          expected_delivery_date: expected_delivery_date || null,
          branch_id,
          notes: notes?.trim() || null,
          total_amount: total,
          created_by: req.user!.id,
        })
        .select("*")
        .single();

      if (poError) {
        if (poError.code === "23505") {
          res.status(409).json({ error: "PO number already exists for this branch" });
          return;
        }
        res.status(500).json({ error: poError.message });
        return;
      }

      // Insert items
      const itemInserts = items.map(
        (i: { inventory_item_id: string; quantity_ordered: number | string; unit_cost: number | string }) => ({
          purchase_order_id: po.id,
          inventory_item_id: i.inventory_item_id,
          quantity_ordered: parseInt(String(i.quantity_ordered)),
          unit_cost: parseFloat(String(i.unit_cost)),
        })
      );

      const { error: itemsError } = await supabaseAdmin
        .from("purchase_order_items")
        .insert(itemInserts);

      if (itemsError) {
        // Rollback PO
        await supabaseAdmin.from("purchase_orders").delete().eq("id", po.id);
        res.status(500).json({ error: itemsError.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("PURCHASE_ORDER", po.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      // Fetch full PO with items
      const { data: fullPO } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", po.id)
        .single();

      res.status(201).json(fullPO);
    } catch (error) {
      console.error("Create purchase order error:", error);
      await logFailedAction(
        req,
        "CREATE",
        "PURCHASE_ORDER",
        null,
        error instanceof Error ? error.message : "Failed to create purchase order"
      );
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  }
);

// --- PUT /api/purchase-orders/:id --------------------------------------
// Update PO � UC51 (only draft/submitted can be edited)
// Roles: HM, POC, JS, R
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;
      const {
        supplier_id,
        supplier_name,
        order_date,
        expected_delivery_date,
        notes,
        items, // full replacement array
      } = req.body;

      // Get existing PO
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Only draft and submitted POs can be edited
      if (!["draft", "submitted"].includes(existing.status)) {
        res.status(400).json({
          error: `Cannot edit a purchase order with status "${existing.status}"`,
        });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      // If supplier_id is provided, resolve supplier_name from it
      if (supplier_id !== undefined) {
        updateData.supplier_id = supplier_id || null;
        if (supplier_id) {
          const { data: supplier } = await supabaseAdmin
            .from("suppliers")
            .select("supplier_name")
            .eq("id", supplier_id)
            .single();
          if (supplier) {
            updateData.supplier_name = supplier.supplier_name;
          }
        } else {
          updateData.supplier_name = null;
        }
      } else if (supplier_name !== undefined) {
        updateData.supplier_name = supplier_name?.trim() || null;
      }

      if (order_date !== undefined) updateData.order_date = order_date;
      if (expected_delivery_date !== undefined)
        updateData.expected_delivery_date = expected_delivery_date || null;
      if (notes !== undefined) updateData.notes = notes?.trim() || null;

      // Update items if provided
      let itemsChanged = false;
      if (items && Array.isArray(items)) {
        if (items.length === 0) {
          res.status(400).json({ error: "At least one item is required" });
          return;
        }

        // Validate items
        for (const item of items) {
          if (!item.inventory_item_id) {
            res.status(400).json({ error: "Each item must have an inventory_item_id" });
            return;
          }
          if (!item.quantity_ordered || parseInt(item.quantity_ordered) < 1) {
            res.status(400).json({ error: "Quantity ordered must be at least 1" });
            return;
          }
          if (item.unit_cost === undefined || parseFloat(item.unit_cost) < 0) {
            res.status(400).json({ error: "Unit cost must be a non-negative number" });
            return;
          }
        }

        // Delete old items and insert new
        await supabaseAdmin
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", poId);

        const itemInserts = items.map(
          (i: { inventory_item_id: string; quantity_ordered: number | string; unit_cost: number | string }) => ({
            purchase_order_id: poId,
            inventory_item_id: i.inventory_item_id,
            quantity_ordered: parseInt(String(i.quantity_ordered)),
            unit_cost: parseFloat(String(i.unit_cost)),
          })
        );

        const { error: itemsError } = await supabaseAdmin
          .from("purchase_order_items")
          .insert(itemInserts);

        if (itemsError) {
          res.status(500).json({ error: itemsError.message });
          return;
        }

        // Recalculate total
        const total = items.reduce(
          (sum: number, i: { quantity_ordered: number | string; unit_cost: number | string }) =>
            sum + parseInt(String(i.quantity_ordered)) * parseFloat(String(i.unit_cost)),
          0
        );
        updateData.total_amount = total;
        itemsChanged = true;
      }

      // Filter out unchanged header fields
      const headerChanges = filterUnchangedFields(updateData, existing);

      if (Object.keys(headerChanges).length === 0 && !itemsChanged) {
        // No real changes � return existing data without triggering an update
        const { data: currentPO } = await supabaseAdmin
          .from("purchase_orders")
          .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
          .eq("id", poId)
          .single();
        res.json(currentPO);
        return;
      }

      if (Object.keys(headerChanges).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("purchase_orders")
          .update(headerChanges)
          .eq("id", poId);

        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { po_number: existing.po_number, ...updateData },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Fetch updated PO
      const { data: updatedPO } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", poId)
        .single();

      res.json(updatedPO);
    } catch (error) {
      console.error("Update purchase order error:", error);
      await logFailedAction(
        req,
        "UPDATE",
        "PURCHASE_ORDER",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to update purchase order"
      );
      res.status(500).json({ error: "Failed to update purchase order" });
    }
  }
);

// --- PATCH /api/purchase-orders/:id/submit -----------------------------
// Transition PO from draft ? submitted
router.patch(
  "/:id/submit",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (po.status !== "draft") {
        res.status(400).json({ error: "Only draft purchase orders can be submitted" });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ status: "submitted" })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { po_number: po.po_number, status: "submitted" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const { data: updated } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", poId)
        .single();

      res.json(updated);
    } catch (error) {
      console.error("Submit purchase order error:", error);
      res.status(500).json({ error: "Failed to submit purchase order" });
    }
  }
);

// --- PATCH /api/purchase-orders/:id/approve ----------------------------
// Approve PO � submitted ? approved (locks from editing)
// Roles: HM, POC
router.patch(
  "/:id/approve",
  requireRoles("HM", "POC"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (po.status !== "submitted") {
        res.status(400).json({ error: "Only submitted purchase orders can be approved" });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ status: "approved" })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { po_number: po.po_number, status: "approved" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const { data: updated } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", poId)
        .single();

      res.json(updated);
    } catch (error) {
      console.error("Approve purchase order error:", error);
      res.status(500).json({ error: "Failed to approve purchase order" });
    }
  }
);

// --- POST /api/purchase-orders/:id/upload-receipt ---------------------
// Upload/replace PO receipt attachment
// Roles: HM, POC, JS, R
router.post(
  "/:id/upload-receipt",
  requireRoles("HM", "POC", "JS", "R"),
  receiptUpload.single("receipt"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const hasReferenceInput = Object.prototype.hasOwnProperty.call(req.body, "receipt_reference_number");
      const hasTotalAmountInput = Object.prototype.hasOwnProperty.call(req.body, "total_amount");

      if (!req.file && !hasReferenceInput && !hasTotalAmountInput) {
        res.status(400).json({ error: "Receipt file, reference number, or total amount is required" });
        return;
      }

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("id, po_number, branch_id, status")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const updates: Record<string, unknown> = {};
      let receiptUrl: string | null = null;
      let uploadedAt: string | null = null;

      if (hasReferenceInput) {
        const referenceRaw = req.body.receipt_reference_number;
        if (typeof referenceRaw !== "string") {
          res.status(400).json({ error: "Receipt reference number must be a string" });
          return;
        }
        const trimmedReference = referenceRaw.trim();
        updates.receipt_reference_number = trimmedReference || null;
      }

      if (hasTotalAmountInput) {
        const totalRaw = req.body.total_amount;
        const totalString = typeof totalRaw === "string" ? totalRaw.trim() : String(totalRaw ?? "").trim();
        if (!totalString) {
          res.status(400).json({ error: "Total amount is required" });
          return;
        }

        const parsedTotal = Number(totalString);
        if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
          res.status(400).json({ error: "Total amount must be greater than 0" });
          return;
        }

        updates.total_amount = parsedTotal;
      }

      if (req.file) {
        const { data: buckets, error: bucketListError } = await supabaseAdmin.storage.listBuckets();
        if (bucketListError) {
          res.status(500).json({ error: "Failed to access storage buckets" });
          return;
        }

        const bucketExists = (buckets || []).some((bucket) => bucket.name === RECEIPT_BUCKET);
        if (!bucketExists) {
          const { error: bucketCreateError } = await supabaseAdmin.storage.createBucket(RECEIPT_BUCKET, {
            public: true,
            fileSizeLimit: 10 * 1024 * 1024,
            allowedMimeTypes: ALLOWED_RECEIPT_MIME_TYPES,
          });

          if (bucketCreateError && !bucketCreateError.message.toLowerCase().includes("already exists")) {
            res.status(500).json({ error: "Failed to create receipt storage bucket" });
            return;
          }
        }

        const timestamp = Date.now();
        const extension = getFileExtension(req.file.originalname);
        const filePath = `purchase-orders/${poId}/receipt-${timestamp}.${extension}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(RECEIPT_BUCKET)
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          res.status(500).json({ error: uploadError.message });
          return;
        }

        const { data: publicUrlData } = supabaseAdmin.storage
          .from(RECEIPT_BUCKET)
          .getPublicUrl(filePath);

        receiptUrl = publicUrlData?.publicUrl || filePath;
        uploadedAt = new Date().toISOString();

        updates.receipt_attachment = receiptUrl;
        updates.receipt_uploaded_by = req.user!.id;
        updates.receipt_uploaded_at = uploadedAt;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No receipt updates provided" });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update(updates)
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      try {
        const auditReference = hasReferenceInput
          ? (typeof updates.receipt_reference_number === "string" ? updates.receipt_reference_number : null)
          : undefined;
        const auditTotalAmount = hasTotalAmountInput
          ? (typeof updates.total_amount === "number" ? updates.total_amount : null)
          : undefined;

        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            purchase_order_id: poId,
            uploaded_by: req.user!.id,
            timestamp: new Date().toISOString(),
            receipt_attachment: receiptUrl,
            receipt_reference_number: auditReference,
            total_amount: auditTotalAmount,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const { data: updatedPO, error: updatedFetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", poId)
        .single();

      if (updatedFetchError) {
        res.status(500).json({ error: updatedFetchError.message });
        return;
      }

      res.json(receiptUrl ? { ...updatedPO, receipt_url: receiptUrl } : updatedPO);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload receipt";
      console.error("Upload receipt error:", error);
      await logFailedAction(
        req,
        "PO_RECEIPT_UPLOADED",
        "PURCHASE_ORDER",
        (req.params.id as string) || null,
        message
      );
      res.status(500).json({ error: message });
    }
  }
);

// --- PATCH /api/purchase-orders/:id/receive ----------------------------
// Receive PO � stock-in logic (FR-6 stock-in rules)
// Atomically increases on-hand quantity for each item
router.patch(
  "/:id/receive",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      // Get PO with items
      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, purchase_order_items(*, inventory_items(id, item_name, reorder_threshold, branch_id))")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (!["approved", "partially_received"].includes(po.status)) {
        res.status(400).json({
          error: "Only approved or partially received purchase orders can be received",
        });
        return;
      }

      const bodyReference = typeof req.body?.receipt_reference_number === "string"
        ? req.body.receipt_reference_number.trim()
        : "";
      const resolvedReference = bodyReference || (typeof po.receipt_reference_number === "string" ? po.receipt_reference_number.trim() : "");

      if (!resolvedReference) {
        res.status(400).json({ error: "Receipt reference number is required before receiving purchase order" });
        return;
      }

      const poItems = po.purchase_order_items || [];
      if (poItems.length === 0) {
        res.status(400).json({ error: "Purchase order has no items" });
        return;
      }

      const itemStates = poItems.map((item) => {
        const ordered = Number(item.quantity_ordered) || 0;
        const alreadyReceived = Number(item.quantity_received) || 0;
        const outstanding = Math.max(ordered - alreadyReceived, 0);
        return {
          ...item,
          ordered,
          alreadyReceived,
          outstanding,
        };
      });

      const totalOrderedQty = itemStates.reduce((sum, item) => sum + item.ordered, 0);
      const currentReceivedQty = itemStates.reduce((sum, item) => sum + item.alreadyReceived, 0);
      const totalOutstandingQty = itemStates.reduce((sum, item) => sum + item.outstanding, 0);

      if (totalOrderedQty <= 0) {
        res.status(400).json({ error: "Purchase order has invalid item quantities" });
        return;
      }

      if (totalOutstandingQty <= 0) {
        res.status(400).json({ error: "Purchase order is already fully received" });
        return;
      }

      const bodyQuantityRaw = req.body?.quantity_received;
      const bodyQuantityParsed = bodyQuantityRaw === undefined ? null : parseQuantityInput(bodyQuantityRaw);
      if (
        bodyQuantityRaw !== undefined &&
        bodyQuantityRaw !== null &&
        !(typeof bodyQuantityRaw === "string" && bodyQuantityRaw.trim() === "") &&
        bodyQuantityParsed === null
      ) {
        res.status(400).json({ error: "Quantity received must be a valid whole number" });
        return;
      }

      const quantityToReceive = bodyQuantityParsed === null ? totalOutstandingQty : bodyQuantityParsed;

      if (!Number.isInteger(quantityToReceive) || quantityToReceive <= 0) {
        res.status(400).json({ error: "Quantity received must be greater than 0" });
        return;
      }

      const newTotalReceivedQty = currentReceivedQty + quantityToReceive;
      const excessQuantity = Math.max(quantityToReceive - totalOutstandingQty, 0);
      const nextStatus: "partially_received" | "received" =
        newTotalReceivedQty >= totalOrderedQty ? "received" : "partially_received";

      // Atomic status lock: current state -> partially_received/received (CAS)
      // Prevents race conditions from double-click or concurrent requests
      const receiveNow = new Date().toISOString();
      const { data: locked, error: lockError } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: nextStatus,
          received_at: nextStatus === "received" ? receiveNow : null,
          received_by: nextStatus === "received" ? req.user!.id : null,
          receipt_reference_number: resolvedReference,
          quantity_received: newTotalReceivedQty,
        })
        .eq("id", poId)
        .eq("status", po.status) // CAS: only update if still in fetched status
        .select("id")
        .maybeSingle();

      if (lockError) {
        res.status(500).json({ error: lockError.message });
        return;
      }

      if (!locked) {
        // Another request already transitioned this PO
        res.status(409).json({ error: "Purchase order was updated by another request. Please refresh and try again." });
        return;
      }

      // Stock-in for each PO item based on requested quantity
      let failedItem: string | null = null;
      let remainingQty = quantityToReceive;
      let affectedItemCount = 0;
      const updatedReceivedByItem: Record<string, number> = {};

      for (const item of itemStates) {
        if (remainingQty <= 0) break;
        if (item.outstanding <= 0) continue;

        const qtyForThisItem = Math.min(item.outstanding, remainingQty);

        // Create stock_movement record
        const { error: moveError } = await supabaseAdmin
          .from("stock_movements")
          .insert({
            inventory_item_id: item.inventory_item_id,
            movement_type: "stock_in",
            quantity: qtyForThisItem,
            reference_type: "purchase_order",
            reference_id: poId,
            reason: `Received from PO ${po.po_number} (Ref: ${resolvedReference})`,
            branch_id: po.branch_id,
            created_by: req.user!.id,
          });

        if (moveError) {
          failedItem = item.inventory_item_id;
          console.error(`Stock-in failed for item ${item.inventory_item_id}:`, moveError.message);
          break;
        }

        // Update quantity_received on the PO item
        const { error: updateItemError } = await supabaseAdmin
          .from("purchase_order_items")
          .update({ quantity_received: item.alreadyReceived + qtyForThisItem })
          .eq("id", item.id);

        if (updateItemError) {
          failedItem = item.inventory_item_id;
          console.error(`quantity_received update failed for item ${item.id}:`, updateItemError.message);
          break;
        }

        updatedReceivedByItem[item.id] = item.alreadyReceived + qtyForThisItem;
        remainingQty -= qtyForThisItem;
        affectedItemCount += 1;
      }

      if (!failedItem && remainingQty > 0) {
        const anchorItem = itemStates[0];

        const { error: excessMoveError } = await supabaseAdmin
          .from("stock_movements")
          .insert({
            inventory_item_id: anchorItem.inventory_item_id,
            movement_type: "stock_in",
            quantity: remainingQty,
            reference_type: "purchase_order",
            reference_id: poId,
            reason: `Excess received from PO ${po.po_number} (Ref: ${resolvedReference})`,
            branch_id: po.branch_id,
            created_by: req.user!.id,
          });

        if (excessMoveError) {
          failedItem = `${anchorItem.inventory_item_id}_excess`;
        } else {
          const anchorCurrentQty = updatedReceivedByItem[anchorItem.id] ?? anchorItem.alreadyReceived;
          const anchorNextQty = anchorCurrentQty + remainingQty;

          const { error: excessUpdateError } = await supabaseAdmin
            .from("purchase_order_items")
            .update({ quantity_received: anchorNextQty })
            .eq("id", anchorItem.id);

          if (excessUpdateError) {
            failedItem = `${anchorItem.inventory_item_id}_excess_update`;
          } else {
            updatedReceivedByItem[anchorItem.id] = anchorNextQty;
            affectedItemCount += 1;
            remainingQty = 0;
          }
        }
      }

      if (failedItem) {
        // Partial failure: status is already "received" but some items may not have stock movements.
        // The PO is locked from re-receive by the CAS above.
        res.status(500).json({
          error: `Purchase order marked as received, but stock-in failed for item ${failedItem}. Please check inventory movements and correct manually if needed.`,
        });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            po_number: po.po_number,
            status: nextStatus,
            items_received: affectedItemCount,
            receipt_reference_number: resolvedReference,
            quantity_received: newTotalReceivedQty,
            quantity_received_increment: quantityToReceive,
            excess_quantity: excessQuantity,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Fetch updated PO
      const { data: updatedPO } = await supabaseAdmin
        .from("purchase_orders")
        .select("*, suppliers(id, supplier_name), branches(id, name, code), purchase_order_items(*, inventory_items(id, item_name, sku_code, unit_of_measure))")
        .eq("id", poId)
        .single();

      res.json(updatedPO);
    } catch (error) {
      console.error("Receive purchase order error:", error);
      await logFailedAction(
        req,
        "RECEIVE",
        "PURCHASE_ORDER",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to receive purchase order"
      );
      res.status(500).json({ error: "Failed to receive purchase order" });
    }
  }
);

// --- PATCH /api/purchase-orders/:id/cancel -----------------------------
// Cancel a PO (draft or submitted only)
router.patch(
  "/:id/cancel",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (!["draft", "submitted"].includes(po.status)) {
        res.status(400).json({
          error: `Cannot cancel a purchase order with status "${po.status}"`,
        });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ status: "cancelled" })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { po_number: po.po_number, status: "cancelled" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Purchase order ${po.po_number} has been cancelled` });
    } catch (error) {
      console.error("Cancel purchase order error:", error);
      res.status(500).json({ error: "Failed to cancel purchase order" });
    }
  }
);

// --- DELETE /api/purchase-orders/:id -----------------------------------
// Hard delete if draft, deactivate otherwise
// Roles: HM, POC, JS, R
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("id, po_number, branch_id, status")
        .eq("id", poId)
        .neq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Hard delete: if status is "draft"
      if (po.status === "draft") {
        // Delete PO items first
        await supabaseAdmin
          .from("purchase_order_items")
          .delete()
          .eq("purchase_order_id", poId);

        // Delete the PO itself
        const { error: deleteError } = await supabaseAdmin
          .from("purchase_orders")
          .delete()
          .eq("id", poId);

        if (deleteError) {
          res.status(500).json({ error: deleteError.message });
          return;
        }

        // Audit
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "DELETE",
            p_entity_type: "PURCHASE_ORDER",
            p_entity_id: poId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: {
              po_number: po.po_number,
              type: "hard_delete",
              deleted_by: req.user!.id,
              deleted_at: new Date().toISOString(),
            },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: `Purchase order "${po.po_number}" deleted permanently` });
        return;
      }

      // Deactivate: PO has progressed beyond "draft"
      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ status: "deactivated" as any })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            po_number: po.po_number,
            status: "deactivated",
            previous_status: po.status,
            type: "deactivation",
            deactivated_by: req.user!.id,
            deactivated_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Purchase order "${po.po_number}" deactivated (has progressed beyond draft)` });
    } catch (error) {
      console.error("Delete purchase order error:", error);
      await logFailedAction(
        req,
        "DELETE",
        "PURCHASE_ORDER",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to delete purchase order"
      );
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  }
);

// --- PATCH /api/purchase-orders/:id/restore ---------------------------
// Restore a deactivated PO to its previous status
// Roles: HM, POC, JS, R
router.patch(
  "/:id/restore",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const poId = req.params.id as string;

      const { data: po, error: fetchError } = await supabaseAdmin
        .from("purchase_orders")
        .select("id, po_number, branch_id, status")
        .eq("id", poId)
        .eq("status", "deactivated")
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Deactivated purchase order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(po.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      let restoredStatus: (typeof RESTORABLE_PO_STATUSES)[number] | null = null;

      const { data: auditTrail } = await supabaseAdmin
        .from("audit_logs")
        .select("action, new_values")
        .eq("entity_type", "PURCHASE_ORDER")
        .eq("entity_id", poId)
        .order("created_at", { ascending: false })
        .limit(30);

      const deactivationAudit = (auditTrail || []).find((log: any) => {
        const values = (log.new_values ?? null) as Record<string, unknown> | null;
        return log.action === "PO_DEACTIVATED" || (log.action === "UPDATE" && values?.type === "deactivation");
      });

      const newValues = (deactivationAudit?.new_values ?? null) as Record<string, unknown> | null;
      if (newValues && isRestorablePurchaseOrderStatus(newValues.previous_status)) {
        restoredStatus = newValues.previous_status;
      }

      if (!restoredStatus) {
        const latestStatusAction = (auditTrail || []).find((log: any) => {
          if (!["CANCEL", "APPROVE", "SUBMIT", "CREATE", "UPDATE"].includes(log.action)) return false;

          const values = (log.new_values ?? null) as Record<string, unknown> | null;
          const type = typeof values?.type === "string" ? values.type : null;

          // Ignore lifecycle-neutral update entries during status reconstruction.
          return type !== "deactivation" && type !== "hard_delete" && type !== "restoration";
        });

        restoredStatus = mapPoActionToStatus(
          latestStatusAction?.action,
          (latestStatusAction?.new_values ?? null) as Record<string, unknown> | null
        );
      }

      if (!restoredStatus) {
        restoredStatus = "submitted";
      }

      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ status: restoredStatus })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            po_number: po.po_number,
            status: restoredStatus,
            restored_by: req.user!.id,
            restored_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Purchase order ${po.po_number} restored to ${restoredStatus}` });
    } catch (error) {
      console.error("Restore purchase order error:", error);
      await logFailedAction(
        req,
        "PO_RESTORED",
        "PURCHASE_ORDER",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to restore purchase order"
      );
      res.status(500).json({ error: "Failed to restore purchase order" });
    }
  }
);

export default router;
