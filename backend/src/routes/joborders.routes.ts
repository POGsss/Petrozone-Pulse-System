import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser } from "../lib/auditLogger.js";
import { deductStockForJobOrder, restoreStockForJobOrder } from "./inventory.routes.js";
import { createJobOrderNotification } from "./notifications.routes.js";

const router = Router();

// All job order routes require authentication
router.use(requireAuth);

type VehicleClass = "light" | "heavy" | "extra_heavy";
type JobOrderLineType = "labor" | "package" | "inventory";

interface IncomingJobOrderLine {
  id?: string;
  line_type: JobOrderLineType;
  reference_id?: string | null;
  quantity?: number;
  vehicle_specific_components?: {
    labor?: Array<{ labor_item_id: string; quantity?: number }>;
    inventory?: Array<{ inventory_item_id: string; quantity?: number }>;
  };
}

interface ResolvedJobOrderLine {
  line_type: JobOrderLineType;
  reference_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  metadata: Record<string, unknown>;
}

const ORDER_SELECT_WITH_LINES = `
  *,
  customers(id, full_name, contact_number, email),
  vehicles(id, plate_number, model, vehicle_type),
  branches(id, name, code),
  job_order_items(*, job_order_item_inventories(*)),
  job_order_lines(*),
  assigned_technician:user_profiles!job_orders_assigned_technician_id_fkey(id, full_name, email)
`;

function getLaborPriceByClass(
  labor: { light_price: number; heavy_price: number; extra_heavy_price: number },
  vehicleClass: VehicleClass
): number {
  if (vehicleClass === "heavy") return labor.heavy_price || 0;
  if (vehicleClass === "extra_heavy") return labor.extra_heavy_price || 0;
  return labor.light_price || 0;
}

async function resolveIncomingLines(
  lines: IncomingJobOrderLine[],
  branchId: string,
  vehicleClass: VehicleClass
): Promise<ResolvedJobOrderLine[]> {
  const resolved: ResolvedJobOrderLine[] = [];

  for (const line of lines) {
    const qty = Number(line.quantity ?? 1);
    if (Number.isNaN(qty) || qty <= 0) {
      throw new Error("Line quantity must be greater than 0");
    }

    if (line.line_type === "labor") {
      if (!line.reference_id) throw new Error("Labor line requires reference_id");

      const { data: laborItem } = await supabaseAdmin
        .from("labor_items")
        .select("id, name, status, light_price, heavy_price, extra_heavy_price")
        .eq("id", line.reference_id)
        .single();

      if (!laborItem || laborItem.status !== "active") {
        throw new Error("Labor item not found or inactive");
      }

      const unitPrice = getLaborPriceByClass(laborItem, vehicleClass);
      resolved.push({
        line_type: "labor",
        reference_id: laborItem.id,
        name: laborItem.name,
        quantity: qty,
        unit_price: unitPrice,
        total: unitPrice * qty,
        metadata: {
          source: "labor_items",
          price_class: vehicleClass,
        },
      });
      continue;
    }

    if (line.line_type === "inventory") {
      if (!line.reference_id) throw new Error("Inventory line requires reference_id");

      const { data: invItem } = await supabaseAdmin
        .from("inventory_items")
        .select("id, item_name, cost_price, status, branch_id")
        .eq("id", line.reference_id)
        .single();

      if (!invItem || invItem.status !== "active") {
        throw new Error("Inventory item not found or inactive");
      }

      if (invItem.branch_id !== branchId) {
        throw new Error("Inventory item does not belong to the selected branch");
      }

      const unitPrice = Number(invItem.cost_price || 0);
      resolved.push({
        line_type: "inventory",
        reference_id: invItem.id,
        name: invItem.item_name,
        quantity: qty,
        unit_price: unitPrice,
        total: unitPrice * qty,
        metadata: {
          source: "inventory_items",
        },
      });
      continue;
    }

    if (line.line_type === "package") {
      if (!line.reference_id) throw new Error("Package line requires reference_id");

      const { data: packageItem } = await supabaseAdmin
        .from("package_items")
        .select("id, name, status")
        .eq("id", line.reference_id)
        .single();

      if (!packageItem || packageItem.status !== "active") {
        throw new Error("Package item not found or inactive");
      }

      const [pkgLaborLinksRes, pkgInventoryLinksRes] = await Promise.all([
        supabaseAdmin
          .from("package_labor_items")
          .select("quantity, labor_items(id, name, light_price, heavy_price, extra_heavy_price, status)")
          .eq("package_id", packageItem.id),
        supabaseAdmin
          .from("package_inventory_items")
          .select("quantity, inventory_items(id, item_name, cost_price, status, branch_id)")
          .eq("package_id", packageItem.id),
      ]);

      const baseLaborComponents: Array<{ labor_item_id: string; name: string; quantity: number; unit_price: number }> = [];
      const baseInventoryComponents: Array<{ inventory_item_id: string; name: string; quantity: number; unit_price: number }> = [];

      let unitPrice = 0;

      for (const link of pkgLaborLinksRes.data || []) {
        const labor = (link as any).labor_items;
        if (!labor || labor.status !== "active") continue;
        const compQty = Number((link as any).quantity || 1);
        const compUnit = getLaborPriceByClass(labor, vehicleClass);
        unitPrice += compQty * compUnit;
        baseLaborComponents.push({
          labor_item_id: labor.id,
          name: labor.name,
          quantity: compQty,
          unit_price: compUnit,
        });
      }

      for (const link of pkgInventoryLinksRes.data || []) {
        const inv = (link as any).inventory_items;
        if (!inv || inv.status !== "active") continue;
        if (inv.branch_id !== branchId) continue;
        const compQty = Number((link as any).quantity || 1);
        const compUnit = Number(inv.cost_price || 0);
        unitPrice += compQty * compUnit;
        baseInventoryComponents.push({
          inventory_item_id: inv.id,
          name: inv.item_name,
          quantity: compQty,
          unit_price: compUnit,
        });
      }

      const extraLabor: Array<{ labor_item_id: string; name: string; quantity: number; unit_price: number }> = [];
      const extraInventory: Array<{ inventory_item_id: string; name: string; quantity: number; unit_price: number }> = [];

      for (const extra of line.vehicle_specific_components?.labor || []) {
        const extraQty = Number(extra.quantity ?? 1);
        if (!extra.labor_item_id || Number.isNaN(extraQty) || extraQty <= 0) continue;

        const { data: labor } = await supabaseAdmin
          .from("labor_items")
          .select("id, name, status, light_price, heavy_price, extra_heavy_price")
          .eq("id", extra.labor_item_id)
          .single();

        if (!labor || labor.status !== "active") continue;
        const compUnit = getLaborPriceByClass(labor, vehicleClass);
        unitPrice += extraQty * compUnit;
        extraLabor.push({
          labor_item_id: labor.id,
          name: labor.name,
          quantity: extraQty,
          unit_price: compUnit,
        });
      }

      for (const extra of line.vehicle_specific_components?.inventory || []) {
        const extraQty = Number(extra.quantity ?? 1);
        if (!extra.inventory_item_id || Number.isNaN(extraQty) || extraQty <= 0) continue;

        const { data: inv } = await supabaseAdmin
          .from("inventory_items")
          .select("id, item_name, cost_price, status, branch_id")
          .eq("id", extra.inventory_item_id)
          .single();

        if (!inv || inv.status !== "active" || inv.branch_id !== branchId) continue;
        const compUnit = Number(inv.cost_price || 0);
        unitPrice += extraQty * compUnit;
        extraInventory.push({
          inventory_item_id: inv.id,
          name: inv.item_name,
          quantity: extraQty,
          unit_price: compUnit,
        });
      }

      resolved.push({
        line_type: "package",
        reference_id: packageItem.id,
        name: packageItem.name,
        quantity: qty,
        unit_price: unitPrice,
        total: unitPrice * qty,
        metadata: {
          vehicle_class: vehicleClass,
          base_components: {
            labor: baseLaborComponents,
            inventory: baseInventoryComponents,
          },
          vehicle_specific_components: {
            labor: extraLabor,
            inventory: extraInventory,
          },
        },
      });
      continue;
    }

    throw new Error("Unsupported line type");
  }

  return resolved;
}

