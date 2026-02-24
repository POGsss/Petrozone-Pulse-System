import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction } from "../lib/auditLogger.js";
import type { Database } from "../types/database.types.js";

const router = Router();

// All inventory routes require authentication
router.use(requireAuth);

// ─── helpers ───────────────────────────────────────────────────────────

/**
 * Compute on-hand quantity from the stock_movements ledger.
 * Returns a map  { inventory_item_id → current_quantity }
 */
async function getOnHandQuantities(
  itemIds: string[]
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {};

  const { data: movements } = await supabaseAdmin
    .from("stock_movements")
    .select("inventory_item_id, movement_type, quantity, reason")
    .in("inventory_item_id", itemIds);

  const map: Record<string, number> = {};
  for (const id of itemIds) map[id] = 0;

  for (const m of movements ?? []) {
    const id = m.inventory_item_id;
    if (m.movement_type === "stock_in") {
      map[id] = (map[id] ?? 0) + m.quantity;
    } else if (m.movement_type === "stock_out") {
      map[id] = (map[id] ?? 0) - m.quantity;
    }
  }
  return map;
}

/**
 * Compute on-hand for a single item.
 */
async function getOnHandSingle(itemId: string): Promise<number> {
  const map = await getOnHandQuantities([itemId]);
  return map[itemId] ?? 0;
}

// ─── GET /api/inventory ────────────────────────────────────────────────
// List inventory items with computed on-hand quantity
// Roles: HM, POC, JS (view)
router.get(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        category,
        search,
        low_stock,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("inventory_items")
        .select("*, branches(id, name, code)", { count: "exact" })
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see only their branches
      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (status) query = query.eq("status", status as Database["public"]["Enums"]["inventory_item_status"]);
      if (category) query = query.eq("category", category as string);
      if (search) {
        const s = `%${search}%`;
        query = query.or(
          `item_name.ilike.${s},sku_code.ilike.${s},category.ilike.${s}`
        );
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: items, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Compute on-hand quantities from ledger
      const ids = (items ?? []).map((i: { id: string }) => i.id);
      const qtyMap = await getOnHandQuantities(ids);

      // Attach current_quantity and low_stock flag
      const enriched = (items ?? []).map((item: any) => {
        const current_quantity = qtyMap[item.id] ?? 0;
        return {
          ...item,
          current_quantity,
          is_low_stock: current_quantity <= item.reorder_threshold,
        };
      });

      // Optional: filter to only low-stock items
      const result =
        low_stock === "true"
          ? enriched.filter((i: any) => i.is_low_stock && i.status === "active")
          : enriched;

      res.json({
        data: result,
        pagination: {
          total: low_stock === "true" ? result.length : count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get inventory items error:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  }
);

// ─── GET /api/inventory/low-stock ──────────────────────────────────────
// Low-stock items for dashboard indicator (FR-4)
// Roles: HM, POC, JS, R, T (view)
router.get(
  "/low-stock",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      let query = supabaseAdmin
        .from("inventory_items")
        .select("*, branches(id, name, code)")
        .eq("status", "active");

      if (!req.user!.roles.includes("HM")) {
        query = query.in("branch_id", req.user!.branchIds);
      }

      const { data: items, error } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const ids = (items ?? []).map((i: { id: string }) => i.id);
      const qtyMap = await getOnHandQuantities(ids);

      const lowStockItems = (items ?? [])
        .map((item: any) => {
          const current_quantity = qtyMap[item.id] ?? 0;
          return { ...item, current_quantity };
        })
        .filter(
          (item: any) => item.current_quantity <= item.reorder_threshold
        );

      res.json({ data: lowStockItems, count: lowStockItems.length });
    } catch (error) {
      console.error("Get low-stock items error:", error);
      res.status(500).json({ error: "Failed to fetch low-stock items" });
    }
  }
);

// ─── GET /api/inventory/:id ────────────────────────────────────────────
// Get a single inventory item with on-hand quantity
// Roles: HM, POC, JS
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;

      const { data: item, error } = await supabaseAdmin
        .from("inventory_items")
        .select("*, branches(id, name, code)")
        .eq("id", itemId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const current_quantity = await getOnHandSingle(item.id);
      res.json({
        ...item,
        current_quantity,
        is_low_stock: current_quantity <= item.reorder_threshold,
      });
    } catch (error) {
      console.error("Get inventory item error:", error);
      res.status(500).json({ error: "Failed to fetch inventory item" });
    }
  }
);

