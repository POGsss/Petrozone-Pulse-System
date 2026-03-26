import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";
import type { Database } from "../types/database.types.js";

const router = Router();

// All inventory routes require authentication
router.use(requireAuth);

const MAX_ITEM_NAME_LENGTH = 100;
const ITEM_NAME_REGEX = /^[A-Za-z0-9()\- ]+$/;

// Helpers

function normalizeAndValidateItemName(rawName: unknown): { valid: boolean; value?: string; error?: string } {
  const itemName = typeof rawName === "string" ? rawName.trim() : "";

  if (!itemName) {
    return { valid: false, error: "Item name is required" };
  }

  if (itemName.length > MAX_ITEM_NAME_LENGTH) {
    return {
      valid: false,
      error: `Item name must be at most ${MAX_ITEM_NAME_LENGTH} characters`,
    };
  }

  if (!ITEM_NAME_REGEX.test(itemName)) {
    return {
      valid: false,
      error: "Item name can only contain letters, numbers, spaces, hyphens, and parentheses",
    };
  }

  return { valid: true, value: itemName };
}

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

// GET /api/inventory
// List inventory items with computed on-hand quantity
// Roles: HM, POC, JS, R (view — R needs read access for PO item selection)
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
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

// GET /api/inventory/low-stock
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

// GET /api/inventory/:id
// Get a single inventory item with on-hand quantity
// Roles: HM, POC, JS, R (R needs read access for PO item selection)
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
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

// GET /api/inventory/:id/references
// Check whether item has references that require deactivation instead of hard delete
// Roles: HM, POC, JS
router.get(
  "/:id/references",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;

      const { data: item, error: itemError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id")
        .eq("id", itemId)
        .single();

      if (itemError) {
        if (itemError.code === "PGRST116") {
          res.status(404).json({ error: "Inventory item not found" });
          return;
        }
        res.status(500).json({ error: itemError.message });
        return;
      }

      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      const { count: joiiCount } = await supabaseAdmin
        .from("job_order_item_inventories")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const { count: poiCount } = await supabaseAdmin
        .from("purchase_order_items")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const { count: smCount } = await supabaseAdmin
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const nonMovementReferences = (joiiCount ?? 0) + (poiCount ?? 0);

      res.json({
        hasReferences: nonMovementReferences > 0,
        mode: nonMovementReferences > 0 ? "deactivate" : "delete",
        nonMovementReferences,
        stockMovementReferences: smCount ?? 0,
        references: {
          job_order_item_inventories: joiiCount ?? 0,
          purchase_order_items: poiCount ?? 0,
          stock_movements: smCount ?? 0,
        },
      });
    } catch (error) {
      console.error("Check inventory references error:", error);
      res.status(500).json({ error: "Failed to check references" });
    }
  }
);