async function recalculateJobOrderTotal(jobOrderId: string): Promise<number> {
  const { data: lines } = await supabaseAdmin
    .from("job_order_lines")
    .select("total")
    .eq("job_order_id", jobOrderId);

  const { data: repairs } = await supabaseAdmin
    .from("third_party_repairs")
    .select("cost")
    .eq("job_order_id", jobOrderId)
    .eq("is_deleted", false);

  const linesTotal = (lines || []).reduce((sum, l: any) => sum + Number(l.total || 0), 0);
  const repairsTotal = (repairs || []).reduce((sum, r: any) => sum + Number(r.cost || 0), 0);
  const grandTotal = linesTotal + repairsTotal;

  await supabaseAdmin.from("job_orders").update({ total_amount: grandTotal }).eq("id", jobOrderId);
  return grandTotal;
}

async function deductStockForJobOrderLines(jobOrderId: string, branchId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const { data: lines } = await supabaseAdmin
    .from("job_order_lines")
    .select("line_type, reference_id, quantity, metadata")
    .eq("job_order_id", jobOrderId);

  const deductions: Record<string, number> = {};

  for (const line of lines || []) {
    const qty = Number((line as any).quantity || 0);
    if (qty <= 0) continue;

    if ((line as any).line_type === "inventory") {
      const invId = (line as any).reference_id as string | null;
      if (invId) deductions[invId] = (deductions[invId] || 0) + qty;
      continue;
    }

    if ((line as any).line_type === "package") {
      const meta = ((line as any).metadata || {}) as any;
      const baseInv: any[] = meta?.base_components?.inventory || [];
      const extraInv: any[] = meta?.vehicle_specific_components?.inventory || [];
      for (const comp of [...baseInv, ...extraInv]) {
        const invId = comp.inventory_item_id as string | undefined;
        const compQty = Number(comp.quantity || 0);
        if (!invId || compQty <= 0) continue;
        deductions[invId] = (deductions[invId] || 0) + compQty * qty;
      }
    }
  }

  for (const [inventoryItemId, neededQty] of Object.entries(deductions)) {
    const { data: onHand, error: onHandError } = await supabaseAdmin
      .from("inventory_on_hand")
      .select("current_quantity")
      .eq("inventory_item_id", inventoryItemId)
      .maybeSingle();

    if (onHandError) {
      return { success: false, error: onHandError.message };
    }

    const available = Number((onHand as any)?.current_quantity || 0);
    if (available < neededQty) {
      return {
        success: false,
        error: `Insufficient stock. Inventory item ${inventoryItemId} requires ${neededQty}, available ${available}.`,
      };
    }

    const { error } = await supabaseAdmin.from("stock_movements").insert({
      inventory_item_id: inventoryItemId,
      movement_type: "stock_out" as "stock_in" | "stock_out" | "adjustment",
      quantity: neededQty,
      reference_type: "job_order" as "purchase_order" | "job_order" | "adjustment",
      reference_id: jobOrderId,
      reason: "Auto-deduction for Job Order",
      branch_id: branchId,
      created_by: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: true };
}

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
        include_deleted,
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
          job_order_items(line_total),
          job_order_lines(total),
          third_party_repairs(cost)
        `,
          { count: "exact" }
        );

      // Filter by deletion/deactivation status
      if (include_deleted === "true") {
        // Show all including soft-deactivated records
      } else if (status === "deactivated") {
        // Show only deactivated
        query = query.eq("is_deleted", true);
      } else {
        query = query.eq("is_deleted", false);
      }

      query = query.order("created_at", { ascending: false });

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
      if (status && status !== "deleted" && status !== "deactivated") {
        query = query.eq(
          "status",
          status as "draft" | "pending_approval" | "approved" | "in_progress" | "ready_for_release" | "completed" | "rejected" | "cancelled"
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

      const normalizedOrders = (orders || []).map((order: any) =>
        order.is_deleted ? { ...order, status: "deactivated" } : order
      );

      res.json({
        data: normalizedOrders,
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
 * POST /api/job-orders/rework
 * Create a new backorder (rework) job order linked to a completed job order.
 * Roles: HM, POC, JS, R
 */
router.post(
  "/rework",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        reference_job_order_id,
        rework_reason,
        is_free_rework,
        vehicle_bay,
      } = req.body as {
        reference_job_order_id?: string;
        rework_reason?: string;
        is_free_rework?: boolean;
        vehicle_bay?: string;
      };

      if (!reference_job_order_id) {
        res.status(400).json({ error: "reference_job_order_id is required." });
        return;
      }

      if (!rework_reason || !rework_reason.trim()) {
        res.status(400).json({ error: "rework_reason is required for rework jobs." });
        return;
      }

      const { data: original, error: originalError } = await supabaseAdmin
        .from("job_orders")
        .select("id, order_number, branch_id, status, customer_id, vehicle_id, vehicle_class, odometer_reading, vehicle_bay")
        .eq("id", reference_job_order_id)
        .eq("is_deleted", false)
        .single();

      if (originalError || !original) {
        if (originalError?.code === "PGRST116") {
          res.status(404).json({ error: "Referenced job order not found." });
          return;
        }
        res.status(500).json({ error: originalError?.message || "Failed to verify referenced job order." });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(original.branch_id)
      ) {
        res.status(403).json({ error: "No access to the referenced job order's branch." });
        return;
      }

      if (original.status !== "completed") {
        res.status(400).json({ error: "Rework can only be created from a completed job order." });
        return;
      }

      const now = new Date().toISOString();
      const freeRework = is_free_rework ?? true;
      const effectiveTotal = freeRework ? 0 : Number((original as any).total_amount || 0);
      const selectedBay = vehicle_bay?.trim() || original.vehicle_bay || null;

      const { data: created, error: createError } = await supabaseAdmin
        .from("job_orders")
        .insert({
          order_number: "",
          customer_id: original.customer_id,
          vehicle_id: original.vehicle_id,
          branch_id: original.branch_id,
          vehicle_class: original.vehicle_class,
          notes: null,
          total_amount: effectiveTotal,
          odometer_reading: original.odometer_reading,
          vehicle_bay: selectedBay,
          created_by: req.user!.id,
          status: "pending_approval",
          approval_status: "REQUESTED",
          approval_requested_at: now,
          job_type: "backorder",
          reference_job_order_id: original.id,
          rework_reason: rework_reason.trim(),
          is_free_rework: freeRework,
        })
        .select("id, order_number")
        .single();

      if (createError || !created) {
        res.status(500).json({ error: createError?.message || "Failed to create rework job order." });
        return;
      }

      const { data: createdOrder, error: fetchCreatedError } = await supabaseAdmin
        .from("job_orders")
        .select(ORDER_SELECT_WITH_LINES)
        .eq("id", created.id)
        .single();

      if (fetchCreatedError) {
        res.status(500).json({ error: fetchCreatedError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "REWORK_CREATED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: created.id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || original.branch_id,
          p_new_values: {
            order_number: created.order_number,
            job_type: "backorder",
            status: "pending_approval",
            approval_status: "REQUESTED",
            reference_job_order_id: original.id,
            reference_order_number: original.order_number,
            rework_reason: rework_reason.trim(),
            is_free_rework: freeRework,
            vehicle_bay: selectedBay,
            total_amount: effectiveTotal,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      await createJobOrderNotification(
        created.order_number,
        created.id,
        original.branch_id,
        "draft",
        "pending_approval",
        req.user!.id,
        "Rework"
      );

      res.status(201).json(createdOrder);
    } catch (error) {
      console.error("Create rework job order error:", error);
      await logFailedAction(
        req,
        "REWORK_CREATED",
        "JOB_ORDER",
        null,
        error instanceof Error ? error.message : "Failed to create rework job order"
      );
      res.status(500).json({ error: "Failed to create rework job order" });
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
        .select(ORDER_SELECT_WITH_LINES)
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

      const normalizedOrder = order?.is_deleted
        ? { ...order, status: "deactivated" }
        : order;

      res.json(normalizedOrder);
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
      const { customer_id, vehicle_id, branch_id, notes, items, lines, vehicle_class, odometer_reading, vehicle_bay } = req.body;

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
      if (odometer_reading === undefined || odometer_reading === null || String(odometer_reading).trim() === "") {
        res.status(400).json({ error: "Odometer reading is required" });
        return;
      }
      const hasLegacyItems = Array.isArray(items) && items.length > 0;
      const hasLineItems = Array.isArray(lines) && lines.length > 0;
      if (!hasLegacyItems && !hasLineItems) {
        res.status(400).json({ error: "At least one line is required" });
        return;
      }

      const parsedOdometerReading = parseInt(String(odometer_reading), 10);
      if (isNaN(parsedOdometerReading) || parsedOdometerReading < 0) {
        res.status(400).json({ error: "Odometer reading must be a non-negative number" });
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

      // Module 3 flow: create line-based job order
      if (hasLineItems) {
        let resolvedLines: ResolvedJobOrderLine[] = [];
        try {
          resolvedLines = await resolveIncomingLines(lines as IncomingJobOrderLine[], branch_id, vehicle_class as VehicleClass);
        } catch (lineErr) {
          res.status(400).json({ error: lineErr instanceof Error ? lineErr.message : "Failed to resolve job order lines" });
          return;
        }

        const totalAmount = resolvedLines.reduce((sum, l) => sum + l.total, 0);

        const { data: order, error: orderError } = await supabaseAdmin
          .from("job_orders")
          .insert({
            order_number: "",
            customer_id,
            vehicle_id,
            branch_id,
            vehicle_class,
            notes: notes?.trim() || null,
            total_amount: totalAmount,
            odometer_reading: parsedOdometerReading,
            vehicle_bay: vehicle_bay?.trim() || null,
            created_by: req.user!.id,
          })
          .select("id, order_number")
          .single();

        if (orderError || !order) {
          res.status(500).json({ error: orderError?.message || "Failed to create job order" });
          return;
        }

        const { error: linesError } = await supabaseAdmin
          .from("job_order_lines")
          .insert(
            resolvedLines.map((line) => ({
              job_order_id: order.id,
              line_type: line.line_type,
              reference_id: line.reference_id,
              name: line.name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.total,
              metadata: line.metadata as any,
            }))
          );

        if (linesError) {
          await supabaseAdmin.from("job_orders").delete().eq("id", order.id);
          res.status(500).json({ error: `Failed to create job order lines: ${linesError.message}` });
          return;
        }

        await fixAuditLogUser("JOB_ORDER", order.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "JO_CREATED",
            p_entity_type: "JOB_ORDER",
            p_entity_id: order.id,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { order_number: order.order_number, status: "draft", line_count: resolvedLines.length },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        const { data: completeOrder } = await supabaseAdmin
          .from("job_orders")
          .select(ORDER_SELECT_WITH_LINES)
          .eq("id", order.id)
          .single();

        res.status(201).json(completeOrder);
        return;
      }

      // Validate items and compute totals
      let totalAmount = 0;
      const orderItems: Array<{
        labor_item_id: string;
        package_item_id: string;
        package_item_name: string;
        package_item_type: string;
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
        if (!item.package_item_id) {
          res.status(400).json({ error: "Package item ID is required for each item" });
          return;
        }
        if (!item.labor_item_id) {
          res.status(400).json({ error: "Labor item ID is required for each item" });
          return;
        }
        const qty = item.quantity || 1;
        if (qty < 1) {
          res.status(400).json({ error: "Quantity must be at least 1" });
          return;
        }

        // Resolve package item
        const { data: packageItem, error: catError } = await supabaseAdmin
          .from("package_items")
          .select("id, name")
          .eq("id", item.package_item_id)
          .single();

        if (catError || !packageItem) {
          res.status(400).json({ error: `Package item not found: ${item.package_item_id}` });
          return;
        }

        // Resolve labor item directly (decoupled from package)
        const { data: laborItem, error: laborError } = await supabaseAdmin
          .from("labor_items")
          .select("id, light_price, heavy_price, extra_heavy_price, status")
          .eq("id", item.labor_item_id)
          .single();

        if (laborError || !laborItem) {
          res.status(400).json({ error: `Labor item not found: ${item.labor_item_id}` });
          return;
        }
        if (laborItem.status !== "active") {
          res.status(400).json({ error: `Labor item ${item.labor_item_id} is not active` });
          return;
        }

        const laborPrice =
          vehicle_class === "light"
            ? laborItem.light_price || 0
            : vehicle_class === "heavy"
              ? laborItem.heavy_price || 0
              : laborItem.extra_heavy_price || 0;

        // Fetch package inventory template links (legacy support)
        const { data: templateLinks } = await supabaseAdmin
          .from("package_inventory_items")
          .select("inventory_item_id, quantity, inventory_items(id, item_name, cost_price, branch_id, status)")
          .eq("package_id", item.package_item_id);

        const packageTemplateIds = (templateLinks ?? []).map((l: any) => l.inventory_item_id);

        // User-provided inventory quantities
        const userInventoryQuantities: Array<{ inventory_item_id: string; quantity: number }> =
          item.inventory_quantities || [];

        // Check if package uses inventory_types (new flow) or template links (legacy flow)
        const { data: catItemFull } = await supabaseAdmin
          .from("package_items")
          .select("inventory_types")
          .eq("id", item.package_item_id)
          .single();

        const hasInventoryTypes = catItemFull?.inventory_types && catItemFull.inventory_types.length > 0;

        if (hasInventoryTypes) {
          // New flow: validate that each provided inventory item matches a required category
          for (const uiq of userInventoryQuantities) {
            const { data: invItem } = await supabaseAdmin
              .from("inventory_items")
              .select("id, category, status")
              .eq("id", uiq.inventory_item_id)
              .single();
            if (!invItem) {
              res.status(400).json({ error: `Inventory item not found: ${uiq.inventory_item_id}` });
              return;
            }
            if (invItem.status !== "active") {
              res.status(400).json({ error: `Inventory item ${uiq.inventory_item_id} is not active` });
              return;
            }
            const requiredTypes = catItemFull.inventory_types || [];
            if (!requiredTypes.includes(invItem.category)) {
              res.status(400).json({
                error: `Inventory item category "${invItem.category}" is not required by package "${packageItem.name}". Required categories: ${requiredTypes.join(", ")}`,
              });
              return;
            }
          }
        } else {
          // Legacy flow: validate against package_inventory_links template
          for (const uiq of userInventoryQuantities) {
            if (!packageTemplateIds.includes(uiq.inventory_item_id)) {
              res.status(400).json({
                error: `Inventory item ${uiq.inventory_item_id} is not in the package template for ${packageItem.name}`,
              });
              return;
            }
          }

          // Validate: all template items must be present
          for (const templateId of packageTemplateIds) {
            const found = userInventoryQuantities.find((uiq: any) => uiq.inventory_item_id === templateId);
            if (!found) {
              res.status(400).json({
                error: `Missing inventory quantity for template item ${templateId} in package ${packageItem.name}. All template items must be included.`,
              });
              return;
            }
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

          // Look up the inventory item directly (works for both legacy and type-based flows)
          let invItem: any = null;
          if (!hasInventoryTypes) {
            const templateLink = (templateLinks ?? []).find((l: any) => l.inventory_item_id === uiq.inventory_item_id);
            invItem = templateLink?.inventory_items;
          }
          if (!invItem) {
            const { data: directItem } = await supabaseAdmin
              .from("inventory_items")
              .select("id, item_name, cost_price")
              .eq("id", uiq.inventory_item_id)
              .single();
            invItem = directItem;
          }
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
          labor_item_id: laborItem.id,
          package_item_id: packageItem.id,
          package_item_name: packageItem.name,
          package_item_type: "labor_package",
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
          odometer_reading: parsedOdometerReading,
          vehicle_bay: vehicle_bay?.trim() || null,
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

      // Audit log: JO_CREATED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "JO_CREATED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: order.id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: order.order_number, status: "draft" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Fetch complete order with inventory details
      const { data: completeOrder } = await supabaseAdmin
        .from("job_orders")
        .select(ORDER_SELECT_WITH_LINES)
        .eq("id", order.id)
        .single();

      res.status(201).json(completeOrder || { ...order, job_order_items: insertedItems });
    } catch (error) {
      console.error("Create job order error:", error);
      await logFailedAction(req, "JO_CREATED", "JOB_ORDER", null, error instanceof Error ? error.message : "Failed to create job order");
      res.status(500).json({ error: "Failed to create job order" });
    }
  }
);

/**
 * PUT /api/job-orders/:id
 * Update a job order notes (only when status is "draft")
 * Immutability rule: once past draft, the order is frozen.
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
        .select("id, branch_id, notes, status")
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

      // Immutability: only draft orders can have notes edited
      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot update a job order with status "${existing.status}". Only draft orders can be edited.`,
        });
        return;
      }

      // Check if notes actually changed
      const newNotes = notes?.trim() || null;
      if (newNotes === (existing as any).notes) {
        // No real changes — return existing data without triggering an update
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
          p_action: "JO_UPDATED",
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
      await logFailedAction(req, "JO_UPDATED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to update job order");
      res.status(500).json({ error: "Failed to update job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id
 * Update draft job order with optional notes and full line replacement.
 * Roles: POC, JS, R
 */
router.patch(
  "/:id",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { notes, lines } = req.body as { notes?: string | null; lines?: IncomingJobOrderLine[] };

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, vehicle_class")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (fetchError || !existing) {
        if (fetchError?.code === "PGRST116") {
          res.status(404).json({ error: "Job order not found" });
          return;
        }
        res.status(500).json({ error: fetchError?.message || "Failed to fetch job order" });
        return;
      }

      if (!req.user!.roles.includes("HM") && !req.user!.branchIds.includes(existing.branch_id)) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      if (existing.status !== "draft") {
        res.status(400).json({ error: "Only draft job orders can be edited." });
        return;
      }

      const updatePayload: Record<string, unknown> = {};
      if (notes !== undefined) {
        updatePayload.notes = notes?.trim() || null;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("job_orders")
          .update(updatePayload)
          .eq("id", orderId);
        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }
      }

      if (Array.isArray(lines)) {
        if (lines.length === 0) {
          res.status(400).json({ error: "At least one line is required" });
          return;
        }

        let resolvedLines: ResolvedJobOrderLine[] = [];
        try {
          resolvedLines = await resolveIncomingLines(lines, existing.branch_id, existing.vehicle_class as VehicleClass);
        } catch (lineErr) {
          res.status(400).json({ error: lineErr instanceof Error ? lineErr.message : "Failed to resolve lines" });
          return;
        }

        const { error: deleteLinesError } = await supabaseAdmin
          .from("job_order_lines")
          .delete()
          .eq("job_order_id", orderId);

        if (deleteLinesError) {
          res.status(500).json({ error: deleteLinesError.message });
          return;
        }

        const { error: insertLinesError } = await supabaseAdmin
          .from("job_order_lines")
          .insert(
            resolvedLines.map((line) => ({
              job_order_id: orderId,
              line_type: line.line_type,
              reference_id: line.reference_id,
              name: line.name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              total: line.total,
              metadata: line.metadata as any,
            }))
          );

        if (insertLinesError) {
          res.status(500).json({ error: insertLinesError.message });
          return;
        }
      }

      await recalculateJobOrderTotal(orderId);

      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(ORDER_SELECT_WITH_LINES)
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError || !updated) {
        res.status(500).json({ error: refetchError?.message || "Failed to fetch updated job order" });
        return;
      }

      res.json(updated);
    } catch (error) {
      console.error("Patch job order error:", error);
      res.status(500).json({ error: "Failed to patch job order" });
    }
  }
);

