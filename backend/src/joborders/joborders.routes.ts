import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction } from "../lib/auditLogger.js";

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
          branches(id, name, code)
        `,
          { count: "exact" }
        )
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
        query = query.eq("status", status as string);
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
          job_order_items(*)
        `
        )
        .eq("id", orderId)
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
      const { customer_id, vehicle_id, branch_id, notes, items } = req.body;

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
        base_price: number;
        labor_price: number | null;
        packaging_price: number | null;
        line_total: number;
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

        // Resolve pricing for this catalog item + branch
        const { data: catalogItem, error: catError } = await supabaseAdmin
          .from("catalog_items")
          .select("id, name, type, base_price")
          .eq("id", item.catalog_item_id)
          .single();

        if (catError || !catalogItem) {
          res.status(400).json({ error: `Catalog item not found: ${item.catalog_item_id}` });
          return;
        }

        // Get pricing rules for this item + branch
        const { data: pricingRules } = await supabaseAdmin
          .from("pricing_matrices")
          .select("*")
          .eq("catalog_item_id", item.catalog_item_id)
          .eq("branch_id", branch_id)
          .eq("status", "active");

        const laborRule = pricingRules?.find((r: { pricing_type: string }) => r.pricing_type === "labor");
        const packagingRule = pricingRules?.find((r: { pricing_type: string }) => r.pricing_type === "packaging");

        const basePrice = catalogItem.base_price;
        const laborPrice = laborRule ? laborRule.price : null;
        const packagingPrice = packagingRule ? packagingRule.price : null;
        const lineTotal = (basePrice + (laborPrice || 0) + (packagingPrice || 0)) * qty;

        orderItems.push({
          catalog_item_id: catalogItem.id,
          catalog_item_name: catalogItem.name,
          catalog_item_type: catalogItem.type,
          quantity: qty,
          base_price: basePrice,
          labor_price: laborPrice,
          packaging_price: packagingPrice,
          line_total: lineTotal,
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

      // Insert order items
      const itemsToInsert = orderItems.map((item) => ({
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

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "JOB_ORDER")
        .eq("entity_id", order.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json({
        ...order,
        job_order_items: insertedItems,
      });
    } catch (error) {
      console.error("Create job order error:", error);
      await logFailedAction(req, "CREATE", "JOB_ORDER", null, error instanceof Error ? error.message : "Failed to create job order");
      res.status(500).json({ error: "Failed to create job order" });
    }
  }
);

/**
 * PUT /api/job-orders/:id
 * Update a job order (notes only — items are immutable after creation)
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
        .select("id, branch_id")
        .eq("id", orderId)
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

      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ notes: notes?.trim() || null })
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
          job_order_items(*)
        `
        )
        .eq("id", orderId)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "JOB_ORDER")
        .eq("entity_id", orderId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(updated);
    } catch (error) {
      console.error("Update job order error:", error);
      await logFailedAction(req, "UPDATE", "JOB_ORDER", req.params.id || null, error instanceof Error ? error.message : "Failed to update job order");
      res.status(500).json({ error: "Failed to update job order" });
    }
  }
);

/**
 * DELETE /api/job-orders/:id
 * Delete a job order and its items
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
        .select("id, branch_id, order_number")
        .eq("id", orderId)
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

      // Delete items first (foreign key constraint)
      await supabaseAdmin
        .from("job_order_items")
        .delete()
        .eq("job_order_id", orderId);

      // Delete order
      const { error: deleteError } = await supabaseAdmin
        .from("job_orders")
        .delete()
        .eq("id", orderId);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      res.json({ message: `Job order ${existing.order_number} deleted successfully` });

      // Log deletion
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, branch_id: existing.branch_id },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }
    } catch (error) {
      console.error("Delete job order error:", error);
      await logFailedAction(req, "DELETE", "JOB_ORDER", req.params.id || null, error instanceof Error ? error.message : "Failed to delete job order");
      res.status(500).json({ error: "Failed to delete job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/request-approval
 * Request customer approval for a job order
 * Changes status from "created" to "pending_approval"
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

      // Validate status transition: only "created" → "pending_approval"
      if (existing.status !== "created") {
        res.status(400).json({
          error: `Cannot request approval for a job order with status "${existing.status}". Only "created" orders can be sent for approval.`,
        });
        return;
      }

      // Update status
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ status: "pending_approval" })
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
          job_order_items(*)
        `
        )
        .eq("id", orderId)
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
          p_new_values: { order_number: existing.order_number, status: "pending_approval" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Request approval error:", error);
      await logFailedAction(req, "REQUEST_APPROVAL", "JOB_ORDER", req.params.id || null, error instanceof Error ? error.message : "Failed to request approval");
      res.status(500).json({ error: "Failed to request approval" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/record-approval
 * Record customer approval or rejection for a job order
 * Changes status from "pending_approval" to "approved" or "rejected"
 * Roles: R, T (and POC, JS for flexibility)
 */
router.patch(
  "/:id/record-approval",
  requireRoles("POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { decision, notes } = req.body;

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

      // Validate status transition: only "pending_approval" → "approved" / "rejected"
      if (existing.status !== "pending_approval") {
        res.status(400).json({
          error: `Cannot record approval for a job order with status "${existing.status}". Only "pending_approval" orders can be approved or rejected.`,
        });
        return;
      }

      // Update status and approval fields
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: decision,
          approved_at: new Date().toISOString(),
          approved_by: req.user!.id,
          approval_notes: notes?.trim() || null,
        })
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
          job_order_items(*)
        `
        )
        .eq("id", orderId)
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
            approval_notes: notes?.trim() || null,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Record approval error:", error);
      const action = typeof decision === "string" && decision === "approved" ? "APPROVE" : "REJECT";
      await logFailedAction(req, action, "JOB_ORDER", req.params.id || null, error instanceof Error ? error.message : "Failed to record approval");
      res.status(500).json({ error: "Failed to record approval" });
    }
  }
);

export default router;
