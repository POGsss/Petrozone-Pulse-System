import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser } from "../lib/auditLogger.js";
import { deductStockForJobOrder, restoreStockForJobOrder } from "./inventory.routes.js";

const router = Router();

// All job order routes require authentication
router.use(requireAuth);

/**
 * GET /api/job-orders
 * List job orders with filtering and pagination
 * HM sees all; others see only their branch-scoped orders
 * Roles: HM, POC, JS, R, T (view)
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        customer_id,
        vehicle_id,
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          third_party_repairs(cost)
        `,
          { count: "exact" }
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see only their branches
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      // Apply filters
      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (customer_id) {
        query = query.eq("customer_id", customer_id as string);
      }
      if (vehicle_id) {
        query = query.eq("vehicle_id", vehicle_id as string);
      }
      if (status) {
        query = query.eq(
          "status",
          status as "created" | "pending" | "approved" | "rejected" | "cancelled"
        );
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `order_number.ilike.${searchTerm},notes.ilike.${searchTerm}`
        );
      }

      // Apply pagination
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
        data: orders,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get job orders error:", error);
      res.status(500).json({ error: "Failed to fetch job orders" });
    }
  }
);

/**
 * GET /api/job-orders/:id
 * Get a single job order by ID with its items
 * Roles: HM, POC, JS, R, T
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      const { data: order, error } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(order.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      res.json(order);
    } catch (error) {
      console.error("Get job order error:", error);
      res.status(500).json({ error: "Failed to fetch job order" });
    }
  }
);

/**
 * POST /api/job-orders
 * Create a new job order with items
 * Roles: POC, JS, R (create)
 */
