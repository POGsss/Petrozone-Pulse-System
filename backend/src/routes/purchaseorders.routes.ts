import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All purchase-order routes require authentication
router.use(requireAuth);

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Compute on-hand quantity from the stock_movements ledger.
 */
async function getOnHandSingle(itemId: string): Promise<number> {
  const { data: movements } = await supabaseAdmin
    .from("stock_movements")
    .select("movement_type, quantity")
    .eq("inventory_item_id", itemId);

  let qty = 0;
  for (const m of movements ?? []) {
    if (m.movement_type === "stock_in") qty += m.quantity;
    else if (m.movement_type === "stock_out") qty -= m.quantity;
  }
  return qty;
}

/**
 * Recalculate and persist total_amount on a purchase order from its items.
 */
async function recalcTotal(poId: string): Promise<number> {
  const { data: items } = await supabaseAdmin
    .from("purchase_order_items")
    .select("quantity_ordered, unit_cost")
    .eq("purchase_order_id", poId);

  const total = (items ?? []).reduce(
    (sum: number, i: { quantity_ordered: number; unit_cost: number }) =>
      sum + i.quantity_ordered * i.unit_cost,
    0
  );

  await supabaseAdmin
    .from("purchase_orders")
    .update({ total_amount: total })
    .eq("id", poId);

  return total;
}

// â”€â”€â”€ GET /api/purchase-orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// List purchase orders â€” UC50
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
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      // Branch scoping
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (status) query = query.eq("status", status as string);
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

// â”€â”€â”€ GET /api/purchase-orders/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Get single PO with items â€” UC50
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
        .eq("is_deleted", false)
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

// â”€â”€â”€ POST /api/purchase-orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create PO â€” UC49
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
        if (supplier) {
          resolvedSupplierName = supplier.supplier_name;
        }
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
          po_number: po_number?.trim() || "", // trigger will auto-generate if empty
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

// â”€â”€â”€ PUT /api/purchase-orders/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Update PO â€” UC51 (only draft/submitted can be edited)
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
        .eq("is_deleted", false)
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
        // No real changes â€” return existing data without triggering an update
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

// â”€â”€â”€ PATCH /api/purchase-orders/:id/submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Transition PO from draft â†’ submitted
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
        .eq("is_deleted", false)
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
          p_action: "SUBMIT",
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

// â”€â”€â”€ PATCH /api/purchase-orders/:id/approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Approve PO â€” submitted â†’ approved (locks from editing)
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
        .eq("is_deleted", false)
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
          p_action: "APPROVE",
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

// â”€â”€â”€ PATCH /api/purchase-orders/:id/receive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Receive PO â€” stock-in logic (FR-6 stock-in rules)
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
        .eq("is_deleted", false)
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

      if (po.status !== "approved") {
        res.status(400).json({
          error: "Only approved purchase orders can be received",
        });
        return;
      }

      const poItems = po.purchase_order_items || [];
      if (poItems.length === 0) {
        res.status(400).json({ error: "Purchase order has no items" });
        return;
      }

      // â”€â”€ Stock-in for each PO item (atomic per item) â”€â”€
      for (const item of poItems) {
        const qtyToReceive = item.quantity_ordered - item.quantity_received;
        if (qtyToReceive <= 0) continue; // already fully received

        // Create stock_movement record â€” reference_type = "purchase_order"
        const { error: moveError } = await supabaseAdmin
          .from("stock_movements")
          .insert({
            inventory_item_id: item.inventory_item_id,
            movement_type: "stock_in",
            quantity: qtyToReceive,
            reference_type: "purchase_order",
            reference_id: poId,
            reason: `Received from PO ${po.po_number}`,
            branch_id: po.branch_id,
            created_by: req.user!.id,
          });

        if (moveError) {
          res.status(500).json({
            error: `Failed to record stock-in for item ${item.inventory_item_id}: ${moveError.message}`,
          });
          return;
        }

        // Update quantity_received on the PO item
        const { error: updateItemError } = await supabaseAdmin
          .from("purchase_order_items")
          .update({ quantity_received: item.quantity_ordered })
          .eq("id", item.id);

        if (updateItemError) {
          res.status(500).json({ error: updateItemError.message });
          return;
        }
      }

      // Update PO status to received
      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "received",
          received_at: new Date().toISOString(),
          received_by: req.user!.id,
        })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "RECEIVE",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            po_number: po.po_number,
            status: "received",
            items_received: poItems.length,
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

// â”€â”€â”€ PATCH /api/purchase-orders/:id/cancel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        .eq("is_deleted", false)
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
          p_action: "CANCEL",
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

// â”€â”€â”€ DELETE /api/purchase-orders/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Soft-delete PO â€” UC52
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
        .eq("is_deleted", false)
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

      // Cannot delete received POs â€” they have stock movements
      if (po.status === "received") {
        res.status(400).json({
          error: "Cannot delete a received purchase order. Cancel it instead if needed.",
        });
        return;
      }

      // Soft delete
      const { error: updateError } = await supabaseAdmin
        .from("purchase_orders")
        .update({ is_deleted: true, status: "cancelled" })
        .eq("id", poId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
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
            status: "cancelled",
            is_deleted: true,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Purchase order "${po.po_number}" has been deleted` });
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

export default router;