/**
 * DELETE /api/job-orders/:id
 * Conditional delete:
 *   - Hard delete if status is "draft" — cascades items, snapshots, repairs
 *   - Soft-deactivate (is_deleted = true) for all other statuses
 * Roles: POC, JS, R (DRAFT only per spec)
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

      // Hard delete: if status is "draft", cascade delete items, snapshots, repairs
      if (existing.status === "draft") {
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

        // Delete line-based items
        await supabaseAdmin
          .from("job_order_lines")
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

        // Log hard delete (JO_SOFT_DELETED event name kept for audit completeness)
        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "JO_SOFT_DELETED",
            p_entity_type: "JOB_ORDER",
            p_entity_id: orderId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { order_number: existing.order_number, deleted: true, type: "hard_delete", deleted_by: req.user!.id, deleted_at: new Date().toISOString() },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: `Job order ${existing.order_number} deleted permanently` });
        return;
      }

      // Deactivate: JO has progressed beyond "draft"
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          is_deleted: true,
          deleted_at: now,
          deleted_by: req.user!.id,
        })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Log deactivation
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "JO_DEACTIVATED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            status: existing.status,
            is_deleted: true,
            type: "deactivation",
            deactivated_by: req.user!.id,
            deactivated_at: now,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Job order ${existing.order_number} deactivated (has progressed beyond draft)` });
    } catch (error) {
      console.error("Delete job order error:", error);
      await logFailedAction(req, "JO_SOFT_DELETED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to delete job order");
      res.status(500).json({ error: "Failed to delete job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/restore
 * Restore a soft-deactivated job order by setting is_deleted=false
 * Roles: POC, JS, R
 */