router.post(
  "/",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { customer_id, vehicle_id, branch_id, notes, items, vehicle_class } = req.body;

      // Validation
      if (!customer_id) {
        res.status(400).json({ error: "Customer is required" });
        return;
      }
      if (!vehicle_id) {
        res.status(400).json({ error: "Vehicle is required" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "At least one item is required" });
        return;
      }

      // Validate vehicle_class
      const VALID_VEHICLE_CLASSES = ["light", "heavy", "extra_heavy"];
      if (!vehicle_class || !VALID_VEHICLE_CLASSES.includes(vehicle_class)) {
        res.status(400).json({
          error: `vehicle_class is required and must be one of: ${VALID_VEHICLE_CLASSES.join(", ")}`,
        });
        return;
      }

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Verify customer exists
      const { data: customer, error: custError } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .single();
      if (custError || !customer) {
        res.status(400).json({ error: "Customer not found" });
        return;
      }

      // Verify vehicle exists and belongs to customer
      const { data: vehicle, error: vehError } = await supabaseAdmin
        .from("vehicles")
        .select("id, customer_id")
        .eq("id", vehicle_id)
        .single();
      if (vehError || !vehicle) {
        res.status(400).json({ error: "Vehicle not found" });
        return;
      }
      if (vehicle.customer_id !== customer_id) {
        res.status(400).json({ error: "Vehicle does not belong to the selected customer" });
        return;
      }

      // Validate items and compute totals
      let totalAmount = 0;
      const orderItems: Array<{
        catalog_item_id: string;
        catalog_item_name: string;
        catalog_item_type: string;
        quantity: number;
        labor_price: number;
        inventory_cost: number;
        line_total: number;
        _inventory_links: Array<{
          inventory_item_id: string;
          inventory_item_name: string;
          quantity: number;
          unit_cost: number;
        }>;
      }> = [];

      for (const item of items) {
        if (!item.catalog_item_id) {
          res.status(400).json({ error: "Catalog item ID is required for each item" });
          return;
        }
        const qty = item.quantity || 1;
        if (qty < 1) {
          res.status(400).json({ error: "Quantity must be at least 1" });
          return;
        }

        // Resolve catalog item
        const { data: catalogItem, error: catError } = await supabaseAdmin
          .from("catalog_items")
          .select("id, name")
          .eq("id", item.catalog_item_id)
          .single();

        if (catError || !catalogItem) {
          res.status(400).json({ error: `Catalog item not found: ${item.catalog_item_id}` });
          return;
        }

        // Get active pricing matrix for this catalog item
        const { data: pricingMatrix } = await supabaseAdmin
          .from("pricing_matrices")
          .select("*")
          .eq("catalog_item_id", item.catalog_item_id)
          .eq("status", "active")
          .maybeSingle();

        // Select labor price based on vehicle_class
        let laborPrice = 0;
        if (pricingMatrix) {
          const priceKey = `${vehicle_class}_price` as "light_price" | "heavy_price" | "extra_heavy_price";
          laborPrice = pricingMatrix[priceKey] || 0;
        }

        // Fetch catalog inventory template links
        const { data: templateLinks } = await supabaseAdmin
          .from("catalog_inventory_links")
          .select("inventory_item_id, inventory_items(id, item_name, cost_price, branch_id, status)")
          .eq("catalog_item_id", item.catalog_item_id);

        const catalogTemplateIds = (templateLinks ?? []).map((l: any) => l.inventory_item_id);

        // User-provided inventory quantities
        const userInventoryQuantities: Array<{ inventory_item_id: string; quantity: number }> =
          item.inventory_quantities || [];

        // Validate: user cannot add inventory items outside catalog template
        for (const uiq of userInventoryQuantities) {
          if (!catalogTemplateIds.includes(uiq.inventory_item_id)) {
            res.status(400).json({
              error: `Inventory item ${uiq.inventory_item_id} is not in the catalog template for ${catalogItem.name}`,
            });
            return;
          }
        }

        // Validate: all template items must be present
        for (const templateId of catalogTemplateIds) {
          const found = userInventoryQuantities.find((uiq: any) => uiq.inventory_item_id === templateId);
          if (!found) {
            res.status(400).json({
              error: `Missing inventory quantity for template item ${templateId} in catalog ${catalogItem.name}. All template items must be included.`,
            });
            return;
          }
        }

        // Compute inventory cost and build snapshot details
        let inventoryCost = 0;
        const invLinkDetails: Array<{
          inventory_item_id: string;
          inventory_item_name: string;
          quantity: number;
          unit_cost: number;
        }> = [];

        for (const uiq of userInventoryQuantities) {
          const userQty = uiq.quantity || 0;
          if (userQty < 0) {
            res.status(400).json({ error: "Inventory quantity cannot be negative" });
            return;
          }

          const templateLink = (templateLinks ?? []).find((l: any) => l.inventory_item_id === uiq.inventory_item_id);
          const invItem = templateLink?.inventory_items as any;
          if (!invItem) continue;

          const unitCost = invItem.cost_price || 0;
          inventoryCost += unitCost * userQty;

          invLinkDetails.push({
            inventory_item_id: invItem.id,
            inventory_item_name: invItem.item_name,
            quantity: userQty,
            unit_cost: unitCost,
          });
        }

        // New formula: line_total = (labor_price + inventory_cost) * quantity
        const lineTotal = (laborPrice + inventoryCost) * qty;

        orderItems.push({
          catalog_item_id: catalogItem.id,
          catalog_item_name: catalogItem.name,
          catalog_item_type: "labor_package",
          quantity: qty,
          labor_price: laborPrice,
          inventory_cost: inventoryCost,
          line_total: lineTotal,
          _inventory_links: invLinkDetails,
        });

        totalAmount += lineTotal;
      }

      // Create job order (order_number is auto-generated by DB trigger)
      const { data: order, error: orderError } = await supabaseAdmin
        .from("job_orders")
        .insert({
          order_number: "", // overwritten by BEFORE INSERT trigger
          customer_id,
          vehicle_id,
          branch_id,
          vehicle_class,
          notes: notes?.trim() || null,
          total_amount: totalAmount,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code)
        `
        )
        .single();

      if (orderError) {
        res.status(500).json({ error: orderError.message });
        return;
      }

      // Insert order items (strip _inventory_links before DB insert)
      const itemsToInsert = orderItems.map(({ _inventory_links, ...item }) => ({
        ...item,
        job_order_id: order.id,
      }));

      const { data: insertedItems, error: itemsError } = await supabaseAdmin
        .from("job_order_items")
        .insert(itemsToInsert)
        .select("*");

      if (itemsError) {
        // Rollback: delete the order if items fail
        await supabaseAdmin.from("job_orders").delete().eq("id", order.id);
        res.status(500).json({ error: "Failed to create order items: " + itemsError.message });
        return;
      }

      // Insert inventory snapshots for each JO item with linked inventory
      const inventorySnapshots: Array<{
        job_order_item_id: string;
        inventory_item_id: string;
        inventory_item_name: string;
        quantity: number;
        unit_cost: number;
        line_total: number;
      }> = [];

      for (let i = 0; i < orderItems.length; i++) {
        const joItem = insertedItems![i];
        if (!joItem) continue;
        const orderItem = orderItems[i]!;
        const links = orderItem._inventory_links;
        if (!links) continue;
        for (const link of links) {
          // quantity is the user-entered quantity per item, multiplied by JO item quantity
          const effectiveQty = link.quantity * orderItem.quantity;
          inventorySnapshots.push({
            job_order_item_id: joItem.id,
            inventory_item_id: link.inventory_item_id,
            inventory_item_name: link.inventory_item_name,
            quantity: effectiveQty,
            unit_cost: link.unit_cost,
            line_total: effectiveQty * link.unit_cost,
          });
        }
      }

      if (inventorySnapshots.length > 0) {
        await supabaseAdmin
          .from("job_order_item_inventories")
          .insert(inventorySnapshots);
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("JOB_ORDER", order.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      // Fetch complete order with inventory details
      const { data: completeOrder } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", order.id)
        .single();

      res.status(201).json(completeOrder || { ...order, job_order_items: insertedItems });
    } catch (error) {
      console.error("Create job order error:", error);
      await logFailedAction(req, "CREATE", "JOB_ORDER", null, error instanceof Error ? error.message : "Failed to create job order");
      res.status(500).json({ error: "Failed to create job order" });
    }
  }
);

/**
 * PUT /api/job-orders/:id
 * Update a job order (notes, and items when status allows)
 * Items can be modified when status is "created" or "rejected"
 * Roles: POC, JS, R, T
 */
router.put(
  "/:id",
  requireRoles("POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { notes } = req.body;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, notes")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Check if notes actually changed
      const newNotes = notes?.trim() || null;
      if (newNotes === (existing as any).notes) {
        // No real changes â€” return existing data without triggering an update
        const { data: current } = await supabaseAdmin
          .from("job_orders")
          .select(`*, customers(id, full_name, contact_number, email), vehicles(id, plate_number, model, vehicle_type), branches(id, name, code), job_order_items(*, job_order_item_inventories(*))`)
          .eq("id", orderId)
          .eq("is_deleted", false)
          .single();
        res.json(current);
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ notes: newNotes })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "UPDATE",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { notes: newNotes },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Update job order error:", error);
      await logFailedAction(req, "UPDATE", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to update job order");
      res.status(500).json({ error: "Failed to update job order" });
    }
  }
);

/**
 * DELETE /api/job-orders/:id
 * Conditional delete:
 *   - Hard delete if status is "created" (draft) — cascades items, snapshots, repairs
 *   - Soft delete (is_deleted: true) for all other statuses
 * Roles: POC, JS, R
 */
router.delete(
  "/:id",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, order_number, status")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Hard delete: if status is "created" (draft), cascade delete items, snapshots, repairs
      if (existing.status === "created") {
        // Delete inventory snapshots for all JO items first
        const { data: joItems } = await supabaseAdmin
          .from("job_order_items")
          .select("id")
          .eq("job_order_id", orderId);

        if (joItems && joItems.length > 0) {
          const itemIds = joItems.map((i: any) => i.id);
          await supabaseAdmin
            .from("job_order_item_inventories")
            .delete()
            .in("job_order_item_id", itemIds);
        }

        // Delete job order items
        await supabaseAdmin
          .from("job_order_items")
          .delete()
          .eq("job_order_id", orderId);

        // Delete third-party repairs
        await supabaseAdmin
          .from("third_party_repairs")
          .delete()
          .eq("job_order_id", orderId);

        // Delete the job order itself
        const { error: deleteError } = await supabaseAdmin
          .from("job_orders")
          .delete()
          .eq("id", orderId);

        if (deleteError) {
          res.status(500).json({ error: deleteError.message });
          return;
        }

        // Log hard delete
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "DELETE",
            p_entity_type: "JOB_ORDER",
            p_entity_id: orderId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { order_number: existing.order_number, deleted: true, type: "hard_delete" },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: `Job order ${existing.order_number} deleted permanently` });
        return;
      }

      // Soft delete: JO has progressed beyond "created"
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ is_deleted: true })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Log soft delete
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, is_deleted: true, type: "soft_delete" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Job order ${existing.order_number} deleted successfully` });
    } catch (error) {
      console.error("Delete job order error:", error);
      await logFailedAction(req, "DELETE", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to delete job order");
      res.status(500).json({ error: "Failed to delete job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/request-approval
 * Request customer approval for a job order
 * Changes status from "created" to "pending"
 * Roles: R, T (and POC, JS for flexibility)
 */
router.patch(
  "/:id/request-approval",
  requireRoles("POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Validate status transition: "created" or "rejected" â†’ "pending"
      if (existing.status !== "created" && existing.status !== "rejected") {
        res.status(400).json({
          error: `Cannot request approval for a job order with status "${existing.status}". Only "created" or "rejected" orders can be sent for approval.`,
        });
        return;
      }

      // Update status
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ status: "pending" })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "REQUEST_APPROVAL",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, status: "pending" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Request approval error:", error);
      await logFailedAction(req, "REQUEST_APPROVAL", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to request approval");
      res.status(500).json({ error: "Failed to request approval" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/record-approval
 * Record customer approval or rejection for a job order
 * Changes status from "pending" to "approved" or "rejected"
 * Roles: R, T (and POC, JS for flexibility)
 */
router.patch(
  "/:id/record-approval",
  requireRoles("POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { decision } = req.body;

      // Validate decision
      if (!decision || !["approved", "rejected"].includes(decision)) {
        res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
        return;
      }

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Validate status transition: only "pending" â†’ "approved" / "rejected"
      if (existing.status !== "pending") {
        res.status(400).json({
          error: `Cannot record approval for a job order with status "${existing.status}". Only "pending" orders can be approved or rejected.`,
        });
        return;
      }

      // FR-3: If approving, check and deduct inventory stock first
      if (decision === "approved") {
        // Fetch JO items to check stock
        const { data: joItems } = await supabaseAdmin
          .from("job_order_items")
          .select("catalog_item_id, catalog_item_name, catalog_item_type, quantity")
          .eq("job_order_id", orderId);

        if (joItems && joItems.length > 0) {
          const deductResult = await deductStockForJobOrder(
            orderId,
            existing.branch_id,
            joItems,
            req.user!.id
          );

          if (!deductResult.success) {
            res.status(400).json({
              error: deductResult.error || "Insufficient stock to approve this job order",
            });
            return;
          }
        }
      }

      // Update status and approval fields
      const updatePayload: Record<string, unknown> = {
        status: decision,
        approved_at: new Date().toISOString(),
        approved_by: req.user!.id,
      };

      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update(updatePayload)
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: decision === "approved" ? "APPROVE" : "REJECT",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            status: decision,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Record approval error:", error);
      const bodyDecision = req.body?.decision;
      const action = typeof bodyDecision === "string" && bodyDecision === "approved" ? "APPROVE" : "REJECT";
      await logFailedAction(req, action, "JOB_ORDER", req.params.id as string || null, error instanceof Error ? error.message : "Failed to record approval");
      res.status(500).json({ error: "Failed to record approval" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/cancel
 * Cancel a job order (status â†’ "cancelled")
 * Only "created", "pending", or "rejected" orders can be cancelled
 * Roles: POC, JS, R
 */
router.patch(
  "/:id/cancel",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Validate status: only created, pending, rejected, or approved can be cancelled
      const cancellableStatuses = ["created", "pending", "rejected", "approved"];
      if (!cancellableStatuses.includes(existing.status)) {
        res.status(400).json({
          error: `Cannot cancel a job order with status "${existing.status}". Only created, pending, rejected, or approved orders can be cancelled.`,
        });
        return;
      }

      // FR-3: If cancelling an approved order, restore deducted stock
      if (existing.status === "approved") {
        try {
          await restoreStockForJobOrder(orderId, existing.branch_id, req.user!.id);
        } catch (restoreErr) {
          console.error("Stock restoration error:", restoreErr);
        }
      }

      // Update status
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "CANCEL",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, status: "cancelled" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Cancel job order error:", error);
      await logFailedAction(req, "CANCEL", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to cancel job order");
      res.status(500).json({ error: "Failed to cancel job order" });
    }
  }
);

/**
 * POST /api/job-orders/:id/items
 * Add an item to an existing job order and recalculate totals
 * Only "created" or "rejected" orders can be modified
 * Roles: POC, JS, R
 */
router.post(
  "/:id/items",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { catalog_item_id, quantity, inventory_quantities } = req.body;

      if (!catalog_item_id) {
        res.status(400).json({ error: "Catalog item ID is required" });
        return;
      }
      const qty = quantity || 1;
      if (qty < 1) {
        res.status(400).json({ error: "Quantity must be at least 1" });
        return;
      }

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, total_amount")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Only editable statuses
      const editableStatuses = ["created", "rejected"];
      if (!editableStatuses.includes(existing.status)) {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}". Only "created" or "rejected" orders can be edited.`,
        });
        return;
      }

      // Resolve catalog item
      const { data: catalogItem, error: catError } = await supabaseAdmin
        .from("catalog_items")
        .select("id, name")
        .eq("id", catalog_item_id)
        .single();

      if (catError || !catalogItem) {
        res.status(400).json({ error: `Catalog item not found: ${catalog_item_id}` });
        return;
      }

      // Get the JO's vehicle_class
      const { data: orderForClass } = await supabaseAdmin
        .from("job_orders")
        .select("vehicle_class")
        .eq("id", orderId)
        .single();
      const joVehicleClass = orderForClass?.vehicle_class || "light";

      // Get active pricing matrix
      const { data: pricingMatrix } = await supabaseAdmin
        .from("pricing_matrices")
        .select("*")
        .eq("catalog_item_id", catalog_item_id)
        .eq("status", "active")
        .maybeSingle();

      let laborPrice = 0;
      if (pricingMatrix) {
        const priceKey = `${joVehicleClass}_price` as "light_price" | "heavy_price" | "extra_heavy_price";
        laborPrice = pricingMatrix[priceKey] || 0;
      }

      // Fetch catalog inventory template links
      const { data: templateLinks } = await supabaseAdmin
        .from("catalog_inventory_links")
        .select("inventory_item_id, inventory_items(id, item_name, cost_price, branch_id, status)")
        .eq("catalog_item_id", catalog_item_id);

      const catalogTemplateIds = (templateLinks ?? []).map((l: any) => l.inventory_item_id);

      // User-provided inventory quantities
      const userInventoryQuantities: Array<{ inventory_item_id: string; quantity: number }> =
        inventory_quantities || [];

      // Validate: user cannot add items outside template
      for (const uiq of userInventoryQuantities) {
        if (!catalogTemplateIds.includes(uiq.inventory_item_id)) {
          res.status(400).json({
            error: `Inventory item ${uiq.inventory_item_id} is not in the catalog template for ${catalogItem.name}`,
          });
          return;
        }
      }

      // Validate: all template items must be present
      for (const templateId of catalogTemplateIds) {
        if (!userInventoryQuantities.find((uiq: any) => uiq.inventory_item_id === templateId)) {
          res.status(400).json({
            error: `Missing inventory quantity for template item ${templateId} in catalog ${catalogItem.name}`,
          });
          return;
        }
      }

      // Compute inventory cost
      let inventoryCost = 0;
      const invLinkDetails: Array<{
        inventory_item_id: string;
        inventory_item_name: string;
        quantity: number;
        unit_cost: number;
      }> = [];

      for (const uiq of userInventoryQuantities) {
        const userQty = uiq.quantity || 0;
        if (userQty < 0) {
          res.status(400).json({ error: "Inventory quantity cannot be negative" });
          return;
        }
        const templateLink = (templateLinks ?? []).find((l: any) => l.inventory_item_id === uiq.inventory_item_id);
        const invItem = templateLink?.inventory_items as any;
        if (!invItem) continue;

        const unitCost = invItem.cost_price || 0;
        inventoryCost += unitCost * userQty;
        invLinkDetails.push({
          inventory_item_id: invItem.id,
          inventory_item_name: invItem.item_name,
          quantity: userQty,
          unit_cost: unitCost,
        });
      }

      const lineTotal = (laborPrice + inventoryCost) * qty;

      // Insert the item
      const { data: newItem, error: insertError } = await supabaseAdmin
        .from("job_order_items")
        .insert({
          job_order_id: orderId,
          catalog_item_id: catalogItem.id,
          catalog_item_name: catalogItem.name,
          catalog_item_type: "labor_package",
          quantity: qty,
          labor_price: laborPrice,
          inventory_cost: inventoryCost,
          line_total: lineTotal,
        })
        .select("*")
        .single();

      if (insertError) {
        res.status(500).json({ error: insertError.message });
        return;
      }

      // Insert inventory snapshots for this JO item
      if (invLinkDetails.length > 0) {
        const snapshots = invLinkDetails.map((link) => ({
          job_order_item_id: newItem.id,
          inventory_item_id: link.inventory_item_id,
          inventory_item_name: link.inventory_item_name,
          quantity: link.quantity * qty,
          unit_cost: link.unit_cost,
          line_total: link.quantity * qty * link.unit_cost,
        }));
        await supabaseAdmin.from("job_order_item_inventories").insert(snapshots);
      }

      // Recalculate total
      const { data: allItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const newTotal = (allItems || []).reduce((sum: number, item: { line_total: number }) => sum + item.line_total, 0);

      await supabaseAdmin
        .from("job_orders")
        .update({ total_amount: newTotal })
        .eq("id", orderId);

      // Return updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      res.status(201).json(updated);
    } catch (error) {
      console.error("Add job order item error:", error);
      res.status(500).json({ error: "Failed to add item to job order" });
    }
  }
);

/**
 * PUT /api/job-orders/:id/items/:itemId
 * Update an item's quantity on an existing job order and recalculate
 * Only "created" or "rejected" orders can be modified
 * Roles: POC, JS, R
 */
router.put(
  "/:id/items/:itemId",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;
      const { quantity, inventory_quantities } = req.body;

      if (!quantity || quantity < 1) {
        res.status(400).json({ error: "Quantity must be at least 1" });
        return;
      }

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Only editable statuses
      const editableStatuses = ["created", "rejected"];
      if (!editableStatuses.includes(existing.status)) {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}".`,
        });
        return;
      }

      // Get existing item
      const { data: item, error: itemError } = await supabaseAdmin
        .from("job_order_items")
        .select("*")
        .eq("id", itemId)
        .eq("job_order_id", orderId)
        .single();

      if (itemError || !item) {
        res.status(404).json({ error: "Item not found in this job order" });
        return;
      }

      // If inventory_quantities provided, update individual snapshot quantities
      let inventoryCost = item.inventory_cost || 0;
      if (inventory_quantities && Array.isArray(inventory_quantities) && inventory_quantities.length > 0) {
        const { data: existingSnapshots } = await supabaseAdmin
          .from("job_order_item_inventories")
          .select("*")
          .eq("job_order_item_id", itemId);

        if (existingSnapshots && existingSnapshots.length > 0) {
          // Update each snapshot with the user-provided per-unit quantity
          for (const snap of existingSnapshots) {
            const userEntry = inventory_quantities.find(
              (iq: { inventory_item_id: string; quantity: number }) => iq.inventory_item_id === snap.inventory_item_id
            );
            if (userEntry) {
              const perUnitQty = userEntry.quantity;
              const effectiveQty = perUnitQty * quantity;
              const snapLineTotal = effectiveQty * snap.unit_cost;
              await supabaseAdmin
                .from("job_order_item_inventories")
                .update({ quantity: effectiveQty, line_total: snapLineTotal })
                .eq("id", snap.id);
            }
          }
          // Recalculate inventory_cost from the per-unit quantities
          inventoryCost = inventory_quantities.reduce(
            (sum: number, iq: { inventory_item_id: string; quantity: number }) => {
              const snap = existingSnapshots.find((s) => s.inventory_item_id === iq.inventory_item_id);
              return sum + (snap ? snap.unit_cost * iq.quantity : 0);
            },
            0
          );
        }
      } else {
        // No inventory_quantities provided — just scale existing snapshots proportionally
        const { data: existingSnapshots } = await supabaseAdmin
          .from("job_order_item_inventories")
          .select("*")
          .eq("job_order_item_id", itemId);

        if (existingSnapshots && existingSnapshots.length > 0 && item.quantity !== quantity) {
          for (const snap of existingSnapshots) {
            const perUnit = snap.quantity / item.quantity;
            const newSnapQty = perUnit * quantity;
            const newSnapLineTotal = newSnapQty * snap.unit_cost;
            await supabaseAdmin
              .from("job_order_item_inventories")
              .update({ quantity: newSnapQty, line_total: newSnapLineTotal })
              .eq("id", snap.id);
          }
        }
      }

      // Recalculate line total with (potentially updated) inventory cost
      const unitPrice = (item.labor_price || 0) + inventoryCost;
      const newLineTotal = unitPrice * quantity;

      await supabaseAdmin
        .from("job_order_items")
        .update({ quantity, inventory_cost: inventoryCost, line_total: newLineTotal })
        .eq("id", itemId);

      // Recalculate order total
      const { data: allItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const newTotal = (allItems || []).reduce((sum: number, i: { line_total: number }) => sum + i.line_total, 0);

      await supabaseAdmin
        .from("job_orders")
        .update({ total_amount: newTotal })
        .eq("id", orderId);

      // Return updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      res.json(updated);
    } catch (error) {
      console.error("Update job order item error:", error);
      res.status(500).json({ error: "Failed to update job order item" });
    }
  }
);

/**
 * DELETE /api/job-orders/:id/items/:itemId
 * Remove an item from an existing job order and recalculate
 * Only "created" or "rejected" orders can be modified
 * Must have at least 1 item remaining
 * Roles: POC, JS, R
 */
router.delete(
  "/:id/items/:itemId",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      // Only editable statuses
      const editableStatuses = ["created", "rejected"];
      if (!editableStatuses.includes(existing.status)) {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}".`,
        });
        return;
      }

      // Check item count â€” must have at least 1 remaining
      const { count } = await supabaseAdmin
        .from("job_order_items")
        .select("id", { count: "exact", head: true })
        .eq("job_order_id", orderId);

      if ((count || 0) <= 1) {
        res.status(400).json({ error: "Cannot remove the last item. A job order must have at least one item." });
        return;
      }

      // Delete the item
      const { error: deleteError } = await supabaseAdmin
        .from("job_order_items")
        .delete()
        .eq("id", itemId)
        .eq("job_order_id", orderId);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      // Recalculate order total
      const { data: remainingItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const newTotal = (remainingItems || []).reduce((sum: number, i: { line_total: number }) => sum + i.line_total, 0);

      await supabaseAdmin
        .from("job_orders")
        .update({ total_amount: newTotal })
        .eq("id", orderId);

      // Return updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `
          *,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))
        `
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      res.json(updated);
    } catch (error) {
      console.error("Delete job order item error:", error);
      res.status(500).json({ error: "Failed to remove item from job order" });
    }
  }
);

/**
 * GET /api/job-orders/:id/history
 * Get audit history for a specific job order
 * Roles: HM, POC, JS, R, T
 */
router.get(
  "/:id/history",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { data: logs, error } = await supabaseAdmin
        .from("audit_logs")
        .select(
          `
          *,
          user_profiles:user_id(id, full_name, email)
        `
        )
        .eq("entity_type", "JOB_ORDER")
        .eq("entity_id", orderId)
        .order("created_at", { ascending: true });

      if (error) {
      }

      res.json(logs || []);
    } catch (error) {
      console.error("Get job order history error:", error);
      res.status(500).json({ error: "Failed to fetch job order history" });
    }
  }
);

export default router;
