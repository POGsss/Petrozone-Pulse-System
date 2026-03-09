import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All catalog routes require authentication
router.use(requireAuth);

const VALID_STATUSES = ["active", "inactive"];

/**
 * GET /api/catalog
 * Get catalog items with filtering and pagination
 * All catalog items are global - all authenticated users see all items
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("catalog_items")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      // Apply filters
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `name.ilike.${searchTerm},description.ilike.${searchTerm}`
        );
      }

      // Apply pagination
      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

      const { data: items, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data: items,
        pagination: {
          total: count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get catalog items error:", error);
      res.status(500).json({ error: "Failed to fetch catalog items" });
    }
  }
);

/**
 * GET /api/catalog/:itemId
 * Get a single catalog item by ID
 */
router.get(
  "/:itemId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      const { data: item, error } = await supabaseAdmin
        .from("catalog_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(item);
    } catch (error) {
      console.error("Get catalog item error:", error);
      res.status(500).json({ error: "Failed to fetch catalog item" });
    }
  }
);

/**
 * POST /api/catalog
 * Create a new catalog item (labor package template)
 * HM, POC, JS can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, status, inventory_types } = req.body;
      if (!name?.trim()) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      // Validation: status if provided
      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.join(", ")}`
        });
        return;
      }

      const { data: item, error } = await supabaseAdmin
        .from("catalog_items")
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          status: status || "active",
          inventory_types: Array.isArray(inventory_types) ? inventory_types : [],
          created_by: req.user!.id,
        })
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("CATALOG_ITEM", item.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(item);
    } catch (error) {
      console.error("Create catalog item error:", error);
      await logFailedAction(req, "CREATE", "CATALOG_ITEM", null, error instanceof Error ? error.message : "Failed to create catalog item");
      res.status(500).json({ error: "Failed to create catalog item" });
    }
  }
);

/**
 * PUT /api/catalog/:itemId
 * Update a catalog item
 * HM, POC, JS can update
 */
router.put(
  "/:itemId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const { name, description, status, inventory_types } = req.body;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("catalog_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (name !== undefined) {
        if (!name.trim()) {
          res.status(400).json({ error: "Name cannot be empty" });
          return;
        }
        updateData.name = name.trim();
      }

      if (description !== undefined) {
        updateData.description = description?.trim() || null;
      }

      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status)) {
          res.status(400).json({
            error: `Status must be one of: ${VALID_STATUSES.join(", ")}`
          });
          return;
        }
        updateData.status = status;
      }

      if (inventory_types !== undefined) {
        updateData.inventory_types = Array.isArray(inventory_types) ? inventory_types : [];
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Filter out fields that haven't actually changed
      const actualChanges = filterUnchangedFields(updateData, existing);
      if (Object.keys(actualChanges).length === 0) {
        const { data: current } = await supabaseAdmin
          .from("catalog_items")
          .select("*")
          .eq("id", itemId)
          .single();
        res.json(current);
        return;
      }

      const { data: item, error } = await supabaseAdmin
        .from("catalog_items")
        .update(actualChanges)
        .eq("id", itemId)
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("CATALOG_ITEM", itemId, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(item);
    } catch (error) {
      console.error("Update catalog item error:", error);
      await logFailedAction(req, "UPDATE", "CATALOG_ITEM", (req.params.itemId as string) || null, error instanceof Error ? error.message : "Failed to update catalog item");
      res.status(500).json({ error: "Failed to update catalog item" });
    }
  }
);

/**
 * DELETE /api/catalog/:itemId
 * Delete a catalog item permanently, or deactivate if referenced
 * HM, POC, JS can delete
 */
router.delete(
  "/:itemId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("catalog_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Try hard delete first
      const { data: deletedRows, error: deleteError } = await supabaseAdmin
        .from("catalog_items")
        .delete()
        .eq("id", itemId)
        .select();

      if (deleteError) {
        console.error("Delete error:", deleteError.code, deleteError.message);
        if (deleteError.code === "23503") {
          const { error: updateError } = await supabaseAdmin
            .from("catalog_items")
            .update({ status: "inactive" as "active" | "inactive" })
            .eq("id", itemId);

          if (updateError) {
            res.status(500).json({ error: updateError.message });
            return;
          }

          try {
            await supabaseAdmin.rpc("log_admin_action", {
              p_action: "UPDATE",
              p_entity_type: "CATALOG_ITEM",
              p_entity_id: itemId,
              p_performed_by_user_id: req.user!.id,
              p_performed_by_branch_id: req.user!.branchIds[0] || null,
              p_new_values: { status: "inactive", reason: "soft_delete" },
            });
          } catch (auditErr) {
            console.error("Audit log error:", auditErr);
          }

          res.json({
            message: "Catalog item is referenced by other records and has been deactivated instead",
            deactivated: true,
          });
          return;
        }

        res.status(500).json({ error: deleteError.message });
        return;
      }

      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "CATALOG_ITEM",
          p_entity_id: itemId,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { name: existing.name, deleted: true },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Catalog item deleted successfully" });
    } catch (error) {
      console.error("Delete catalog item error:", error);
      await logFailedAction(req, "DELETE", "CATALOG_ITEM", (req.params.itemId as string) || null, error instanceof Error ? error.message : "Failed to delete catalog item");
      res.status(500).json({ error: "Failed to delete catalog item" });
    }
  }
);