router.patch(
  "/:id/restore",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order (must be soft-deactivated)
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, order_number, status, is_deleted")
        .eq("id", orderId)
        .eq("is_deleted", true)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Deactivated job order not found" });
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

      const { error: restoreError } = await supabaseAdmin
        .from("job_orders")
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
        })
        .eq("id", orderId);

      if (restoreError) {
        res.status(500).json({ error: restoreError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "JO_RESTORED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            status: existing.status,
            is_deleted: false,
            restored_by: req.user!.id,
            restored_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: `Job order ${existing.order_number} restored successfully` });
    } catch (error) {
      console.error("Restore job order error:", error);
      await logFailedAction(req, "JO_RESTORED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to restore job order");
      res.status(500).json({ error: "Failed to restore job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/request-approval
 * Request customer approval for a job order
 * Changes status from "draft" to "pending_approval"
 * Idempotent: if already pending_approval, allow "resend" without duplicate log
 * Roles: R, T
 */
router.patch(
  "/:id/request-approval",
  requireRoles("R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number, total_amount, approval_status")
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

      // Validate status transition: "created" or "rejected" → "pending"
      // Idempotent: if already pending_approval with REQUESTED status, allow resend
      if (existing.status === "pending_approval" && existing.approval_status === "REQUESTED") {
        const { data: current } = await supabaseAdmin
          .from("job_orders")
          .select(`*, customers(id, full_name, contact_number, email), vehicles(id, plate_number, model, vehicle_type), branches(id, name, code), job_order_items(*, job_order_item_inventories(*))`)
          .eq("id", orderId)
          .eq("is_deleted", false)
          .single();
        res.json(current);
        return;
      }

      // Validate status transition: only "draft" can go to "pending_approval"
      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot request approval for a job order with status "${existing.status}". Only draft orders can be sent for approval.`,
        });
        return;
      }

      // Precondition: at least one line item (Module 3 lines first, legacy fallback)
      const { count: lineCount } = await supabaseAdmin
        .from("job_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("job_order_id", orderId);

      let itemCount = lineCount || 0;
      if (itemCount < 1) {
        const { count: legacyCount } = await supabaseAdmin
          .from("job_order_items")
          .select("id", { count: "exact", head: true })
          .eq("job_order_id", orderId);
        itemCount = legacyCount || 0;
      }

      if (!itemCount || itemCount < 1) {
        res.status(400).json({ error: "Missing scope/total/contact or unresolved pricing. At least one line item is required." });
        return;
      }

      // Precondition: total_amount > 0
      if (!existing.total_amount || existing.total_amount <= 0) {
        res.status(400).json({ error: "Missing scope/total/contact or unresolved pricing. Total amount must be greater than zero." });
        return;
      }

      // Legacy unresolved-pricing check (only when order has legacy rows and no line-based rows)
      if ((lineCount || 0) < 1) {
        const { data: unresolvedItems } = await supabaseAdmin
          .from("job_order_items")
          .select("id, package_item_name, labor_price, inventory_cost")
          .eq("job_order_id", orderId)
          .eq("labor_price", 0)
          .eq("inventory_cost", 0);

        if (unresolvedItems && unresolvedItems.length > 0) {
          res.status(400).json({
            error: `Missing scope/total/contact or unresolved pricing. Items with zero pricing: ${unresolvedItems.map((i: any) => i.package_item_name).join(", ")}`,
          });
          return;
        }
      }

      // Update status and set approval fields
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: "pending_approval",
          approval_status: "REQUESTED",
          approval_requested_at: now,
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

      // Audit log: APPROVAL_REQUESTED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "APPROVAL_REQUESTED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, status: "pending_approval", approval_status: "REQUESTED", approval_requested_at: now },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Also log STATUS_CHANGED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "draft", to: "pending_approval" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for status change
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "draft", "pending_approval", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Request approval error:", error);
      await logFailedAction(req, "APPROVAL_REQUESTED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to request approval");
      res.status(500).json({ error: "Failed to request approval" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/record-approval
 * Record customer approval or rejection for a job order
 * Changes status from "pending_approval" to "approved" or "rejected"
 * Roles: R, T
 */
router.patch(
  "/:id/record-approval",
  requireRoles("R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { decision, rejection_reason, approval_method } = req.body;

      // Validate decision
      if (!decision || !["approved", "rejected"].includes(decision)) {
        res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
        return;
      }

      // Validate rejection_reason when rejecting
      if (decision === "rejected" && (!rejection_reason || !rejection_reason.trim())) {
        res.status(400).json({ error: "Provide rejection reason." });
        return;
      }

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number, approval_requested_at")
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

      // Validate status transition: only "pending_approval" can be approved/rejected
      if (existing.status !== "pending_approval") {
        res.status(400).json({
          error: `Cannot record approval for a job order with status "${existing.status}". Only pending_approval orders can be approved or rejected.`,
        });
        return;
      }

      // Timestamp coherence: approved_at must be >= approval_requested_at
      const now = new Date().toISOString();
      if (existing.approval_requested_at && new Date(now) < new Date(existing.approval_requested_at)) {
        res.status(400).json({ error: "Approval details incomplete. Timestamp coherence violation." });
        return;
      }

      // FR-3: If approving, check and deduct inventory stock first
      if (decision === "approved") {
        const { count: lineCount } = await supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("job_order_id", orderId);

        let deductResult: { success: boolean; error?: string } = { success: true };
        if ((lineCount || 0) > 0) {
          deductResult = await deductStockForJobOrderLines(orderId, existing.branch_id, req.user!.id);
        } else {
          const { data: joItems } = await supabaseAdmin
            .from("job_order_items")
            .select("package_item_id, package_item_name, package_item_type, quantity")
            .eq("job_order_id", orderId);

          if (joItems && joItems.length > 0) {
            deductResult = await deductStockForJobOrder(orderId, existing.branch_id, joItems, req.user!.id);
          }
        }

        if (!deductResult.success) {
          res.status(400).json({
            error: deductResult.error || "Insufficient stock to approve this job order",
          });
          return;
        }
      }

      // Update status and approval fields
      const updatePayload: Record<string, unknown> = {
        status: decision,
        approved_at: now,
        approved_by: req.user!.id,
        approval_status: decision === "approved" ? "APPROVED" : "REJECTED",
        approval_method: approval_method || null,
      };

      // Add rejection_reason if rejecting
      if (decision === "rejected") {
        updatePayload.rejection_reason = rejection_reason.trim();
      }

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

      // Audit log: APPROVAL_RECORDED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "APPROVAL_RECORDED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            status: decision,
            approval_status: decision === "approved" ? "APPROVED" : "REJECTED",
            approval_method: approval_method || null,
            rejection_reason: decision === "rejected" ? rejection_reason : null,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Also log STATUS_CHANGED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "pending_approval", to: decision },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for status change
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "pending_approval", decision, req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Record approval error:", error);
      const bodyDecision = req.body?.decision;
      const action = typeof bodyDecision === "string" && bodyDecision === "approved" ? "APPROVAL_RECORDED" : "APPROVAL_RECORDED";
      await logFailedAction(req, action, "JOB_ORDER", req.params.id as string || null, error instanceof Error ? error.message : "Failed to record approval");
      res.status(500).json({ error: "Failed to record approval" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/approve-rework
 * HM approval endpoint for rework/backorder job orders.
 * Roles: HM
 */
router.patch(
  "/:id/approve-rework",
  requireRoles("HM"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { decision, rejection_reason, approval_method } = req.body as {
        decision?: "approved" | "rejected";
        rejection_reason?: string;
        approval_method?: string;
      };

      if (!decision || !["approved", "rejected"].includes(decision)) {
        res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
        return;
      }

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, status, order_number, job_type, reference_job_order_id, approval_requested_at")
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

      if (existing.job_type !== "backorder") {
        res.status(400).json({ error: "approve-rework is only valid for backorder job orders." });
        return;
      }

      if (existing.status !== "pending_approval") {
        res.status(400).json({
          error: `Cannot record rework approval for status "${existing.status}". Only pending_approval backorders can be approved or rejected.`,
        });
        return;
      }

      const now = new Date().toISOString();
      if (existing.approval_requested_at && new Date(now) < new Date(existing.approval_requested_at)) {
        res.status(400).json({ error: "Approval details incomplete. Timestamp coherence violation." });
        return;
      }

      if (decision === "approved") {
        const { count: lineCount } = await supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("job_order_id", orderId);

        let deductResult: { success: boolean; error?: string } = { success: true };
        if ((lineCount || 0) > 0) {
          deductResult = await deductStockForJobOrderLines(orderId, existing.branch_id, req.user!.id);
        } else {
          const { data: joItems } = await supabaseAdmin
            .from("job_order_items")
            .select("package_item_id, package_item_name, package_item_type, quantity")
            .eq("job_order_id", orderId);

          if (joItems && joItems.length > 0) {
            deductResult = await deductStockForJobOrder(orderId, existing.branch_id, joItems, req.user!.id);
          }
        }

        if (!deductResult.success) {
          res.status(400).json({
            error: deductResult.error || "Insufficient stock to approve this rework job order",
          });
          return;
        }
      }

      const updatePayload: Record<string, unknown> = {
        status: decision,
        approved_at: now,
        approved_by: req.user!.id,
        approval_status: decision === "approved" ? "APPROVED" : "REJECTED",
        approval_method: approval_method || null,
        rejection_reason: decision === "rejected" ? rejection_reason?.trim() || null : null,
      };

      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update(updatePayload)
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(ORDER_SELECT_WITH_LINES)
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      const action = decision === "approved" ? "REWORK_APPROVED" : "REWORK_REJECTED";
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: action,
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            job_type: "backorder",
            status: decision,
            approval_status: decision === "approved" ? "APPROVED" : "REJECTED",
            reference_job_order_id: existing.reference_job_order_id,
            rejection_reason: decision === "rejected" ? rejection_reason?.trim() || null : null,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      await createJobOrderNotification(
        existing.order_number,
        orderId,
        existing.branch_id,
        "pending_approval",
        decision,
        req.user!.id,
        "Rework"
      );

      res.json(updated);
    } catch (error) {
      console.error("Approve rework error:", error);
      await logFailedAction(
        req,
        "APPROVAL_RECORDED",
        "JOB_ORDER",
        req.params.id as string,
        error instanceof Error ? error.message : "Failed to approve/reject rework"
      );
      res.status(500).json({ error: "Failed to approve/reject rework" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/cancel
 * Cancel a job order (status → "cancelled")
 * Only "created", "pending", or "rejected" orders can be cancelled
 * Roles: POC, JS, R
 */
router.patch(
  "/:id/cancel",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { cancellation_reason } = req.body;

      // Require cancellation reason
      if (!cancellation_reason || !cancellation_reason.trim()) {
        res.status(400).json({ error: "Provide cancellation reason." });
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

      // Validate status: only draft and pending_approval can be cancelled
      // Role enforcement: draft -> POC, JS, R; pending_approval -> POC, R
      const cancellableStatuses = ["draft", "pending_approval"];
      if (!cancellableStatuses.includes(existing.status)) {
        res.status(400).json({
          error: `Cannot cancel a job order with status "${existing.status}". Only draft or pending_approval orders can be cancelled.`,
        });
        return;
      }

      // Role enforcement per status
      if (existing.status === "pending_approval") {
        const allowedRolesForPending = ["POC", "R"];
        if (!req.user!.roles.some((r: string) => allowedRolesForPending.includes(r))) {
          res.status(403).json({ error: "Only POC and R roles can cancel a pending_approval order." });
          return;
        }
      }

      // Update status and cancellation fields
      const cancelNow = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: "cancelled",
          cancellation_reason: cancellation_reason.trim(),
          cancelled_at: cancelNow,
          cancelled_by: req.user!.id,
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

      // Audit log: JO_CANCELLED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "JO_CANCELLED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, status: "cancelled", cancellation_reason: cancellation_reason.trim(), cancelled_at: cancelNow },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Also log STATUS_CHANGED
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: existing.status, to: "cancelled" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for cancellation
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, existing.status, "cancelled", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Cancel job order error:", error);
      await logFailedAction(req, "JO_CANCELLED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to cancel job order");
      res.status(500).json({ error: "Failed to cancel job order" });
    }
  }
);

/**
 * POST /api/job-orders/:id/items
 * Add an item to an existing job order and recalculate totals
 * Only "draft" orders can be modified (immutability rule)
 * Roles: POC, JS, R
 */
router.post(
  "/:id/items",
  requireRoles("POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { package_item_id, labor_item_id, quantity, inventory_quantities } = req.body;

      if (!package_item_id) {
        res.status(400).json({ error: "Package item ID is required" });
        return;
      }
      if (!labor_item_id) {
        res.status(400).json({ error: "Labor item ID is required" });
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

      // Only draft orders can have items modified (immutability rule)
      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}". Only draft orders can be edited.`,
        });
        return;
      }

      // Resolve package item
      const { data: packageItem, error: catError } = await supabaseAdmin
        .from("package_items")
        .select("id, name")
        .eq("id", package_item_id)
        .single();

      if (catError || !packageItem) {
        res.status(400).json({ error: `Package item not found: ${package_item_id}` });
        return;
      }

      // Get the JO's vehicle_class
      const { data: orderForClass } = await supabaseAdmin
        .from("job_orders")
        .select("vehicle_class")
        .eq("id", orderId)
        .single();
      const joVehicleClass = orderForClass?.vehicle_class || "light";

      // Resolve labor item directly (decoupled from package)
      const { data: laborItem, error: laborError } = await supabaseAdmin
        .from("labor_items")
        .select("id, light_price, heavy_price, extra_heavy_price, status")
        .eq("id", labor_item_id)
        .single();

      if (laborError || !laborItem) {
        res.status(400).json({ error: `Labor item not found: ${labor_item_id}` });
        return;
      }
      if (laborItem.status !== "active") {
        res.status(400).json({ error: `Labor item ${labor_item_id} is not active` });
        return;
      }

      const laborPrice =
        joVehicleClass === "light"
          ? laborItem.light_price || 0
          : joVehicleClass === "heavy"
            ? laborItem.heavy_price || 0
            : laborItem.extra_heavy_price || 0;

      // Fetch package inventory template links (legacy support)
      const { data: templateLinks } = await supabaseAdmin
        .from("package_inventory_items")
        .select("inventory_item_id, quantity, inventory_items(id, item_name, cost_price, branch_id, status)")
        .eq("package_id", package_item_id);

      const packageTemplateIds = (templateLinks ?? []).map((l: any) => l.inventory_item_id);

      // User-provided inventory quantities
      const userInventoryQuantities: Array<{ inventory_item_id: string; quantity: number }> =
        inventory_quantities || [];

      // Check if package uses inventory_types (new flow) or template links (legacy flow)
      const { data: catItemFull } = await supabaseAdmin
        .from("package_items")
        .select("inventory_types")
        .eq("id", package_item_id)
        .single();

      const hasInventoryTypes = catItemFull?.inventory_types && catItemFull.inventory_types.length > 0;

      if (hasInventoryTypes) {
        for (const uiq of userInventoryQuantities) {
          const { data: invItem } = await supabaseAdmin
            .from("inventory_items")
            .select("id, category, status")
            .eq("id", uiq.inventory_item_id)
            .single();
          if (!invItem) {
            res.status(400).json({ error: `Inventory item not found: ${uiq.inventory_item_id}` });
            return;
          }
          if (invItem.status !== "active") {
            res.status(400).json({ error: `Inventory item ${uiq.inventory_item_id} is not active` });
            return;
          }
          const requiredTypes = catItemFull.inventory_types || [];
          if (!requiredTypes.includes(invItem.category)) {
            res.status(400).json({
              error: `Inventory item category "${invItem.category}" is not required by package "${packageItem.name}"`,
            });
            return;
          }
        }
      } else {
        for (const uiq of userInventoryQuantities) {
          if (!packageTemplateIds.includes(uiq.inventory_item_id)) {
            res.status(400).json({
              error: `Inventory item ${uiq.inventory_item_id} is not in the package template for ${packageItem.name}`,
            });
            return;
          }
        }
        for (const templateId of packageTemplateIds) {
          if (!userInventoryQuantities.find((uiq: any) => uiq.inventory_item_id === templateId)) {
            res.status(400).json({
              error: `Missing inventory quantity for template item ${templateId} in package ${packageItem.name}`,
            });
            return;
          }
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
        let invItem: any = null;
        if (!hasInventoryTypes) {
          const templateLink = (templateLinks ?? []).find((l: any) => l.inventory_item_id === uiq.inventory_item_id);
          invItem = templateLink?.inventory_items;
        }
        if (!invItem) {
          const { data: directItem } = await supabaseAdmin
            .from("inventory_items")
            .select("id, item_name, cost_price")
            .eq("id", uiq.inventory_item_id)
            .single();
          invItem = directItem;
        }
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
          labor_item_id: laborItem.id,
          package_item_id: packageItem.id,
          package_item_name: packageItem.name,
          package_item_type: "labor_package",
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

      // Recalculate total (items + third-party repairs)
      const { data: allItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const { data: allRepairs } = await supabaseAdmin
        .from("third_party_repairs")
        .select("cost")
        .eq("job_order_id", orderId)
        .eq("is_deleted", false);

      const itemsTotal = (allItems || []).reduce((sum: number, item: { line_total: number }) => sum + item.line_total, 0);
      const repairsTotal = (allRepairs || []).reduce((sum: number, r: { cost: number }) => sum + r.cost, 0);
      const newTotal = itemsTotal + repairsTotal;

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
 * Only "draft" orders can be modified (immutability rule)
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

      // Only draft orders can have items modified (immutability rule)
      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}". Only draft orders can be edited.`,
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
        // No inventory_quantities provided - just scale existing snapshots proportionally
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

      // Recalculate order total (items + third-party repairs)
      const { data: allItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const { data: allRepairs } = await supabaseAdmin
        .from("third_party_repairs")
        .select("cost")
        .eq("job_order_id", orderId)
        .eq("is_deleted", false);

      const itemsTotal = (allItems || []).reduce((sum: number, i: { line_total: number }) => sum + i.line_total, 0);
      const repairsTotal = (allRepairs || []).reduce((sum: number, r: { cost: number }) => sum + r.cost, 0);
      const newTotal = itemsTotal + repairsTotal;

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
 * Only "draft" orders can be modified (immutability rule)
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

      // Only draft orders can have items modified (immutability rule)
      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot modify items on a job order with status "${existing.status}". Only draft orders can be edited.`,
        });
        return;
      }

      // Check item count — must have at least 1 remaining
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

      // Recalculate order total (items + third-party repairs)
      const { data: remainingItems } = await supabaseAdmin
        .from("job_order_items")
        .select("line_total")
        .eq("job_order_id", orderId);

      const { data: remainingRepairs } = await supabaseAdmin
        .from("third_party_repairs")
        .select("cost")
        .eq("job_order_id", orderId)
        .eq("is_deleted", false);

      const itemsTotal = (remainingItems || []).reduce((sum: number, i: { line_total: number }) => sum + i.line_total, 0);
      const repairsTotal = (remainingRepairs || []).reduce((sum: number, r: { cost: number }) => sum + r.cost, 0);
      const newTotal = itemsTotal + repairsTotal;

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
 * PATCH /api/job-orders/:id/start-work
 * Transition: approved -> in_progress
 * Sets start_time. Auto-assigns the current technician as assigned_technician_id.
 * Timestamp coherence: start_time >= approved_at
 * Roles: T (Technician only)
 */
router.patch(
  "/:id/start-work",
  requireRoles("T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, order_number, status, approved_at, job_type, approval_status")
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

      // Status check: must be approved
      if (existing.status !== "approved") {
        res.status(400).json({
          error: `Cannot start work on a job order with status "${existing.status}". Only approved orders can be started.`,
        });
        return;
      }

      if (existing.job_type === "backorder" && existing.approval_status !== "APPROVED") {
        res.status(400).json({
          error: "Backorder rework must be approved before starting work.",
        });
        return;
      }

      // Timestamp coherence: start_time >= approved_at
      const startTime = new Date().toISOString();
      if (existing.approved_at && new Date(startTime) < new Date(existing.approved_at)) {
        res.status(400).json({
          error: "Start time cannot be before approval time.",
        });
        return;
      }

      // Update status, set start_time, and auto-assign technician
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: "in_progress",
          start_time: startTime,
          assigned_technician_id: req.user!.id,
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
          `*,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))`
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit logs
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "WORK_STARTED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, start_time: startTime },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "approved", to: "in_progress" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for work started
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "approved", "in_progress", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Start work error:", error);
      await logFailedAction(req, "WORK_STARTED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to start work");
      res.status(500).json({ error: "Failed to start work on job order" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/mark-ready
 * Transition: in_progress -> ready_for_release
 * Roles: T, POC
 */
router.patch(
  "/:id/mark-ready",
  requireRoles("T", "POC"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("id, branch_id, order_number, status, start_time")
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

      // Status check: must be in_progress
      if (existing.status !== "in_progress") {
        res.status(400).json({
          error: `Cannot mark ready a job order with status "${existing.status}". Only in-progress orders can be marked ready.`,
        });
        return;
      }

      // Update status
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({ status: "ready_for_release" })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fetch updated order
      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `*,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))`
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit logs
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "MARKED_READY",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "in_progress", to: "ready_for_release" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for ready for release
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "in_progress", "ready_for_release", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Mark ready error:", error);
      await logFailedAction(req, "MARKED_READY", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to mark ready");
      res.status(500).json({ error: "Failed to mark job order as ready" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/payment-details
 * Save payment method details without changing status.
 * Roles: R, T
 */
router.patch(
  "/:id/payment-details",
  requireRoles("R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;
      const { invoice_number, payment_reference, payment_mode } = req.body as {
        invoice_number?: string;
        payment_reference?: string;
        payment_mode?: string;
      };

      if (!invoice_number || !invoice_number.trim()) {
        res.status(400).json({ error: "Invoice number is required." });
        return;
      }

      if (!payment_reference || !payment_reference.trim()) {
        res.status(400).json({ error: "Payment reference is required." });
        return;
      }

      const normalizedPaymentMode = (payment_mode || "other").toLowerCase();
      if (!["cash", "gcash", "other"].includes(normalizedPaymentMode)) {
        res.status(400).json({ error: "Payment mode must be one of: cash, gcash, other." });
        return;
      }

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

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this job order's branch" });
        return;
      }

      if (!["ready_for_release", "pending_payment"].includes(existing.status)) {
        res.status(400).json({
          error: `Cannot update payment details for a job order with status "${existing.status}".`,
        });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          invoice_number: invoice_number.trim(),
          payment_reference: payment_reference.trim(),
          payment_mode: normalizedPaymentMode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("job_orders")
        .select(
          `*,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))`
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "PAYMENT_DETAILS_UPDATED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            invoice_number: invoice_number.trim(),
            payment_reference: payment_reference.trim(),
            payment_mode: normalizedPaymentMode,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json(updated);
    } catch (error) {
      console.error("Update payment details error:", error);
      await logFailedAction(req, "PAYMENT_DETAILS_UPDATED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to update payment details");
      res.status(500).json({ error: "Failed to update payment details" });
    }
  }
);

/**
 * PATCH /api/job-orders/:id/record-payment
 * Transition: ready_for_release -> pending_payment
 * Confirmation-only action. Requires payment details to be saved first.
 * Roles: R, T (same as approval)
 */
router.patch(
  "/:id/record-payment",
  requireRoles("R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existingRaw, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("*")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      const existing = existingRaw as any;

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

      // Status check: must be ready_for_release
      if (existing.status !== "ready_for_release") {
        res.status(400).json({
          error: `Cannot record payment for a job order with status "${existing.status}". Only ready-for-release orders can have payment recorded.`,
        });
        return;
      }

      const requiresPaymentDetails = !existing.is_free_rework;
      if (
        requiresPaymentDetails &&
        (!existing.invoice_number || !String(existing.invoice_number).trim() || !existing.payment_reference || !String(existing.payment_reference).trim())
      ) {
        res.status(400).json({
          error: "Payment details are required before confirming record payment.",
        });
        return;
      }

      // Update status and record payment timestamp
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: "pending_payment",
          payment_recorded_at: new Date().toISOString(),
          payment_recorded_by: req.user!.id,
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
          `*,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))`
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit logs
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "PAYMENT_RECORDED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            order_number: existing.order_number,
            total_amount: existing.total_amount,
            invoice_number: existing.invoice_number,
            payment_reference: existing.payment_reference,
            payment_mode: existing.payment_mode,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "ready_for_release", to: "pending_payment" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for payment recorded
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "ready_for_release", "pending_payment", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Record payment error:", error);
      await logFailedAction(req, "PAYMENT_RECORDED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to record payment");
      res.status(500).json({ error: "Failed to record payment for job order" });
    }
  }
);
/**
 * PATCH /api/job-orders/:id/complete
 * Transition: pending_payment -> completed
 * Sets completion_time. Timestamp coherence: completion_time >= start_time.
 * Requires payment to be recorded first (pending_payment status).
 * Roles: HM, POC
 */
router.patch(
  "/:id/complete",
  requireRoles("HM", "POC"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params.id as string;

      // Get existing order
      const { data: existingRaw, error: fetchError } = await supabaseAdmin
        .from("job_orders")
        .select("*")
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      const existing = existingRaw as any;

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

      // Status check: must be pending_payment
      if (existing.status !== "pending_payment") {
        res.status(400).json({
          error: `Cannot complete a job order with status "${existing.status}". Only orders with payment recorded can be completed.`,
        });
        return;
      }

      const requiresPaymentDetails = !existing.is_free_rework;
      if (
        requiresPaymentDetails &&
        (!existing.invoice_number || !String(existing.invoice_number).trim() || !existing.payment_reference || !String(existing.payment_reference).trim())
      ) {
        res.status(400).json({
          error: "Payment details are incomplete. Invoice number and payment reference are required before completion.",
        });
        return;
      }

      // Timestamp coherence: completion_time >= start_time
      const completionTime = new Date().toISOString();
      if (existing.start_time && new Date(completionTime) < new Date(existing.start_time)) {
        res.status(400).json({
          error: "Completion time cannot be before start time.",
        });
        return;
      }

      // Update status and set completion_time
      const { error: updateError } = await supabaseAdmin
        .from("job_orders")
        .update({
          status: "completed",
          completion_time: completionTime,
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
          `*,
          customers(id, full_name, contact_number, email),
          vehicles(id, plate_number, model, vehicle_type),
          branches(id, name, code),
          job_order_items(*, job_order_item_inventories(*))`
        )
        .eq("id", orderId)
        .eq("is_deleted", false)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      // Audit logs
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "JO_COMPLETED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { order_number: existing.order_number, completion_time: completionTime },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STATUS_CHANGED",
          p_entity_type: "JOB_ORDER",
          p_entity_id: orderId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { from: "pending_payment", to: "completed" },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // System notification for completion
      await createJobOrderNotification(existing.order_number, orderId, existing.branch_id, "pending_payment", "completed", req.user!.id);

      res.json(updated);
    } catch (error) {
      console.error("Complete job order error:", error);
      await logFailedAction(req, "JO_COMPLETED", "JOB_ORDER", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to complete job order");
      res.status(500).json({ error: "Failed to complete job order" });
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