// ─── POST /api/inventory ──────────────────────────────────────────────
// Add inventory item (UC45)
// Roles: HM, POC, JS
router.post(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        item_name,
        sku_code,
        category,
        unit_of_measure,
        cost_price,
        reorder_threshold,
        branch_id,
        initial_stock,
      } = req.body;

      // Validation
      if (!item_name?.trim()) {
        res.status(400).json({ error: "Item name is required" });
        return;
      }
      if (!sku_code?.trim()) {
        res.status(400).json({ error: "SKU code is required" });
        return;
      }
      if (!category?.trim()) {
        res.status(400).json({ error: "Category is required" });
        return;
      }
      if (!unit_of_measure?.trim()) {
        res.status(400).json({ error: "Unit of measure is required" });
        return;
      }
      if (cost_price === undefined || cost_price === null || parseFloat(cost_price) < 0) {
        res.status(400).json({ error: "Cost price must be a non-negative number" });
        return;
      }
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Check SKU uniqueness per branch
      const { data: existing } = await supabaseAdmin
        .from("inventory_items")
        .select("id")
        .eq("sku_code", sku_code.trim())
        .eq("branch_id", branch_id)
        .maybeSingle();

      if (existing) {
        res.status(409).json({ error: "SKU code already exists in this branch" });
        return;
      }

      const { data: item, error } = await supabaseAdmin
        .from("inventory_items")
        .insert({
          item_name: item_name.trim(),
          sku_code: sku_code.trim().toUpperCase(),
          category: category.trim(),
          unit_of_measure: unit_of_measure.trim(),
          cost_price: parseFloat(cost_price),
          reorder_threshold: parseInt(reorder_threshold) || 0,
          branch_id,
          created_by: req.user!.id,
        })
        .select("*, branches(id, name, code)")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // If initial stock provided, create a stock_in movement
      let current_quantity = 0;
      if (initial_stock && parseInt(initial_stock) > 0) {
        await supabaseAdmin.from("stock_movements").insert({
          inventory_item_id: item.id,
          movement_type: "stock_in",
          quantity: parseInt(initial_stock),
          reference_type: "purchase_order",
          reason: "Initial stock",
          branch_id,
          created_by: req.user!.id,
        });
        current_quantity = parseInt(initial_stock);
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "INVENTORY_ITEM")
        .eq("entity_id", item.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json({
        ...item,
        current_quantity,
        is_low_stock: current_quantity <= item.reorder_threshold,
      });
    } catch (error) {
      console.error("Create inventory item error:", error);
      await logFailedAction(
        req,
        "CREATE",
        "INVENTORY_ITEM",
        null,
        error instanceof Error ? error.message : "Failed to create inventory item"
      );
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  }
);

// ─── PUT /api/inventory/:id ───────────────────────────────────────────
// Update inventory item (UC47)
// Roles: HM, POC, JS
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;
      const {
        item_name,
        sku_code,
        category,
        unit_of_measure,
        cost_price,
        reorder_threshold,
        status,
      } = req.body;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
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
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const updateData: Record<string, unknown> = {};

      if (item_name !== undefined) {
        if (!item_name.trim()) {
          res.status(400).json({ error: "Item name cannot be empty" });
          return;
        }
        updateData.item_name = item_name.trim();
      }

      if (sku_code !== undefined) {
        if (!sku_code.trim()) {
          res.status(400).json({ error: "SKU code cannot be empty" });
          return;
        }
        // Check SKU uniqueness (excluding self)
        const { data: dup } = await supabaseAdmin
          .from("inventory_items")
          .select("id")
          .eq("sku_code", sku_code.trim().toUpperCase())
          .eq("branch_id", existing.branch_id)
          .neq("id", itemId)
          .maybeSingle();

        if (dup) {
          res.status(409).json({ error: "SKU code already exists in this branch" });
          return;
        }
        updateData.sku_code = sku_code.trim().toUpperCase();
      }

      if (category !== undefined) {
        if (!category.trim()) {
          res.status(400).json({ error: "Category cannot be empty" });
          return;
        }
        updateData.category = category.trim();
      }

      if (unit_of_measure !== undefined) {
        if (!unit_of_measure.trim()) {
          res.status(400).json({ error: "Unit of measure cannot be empty" });
          return;
        }
        updateData.unit_of_measure = unit_of_measure.trim();
      }

      if (cost_price !== undefined) {
        const price = parseFloat(cost_price);
        if (isNaN(price) || price < 0) {
          res.status(400).json({ error: "Cost price must be a non-negative number" });
          return;
        }
        updateData.cost_price = price;
      }

      if (reorder_threshold !== undefined) {
        const threshold = parseInt(reorder_threshold);
        if (isNaN(threshold) || threshold < 0) {
          res.status(400).json({ error: "Reorder threshold must be a non-negative integer" });
          return;
        }
        updateData.reorder_threshold = threshold;
      }

      if (status !== undefined) {
        if (!["active", "inactive"].includes(status)) {
          res.status(400).json({ error: 'Status must be "active" or "inactive"' });
          return;
        }
        updateData.status = status;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("inventory_items")
        .update(updateData)
        .eq("id", itemId)
        .select("*, branches(id, name, code)")
        .single();

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "INVENTORY_ITEM")
        .eq("entity_id", itemId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      const current_quantity = await getOnHandSingle(itemId);
      res.json({
        ...updated,
        current_quantity,
        is_low_stock: current_quantity <= updated.reorder_threshold,
      });
    } catch (error) {
      console.error("Update inventory item error:", error);
      await logFailedAction(
        req,
        "UPDATE",
        "INVENTORY_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to update inventory item"
      );
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  }
);