// POST /api/inventory
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
      const validatedName = normalizeAndValidateItemName(item_name);
      if (!validatedName.valid) {
        res.status(400).json({ error: validatedName.error });
        return;
      }
      const normalizedItemName = validatedName.value as string;
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
      if (initial_stock !== undefined && initial_stock !== null) {
        const initialStockNumber = parseInt(initial_stock, 10);
        if (isNaN(initialStockNumber) || initialStockNumber < 0) {
          res.status(400).json({ error: "Initial stock must be a non-negative integer" });
          return;
        }
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
          item_name: normalizedItemName,
          sku_code: sku_code.trim().toUpperCase(),
          category: category.trim(),
          unit_of_measure: unit_of_measure.trim(),
          cost_price: parseFloat(cost_price),
          reorder_threshold: parseInt(reorder_threshold) || 0,
          status: "draft",
          approval_status: "DRAFT",
          approval_requested_at: null,
          approved_at: null,
          approved_by: null,
          initial_stock_pending: Math.max(0, parseInt(initial_stock, 10) || 0),
          branch_id,
          created_by: req.user!.id,
        })
        .select("*, branches(id, name, code)")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Initial stock is deferred and only posted as stock movement when approved.
      const current_quantity = 0;

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("INVENTORY_ITEM", item.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

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

// PUT /api/inventory/:id
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
        const validatedName = normalizeAndValidateItemName(item_name);
        if (!validatedName.valid) {
          res.status(400).json({ error: validatedName.error });
          return;
        }
        updateData.item_name = validatedName.value;
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
        if (!["active", "inactive"].includes(existing.status)) {
          res.status(400).json({
            error: `Status for ${existing.status} items must be changed using approval actions.`,
          });
          return;
        }
        updateData.status = status;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Filter out fields that haven't actually changed
      const actualChanges = filterUnchangedFields(updateData, existing);
      if (Object.keys(actualChanges).length === 0) {
        // No real changes — return existing data without triggering an update
        const current_quantity = await getOnHandSingle(itemId);
        res.json({
          ...existing,
          current_quantity,
          is_low_stock: current_quantity <= existing.reorder_threshold,
        });
        return;
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("inventory_items")
        .update(actualChanges)
        .eq("id", itemId)
        .select("*, branches(id, name, code)")
        .single();

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Fix audit log user_id (trigger may set it from created_by)
      await fixAuditLogUser("INVENTORY_ITEM", itemId, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

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

// PATCH /api/inventory/:id/request-approval
// Legacy endpoint: approval is now recorded directly from draft
// Roles: HM, POC, JS
router.patch(
  "/:id/request-approval",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id, status, item_name")
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
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot request approval for item with status "${existing.status}".`,
        });
        return;
      }

      const { error: updateError } = await supabaseAdmin
        .from("inventory_items")
        .update({
          status: "draft",
          approval_status: "DRAFT",
          approval_requested_at: null,
        })
        .eq("id", itemId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("*, branches(id, name, code)")
        .eq("id", itemId)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "APPROVAL_REQUESTED",
          p_entity_type: "INVENTORY_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            item_name: existing.item_name,
            status: "draft",
            approval_status: "DRAFT",
            approval_requested_at: null,
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const current_quantity = await getOnHandSingle(itemId);
      res.json({
        ...updated,
        current_quantity,
        is_low_stock: current_quantity <= updated.reorder_threshold,
      });
    } catch (error) {
      console.error("Request inventory approval error:", error);
      await logFailedAction(
        req,
        "APPROVAL_REQUESTED",
        "INVENTORY_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to request inventory approval"
      );
      res.status(500).json({ error: "Failed to request approval" });
    }
  }
);

// PATCH /api/inventory/:id/record-approval
// Record HM/POC approval decision directly for draft item
// Roles: HM, POC
router.patch(
  "/:id/record-approval",
  requireRoles("HM", "POC"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.id as string;
      const { decision } = req.body;

      if (decision !== "approved") {
        res.status(400).json({ error: 'Decision must be "approved"' });
        return;
      }

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, branch_id, status, item_name, initial_stock_pending")
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
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      if (existing.status !== "draft") {
        res.status(400).json({
          error: `Cannot record approval for status "${existing.status}". Only draft is allowed.`,
        });
        return;
      }

      const now = new Date().toISOString();

      const updatePayload: Database["public"]["Tables"]["inventory_items"]["Update"] = {
        status: "active",
        approval_status: "APPROVED",
        approval_requested_at: null,
        approved_at: now,
        approved_by: req.user!.id,
        initial_stock_pending: 0,
      };

      const { error: updateError } = await supabaseAdmin
        .from("inventory_items")
        .update(updatePayload)
        .eq("id", itemId);

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      if ((existing.initial_stock_pending ?? 0) > 0) {
        const { error: moveError } = await supabaseAdmin.from("stock_movements").insert({
          inventory_item_id: itemId,
          movement_type: "stock_in",
          quantity: existing.initial_stock_pending,
          reference_type: "adjustment",
          reason: "Initial stock (approved)",
          branch_id: existing.branch_id,
          created_by: req.user!.id,
        });

        if (moveError) {
          res.status(500).json({ error: moveError.message });
          return;
        }
      }

      const { data: updated, error: refetchError } = await supabaseAdmin
        .from("inventory_items")
        .select("*, branches(id, name, code)")
        .eq("id", itemId)
        .single();

      if (refetchError) {
        res.status(500).json({ error: refetchError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "APPROVAL_RECORDED",
          p_entity_type: "INVENTORY_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: {
            item_name: existing.item_name,
            status: "active",
            approval_status: "APPROVED",
            decision: "approved",
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      const current_quantity = await getOnHandSingle(itemId);
      res.json({
        ...updated,
        current_quantity,
        is_low_stock: current_quantity <= updated.reorder_threshold,
      });
    } catch (error) {
      console.error("Record inventory approval error:", error);
      await logFailedAction(
        req,
        "APPROVAL_RECORDED",
        "INVENTORY_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to record inventory approval"
      );
      res.status(500).json({ error: "Failed to record approval" });
    }
  }
);

// DELETE /api/inventory/:id
// Hard-delete if no references, soft-delete (deactivate) if referenced
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

      // Check references in job_order_item_inventories, purchase_order_items, stock_movements
      const { count: joiiCount } = await supabaseAdmin
        .from("job_order_item_inventories")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const { count: poiCount } = await supabaseAdmin
        .from("purchase_order_items")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const { count: smCount } = await supabaseAdmin
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", itemId);

      const hasNonMovementReferences = ((joiiCount ?? 0) + (poiCount ?? 0)) > 0;

      if (hasNonMovementReferences) {
        // Soft delete: set status to inactive
        const { error: updateError } = await supabaseAdmin
          .from("inventory_items")
          .update({ status: "inactive" })
          .eq("id", itemId);

        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }

        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "UPDATE",
            p_entity_type: "INVENTORY_ITEM",
            p_entity_id: itemId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: {
              item_name: existing.item_name,
              sku_code: existing.sku_code,
              status: "inactive",
              reason: "soft_delete",
              references: {
                job_order_item_inventories: joiiCount ?? 0,
                purchase_order_items: poiCount ?? 0,
                stock_movements: smCount ?? 0,
              },
            },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({
          message: `Inventory item "${existing.item_name}" deactivated (referenced by other records)`,
        });
      } else {
        // Hard delete: purge movement history and links first, then the item
        const { error: stockMovementDeleteError } = await supabaseAdmin
          .from("stock_movements")
          .delete()
          .eq("inventory_item_id", itemId);

        if (stockMovementDeleteError) {
          res.status(500).json({ error: stockMovementDeleteError.message });
          return;
        }

        const { error: packageLinksDeleteError } = await supabaseAdmin
          .from("package_inventory_links")
          .delete()
          .eq("inventory_item_id", itemId);

        if (packageLinksDeleteError) {
          res.status(500).json({ error: packageLinksDeleteError.message });
          return;
        }

        const { error: supplierProductsDeleteError } = await supabaseAdmin
          .from("supplier_products")
          .delete()
          .eq("inventory_item_id", itemId);

        if (supplierProductsDeleteError) {
          res.status(500).json({ error: supplierProductsDeleteError.message });
          return;
        }

        const { error: deleteError } = await supabaseAdmin
          .from("inventory_items")
          .delete()
          .eq("id", itemId);

        if (deleteError) {
          res.status(500).json({ error: deleteError.message });
          return;
        }

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
              deleted: true,
              deleted_stock_movements: smCount ?? 0,
            },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({
          message: `Inventory item "${existing.item_name}" deleted permanently`,
        });
      }
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

// POST /api/inventory/:id/adjust
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

      if (item.status !== "active") {
        res.status(400).json({ error: "Only active inventory items can be adjusted." });
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

// POST /api/inventory/:id/stock-in
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

      if (item.status !== "active") {
        res.status(400).json({ error: "Only active inventory items can receive stock-in." });
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

// GET /api/inventory/:id/movements
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

// Exported helper for JO stock deduction
/**
 * Deduct stock for a job order's items.
 * Called from the JO approval endpoint.
 * Uses direct FK links from job_order_item_inventories for precise deduction.
 * Also handles product-type items without explicit inventory links (legacy name-matching fallback).
 * Returns either { success: true } or { success: false, error: string }
 */
export async function deductStockForJobOrder(
  jobOrderId: string,
  branchId: string,
  items: Array<{
    package_item_id: string;
    package_item_name: string;
    package_item_type: string;
    quantity: number;
  }>,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Fetch all JO items with their inventory snapshots
  const { data: joItems } = await supabaseAdmin
    .from("job_order_items")
    .select("id, package_item_name, package_item_type, quantity, job_order_item_inventories(*)")
    .eq("job_order_id", jobOrderId);

  if (!joItems || joItems.length === 0) {
    return { success: true };
  }

  // 2. Collect all inventory deductions from snapshots
  const deductions: Array<{
    inventory_item_id: string;
    inventory_item_name: string;
    quantity: number;
  }> = [];

  for (const joItem of joItems) {
    const snapshots = (joItem as any).job_order_item_inventories ?? [];
    if (snapshots.length > 0) {
      // Use direct FK links from snapshots
      for (const snap of snapshots) {
        const snapQty = snap.quantity || 0;
        if (snapQty > 0) {
          deductions.push({
            inventory_item_id: snap.inventory_item_id,
            inventory_item_name: snap.inventory_item_name,
            quantity: snapQty,
          });
        }
      }
    }
  }

  if (deductions.length === 0) {
    return { success: true };
  }

  // 3. Aggregate deductions per inventory item (same item may appear in multiple JO items)
  const aggregated: Record<string, { name: string; quantity: number }> = {};
  for (const d of deductions) {
    const existing = aggregated[d.inventory_item_id];
    if (existing) {
      existing.quantity += d.quantity;
    } else {
      aggregated[d.inventory_item_id] = { name: d.inventory_item_name, quantity: d.quantity };
    }
  }

  // 4. Check stock availability and deduct
  for (const [invItemId, { name, quantity }] of Object.entries(aggregated)) {
    const currentQty = await getOnHandSingle(invItemId);

    if (currentQty < quantity) {
      return {
        success: false,
        error: `Insufficient stock for "${name}". Available: ${currentQty}, Required: ${quantity}`,
      };
    }

    // Deduct stock
    const { error } = await supabaseAdmin.from("stock_movements").insert({
      inventory_item_id: invItemId,
      movement_type: "stock_out" as "stock_in" | "stock_out" | "adjustment",
      quantity,
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
