import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();
const PO_NUMBER_PATTERN = /^PO-[A-Z0-9]+-[0-9]{1,6}$/;

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
        query = query.eq("status", status as string);
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
          .select("supplier_name, branch_id")
          .eq("id", supplier_id)
          .single();
        if (!supplier) {
          res.status(400).json({ error: "Supplier not found" });
          return;
        }
        if (supplier.branch_id !== branch_id) {
          res.status(400).json({ error: "Supplier does not belong to the selected branch" });
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

      // Atomic status lock: approved -> received (CAS)
      // Prevents race conditions from double-click or concurrent requests
      const receiveNow = new Date().toISOString();
      const { data: locked, error: lockError } = await supabaseAdmin
        .from("purchase_orders")
        .update({
          status: "received",
          received_at: receiveNow,
          received_by: req.user!.id,
        })
        .eq("id", poId)
        .eq("status", "approved") // CAS: only update if still approved
        .select("id")
        .maybeSingle();

      if (lockError) {
        res.status(500).json({ error: lockError.message });
        return;
      }

      if (!locked) {
        // Another request already transitioned this PO
        res.status(409).json({ error: "Purchase order is already being received or has been received" });
        return;
      }

      // Stock-in for each PO item
      // Status is already "received" so retries will be rejected by CAS above
      let failedItem: string | null = null;
      for (const item of poItems) {
        const qtyToReceive = item.quantity_ordered - item.quantity_received;
        if (qtyToReceive <= 0) continue; // already fully received

        // Create stock_movement record
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
          failedItem = item.inventory_item_id;
          console.error(`Stock-in failed for item ${item.inventory_item_id}:`, moveError.message);
          break;
        }

        // Update quantity_received on the PO item
        const { error: updateItemError } = await supabaseAdmin
          .from("purchase_order_items")
          .update({ quantity_received: item.quantity_ordered })
          .eq("id", item.id);

        if (updateItemError) {
          failedItem = item.inventory_item_id;
          console.error(`quantity_received update failed for item ${item.id}:`, updateItemError.message);
          break;
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
          p_action: "PO_DEACTIVATED",
          p_entity_type: "PURCHASE_ORDER",
          p_entity_id: poId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            po_number: po.po_number,
            status: "deactivated",
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

export default router;