// ─── DELETE /api/inventory/:id ────────────────────────────────────────
// Soft-delete inventory item (UC48) — set status to inactive
// Roles: HM, POC, JS
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id, item_name, sku_code")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
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
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Soft delete: set status to inactive
      const { error: updateError } = await supabaseAdmin
        .from("inventory_items")
        .update({ status: "inactive" as "active" | "inactive" })
        .eq("id", itemId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "INVENTORY_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            item_name: existing.item_name,
            sku_code: existing.sku_code,
            status: "inactive",
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({
        message: `Inventory item "${existing.item_name}" has been deactivated`,
      });
    } catch (error) {
      console.error("Delete inventory item error:", error);
      await logFailedAction(
        req,
        "DELETE",
        "INVENTORY_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to delete inventory item"
      );
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  }
);

// ─── POST /api/inventory/:id/adjust ───────────────────────────────────
// Manual inventory adjustment (HM, POC only)
router.post(
  "/:id/adjust",
  requireRoles("HM", "POC"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;
      const { adjustment_type, quantity, reason } = req.body;

      // Validation
      if (!adjustment_type || !["increase", "decrease"].includes(adjustment_type)) {
        res.status(400).json({ error: 'Adjustment type must be "increase" or "decrease"' });
        return;
      }
      if (!quantity || parseInt(quantity) < 1) {
        res.status(400).json({ error: "Quantity must be at least 1" });
        return;
      }
      if (!reason?.trim()) {
        res.status(400).json({ error: "Reason is required for adjustments" });
        return;
      }

      // Get item
      const { data: item, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Branch access check
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const currentQty = await getOnHandSingle(itemId);
      const adjustQty = parseInt(quantity);

      // Cannot reduce below zero
      if (adjustment_type === "decrease" && currentQty - adjustQty < 0) {
        res.status(400).json({
          error: `Cannot reduce stock below zero. Current quantity: ${currentQty}`,
        });
        return;
      }

      // Create stock movement
      const movementType: "stock_in" | "stock_out" =
        adjustment_type === "increase" ? "stock_in" : "stock_out";

      const { error: moveError } = await supabaseAdmin
        .from("stock_movements")
        .insert({
          inventory_item_id: itemId,
          movement_type: movementType,
          quantity: adjustQty,
          reference_type: "adjustment" as "purchase_order" | "job_order" | "adjustment",
          reason: reason.trim(),
          branch_id: item.branch_id,
          created_by: req.user!.id,
        });

      if (moveError) {
        res.status(500).json({ error: moveError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "ADJUSTMENT",
          p_entity_type: "INVENTORY_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            item_name: item.item_name,
            adjustment_type,
            quantity: adjustQty,
            reason: reason.trim(),
            previous_quantity: currentQty,
            new_quantity:
              adjustment_type === "increase"
                ? currentQty + adjustQty
                : currentQty - adjustQty,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const newQty =
        adjustment_type === "increase"
          ? currentQty + adjustQty
          : currentQty - adjustQty;

      res.json({
        message: `Stock adjusted successfully. New quantity: ${newQty}`,
        current_quantity: newQty,
        is_low_stock: newQty <= item.reorder_threshold,
      });
    } catch (error) {
      console.error("Inventory adjustment error:", error);
      await logFailedAction(
        req,
        "ADJUSTMENT",
        "INVENTORY_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to adjust inventory"
      );
      res.status(500).json({ error: "Failed to adjust inventory" });
    }
  }
);

// ─── POST /api/inventory/:id/stock-in ─────────────────────────────────
// Add stock (stock-in) for an inventory item
// Roles: HM, POC, JS
router.post(
  "/:id/stock-in",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;
      const { quantity, reason } = req.body;

      if (!quantity || parseInt(quantity) < 1) {
        res.status(400).json({ error: "Quantity must be at least 1" });
        return;
      }

      const { data: item, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const qty = parseInt(quantity);

      const { error: moveError } = await supabaseAdmin
        .from("stock_movements")
        .insert({
          inventory_item_id: itemId,
          movement_type: "stock_in" as "stock_in" | "stock_out" | "adjustment",
          quantity: qty,
          reference_type: "purchase_order" as "purchase_order" | "job_order" | "adjustment",
          reason: reason?.trim() || "Stock received",
          branch_id: item.branch_id,
          created_by: req.user!.id,
        });

      if (moveError) {
        res.status(500).json({ error: moveError.message });
        return;
      }

      // Audit log
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "STOCK_IN",
          p_entity_type: "INVENTORY_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            item_name: item.item_name,
            quantity: qty,
            reason: reason?.trim() || "Stock received",
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const newQty = await getOnHandSingle(itemId);
      res.json({
        message: `Stock added successfully. New quantity: ${newQty}`,
        current_quantity: newQty,
        is_low_stock: newQty <= item.reorder_threshold,
      });
    } catch (error) {
      console.error("Stock-in error:", error);
      res.status(500).json({ error: "Failed to add stock" });
    }
  }
);

// ─── GET /api/inventory/:id/movements ─────────────────────────────────
// Get stock movement history for an item
// Roles: HM, POC, JS
router.get(
  "/:id/movements",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;
      const { limit = "50", offset = "0" } = req.query;

      // Verify item exists and check branch access
      const { data: item, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const { data: movements, error, count } = await supabaseAdmin
        .from("stock_movements")
        .select("*", { count: "exact" })
        .eq("inventory_item_id", itemId)
        .order("created_at", { ascending: false })
        .range(
          parseInt(offset as string),
          parseInt(offset as string) + parseInt(limit as string) - 1
        );

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: movements,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get stock movements error:", error);
      res.status(500).json({ error: "Failed to fetch stock movements" });
    }
  }
);

// ─── Exported helper for JO stock deduction ─────────────────────────
/**
 * Deduct stock for a job order's items.
 * Called from the JO approval endpoint.
 * Returns either { success: true } or { success: false, error: string }
 */
export async function deductStockForJobOrder(
  jobOrderId: string,
  branchId: string,
  items: Array<{
    catalog_item_id: string;
    catalog_item_name: string;
    catalog_item_type: string;
    quantity: number;
  }>,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Only deduct for product-type items (services don't consume inventory)
  const productItems = items.filter((i) => i.catalog_item_type === "product");

  if (productItems.length === 0) {
    return { success: true }; // No products to deduct
  }

  // Find matching inventory items for each product in this branch
  for (const item of productItems) {
    // Try to find inventory item matching catalog item name in this branch
    const { data: invItems } = await supabaseAdmin
      .from("inventory_items")
      .select("id, item_name, reorder_threshold")
      .eq("branch_id", branchId)
      .eq("status", "active")
      .ilike("item_name", item.catalog_item_name);

    if (!invItems || invItems.length === 0) {
      // No matching inventory item — skip (don't block if item not tracked in inventory)
      continue;
    }

    const invItem = invItems[0]!;
    const currentQty = await getOnHandSingle(invItem.id);

    if (currentQty < item.quantity) {
      return {
        success: false,
        error: `Insufficient stock for "${item.catalog_item_name}". Available: ${currentQty}, Required: ${item.quantity}`,
      };
    }

    // Deduct stock
    const { error } = await supabaseAdmin.from("stock_movements").insert({
      inventory_item_id: invItem.id,
      movement_type: "stock_out" as "stock_in" | "stock_out" | "adjustment",
      quantity: item.quantity,
      reference_type: "job_order" as "purchase_order" | "job_order" | "adjustment",
      reference_id: jobOrderId,
      reason: `Auto-deduction for Job Order`,
      branch_id: branchId,
      created_by: userId,
    });

    if (error) {
      return { success: false, error: `Failed to deduct stock: ${error.message}` };
    }
  }

  return { success: true };
}

/**
 * Restore stock for a cancelled job order.
 * Reverses all stock_out movements linked to this JO.
 */
export async function restoreStockForJobOrder(
  jobOrderId: string,
  branchId: string,
  userId: string
): Promise<void> {
  // Find all stock_out movements for this JO
  const { data: movements } = await supabaseAdmin
    .from("stock_movements")
    .select("*")
    .eq("reference_type", "job_order")
    .eq("reference_id", jobOrderId)
    .eq("movement_type", "stock_out");

  if (!movements || movements.length === 0) return;

  // Create stock_in movements to reverse
  for (const m of movements) {
    await supabaseAdmin.from("stock_movements").insert({
      inventory_item_id: m.inventory_item_id,
      movement_type: "stock_in" as "stock_in" | "stock_out" | "adjustment",
      quantity: m.quantity,
      reference_type: "job_order" as "purchase_order" | "job_order" | "adjustment",
      reference_id: jobOrderId,
      reason: "Stock restored — Job Order cancelled",
      branch_id: branchId,
      created_by: userId,
    });
  }
}

export default router;