/**
 * GET /api/catalog/:itemId/inventory-links
 * Get all inventory items linked to a catalog item
 * Roles: HM, POC, JS, R
 */
router.get(
  "/:itemId/inventory-links",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      const { data: catalogItem, error: catError } = await supabaseAdmin
        .from("catalog_items")
        .select("id")
        .eq("id", itemId)
        .single();

      if (catError) {
        if (catError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: catError.message });
        return;
      }

      const { data: links, error } = await supabaseAdmin
        .from("catalog_inventory_links")
        .select(`
          *,
          inventory_items(id, item_name, sku_code, cost_price, unit_of_measure, branch_id)
        `)
        .eq("catalog_item_id", itemId)
        .order("created_at", { ascending: true });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(links || []);
    } catch (error) {
      console.error("Get catalog inventory links error:", error);
      res.status(500).json({ error: "Failed to fetch inventory links" });
    }
  }
);

/**
 * POST /api/catalog/:itemId/inventory-links
 * Add an inventory item link to a catalog item (template association only, no quantity)
 * Roles: HM, POC, JS
 */
router.post(
  "/:itemId/inventory-links",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const { inventory_item_id } = req.body;

      if (!inventory_item_id) {
        res.status(400).json({ error: "Inventory item ID is required" });
        return;
      }

      const { data: catalogItem, error: catError } = await supabaseAdmin
        .from("catalog_items")
        .select("id")
        .eq("id", itemId)
        .single();

      if (catError) {
        if (catError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: catError.message });
        return;
      }

      const { data: invItem, error: invError } = await supabaseAdmin
        .from("inventory_items")
        .select("id, item_name, status")
        .eq("id", inventory_item_id)
        .single();

      if (invError || !invItem) {
        res.status(400).json({ error: "Inventory item not found" });
        return;
      }
      if (invItem.status !== "active") {
        res.status(400).json({ error: "Inventory item is not active" });
        return;
      }

      const { data: existing } = await supabaseAdmin
        .from("catalog_inventory_links")
        .select("id")
        .eq("catalog_item_id", itemId)
        .eq("inventory_item_id", inventory_item_id)
        .maybeSingle();

      if (existing) {
        res.status(409).json({ error: "This inventory item is already linked to this catalog item" });
        return;
      }

      const { data: link, error: insertError } = await supabaseAdmin
        .from("catalog_inventory_links")
        .insert({
          catalog_item_id: itemId,
          inventory_item_id,
        })
        .select(`
          *,
          inventory_items(id, item_name, sku_code, cost_price, unit_of_measure, branch_id)
        `)
        .single();

      if (insertError) {
        res.status(500).json({ error: insertError.message });
        return;
      }

      res.status(201).json(link);
    } catch (error) {
      console.error("Add catalog inventory link error:", error);
      res.status(500).json({ error: "Failed to add inventory link" });
    }
  }
);

/**
 * DELETE /api/catalog/:itemId/inventory-links/:linkId
 * Remove an inventory item link from a catalog item
 * Roles: HM, POC, JS
 */
router.delete(
  "/:itemId/inventory-links/:linkId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const linkId = req.params.linkId as string;

      const { data: catalogItem, error: catError } = await supabaseAdmin
        .from("catalog_items")
        .select("id")
        .eq("id", itemId)
        .single();

      if (catError) {
        if (catError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: catError.message });
        return;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("catalog_inventory_links")
        .delete()
        .eq("id", linkId)
        .eq("catalog_item_id", itemId);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      res.json({ message: "Inventory link removed successfully" });
    } catch (error) {
      console.error("Delete catalog inventory link error:", error);
      res.status(500).json({ error: "Failed to remove inventory link" });
    }
  }
);

export default router;
