import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All package routes require authentication
router.use(requireAuth);

const VALID_STATUSES = ["active", "inactive"];

/**
 * GET /api/packages
 * Get Package items with filtering and pagination
 * All Package items are global - all authenticated users see all items
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
        .from("package_items")
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
      console.error("Get Package items error:", error);
      res.status(500).json({ error: "Failed to fetch Package items" });
    }
  }
);

/**
 * GET /api/packages/:itemId
 * Get a single Package item by ID
 */
router.get(
  "/:itemId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      const { data: item, error } = await supabaseAdmin
        .from("package_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Package item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(item);
    } catch (error) {
      console.error("Get Package item error:", error);
      res.status(500).json({ error: "Failed to fetch Package item" });
    }
  }
);

/**
 * GET /api/packages/:itemId/delete-mode
 * Returns whether package can be hard-deleted or will be deactivated.
 */
router.get(
  "/:itemId/delete-mode",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      const [{ count: legacyRefs }, { count: lineRefs }] = await Promise.all([
        supabaseAdmin
          .from("job_order_items")
          .select("id", { count: "exact", head: true })
          .eq("package_item_id", itemId),
        supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("line_type", "package")
          .eq("reference_id", itemId),
      ]);

      const references = (legacyRefs || 0) + (lineRefs || 0);
      const mode = references > 0 ? "deactivate" : "delete";

      res.json({
        deletable: references === 0,
        mode,
        reference_count: references,
      });
    } catch (error) {
      console.error("Get package delete mode error:", error);
      res.status(500).json({ error: "Failed to determine package delete mode" });
    }
  }
);

/**
 * POST /api/packages
 * Create a new Package item (labor package template)
 * HM, POC, JS can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, status, price } = req.body;
      if (!name?.trim()) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      const parsedPrice = Number(price);
      if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        res.status(400).json({ error: "Price is required and must be greater than 0" });
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
        .from("package_items")
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          price: parsedPrice,
          status: status || "active",
          created_by: req.user!.id,
        })
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("PACKAGE_ITEM", item.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(item);
    } catch (error) {
      console.error("Create Package item error:", error);
      await logFailedAction(req, "CREATE", "PACKAGE_ITEM", null, error instanceof Error ? error.message : "Failed to create Package item");
      res.status(500).json({ error: "Failed to create Package item" });
    }
  }
);

/**
 * PUT /api/packages/:itemId
 * Update a Package item
 * HM, POC, JS can update
 */
router.put(
  "/:itemId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const { name, description, status, price } = req.body;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("package_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Package item not found" });
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

      if (price !== undefined) {
        const parsedPrice = Number(price);
        if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          res.status(400).json({ error: "Price must be greater than 0" });
          return;
        }
        updateData.price = parsedPrice;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Filter out fields that haven't actually changed
      const actualChanges = filterUnchangedFields(updateData, existing);
      if (Object.keys(actualChanges).length === 0) {
        const { data: current } = await supabaseAdmin
          .from("package_items")
          .select("*")
          .eq("id", itemId)
          .single();
        res.json(current);
        return;
      }

      const { data: item, error } = await supabaseAdmin
        .from("package_items")
        .update(actualChanges)
        .eq("id", itemId)
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("PACKAGE_ITEM", itemId, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(item);
    } catch (error) {
      console.error("Update Package item error:", error);
      await logFailedAction(req, "UPDATE", "PACKAGE_ITEM", (req.params.itemId as string) || null, error instanceof Error ? error.message : "Failed to update Package item");
      res.status(500).json({ error: "Failed to update Package item" });
    }
  }
);

/**
 * DELETE /api/packages/:itemId
 * Hard-delete if no references exist, soft-delete (deactivate) if referenced
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
        .from("package_items")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Package item not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Check both legacy and current JO references before deciding delete mode.
      const [{ count: legacyRefs }, { count: lineRefs }] = await Promise.all([
        supabaseAdmin
          .from("job_order_items")
          .select("id", { count: "exact", head: true })
          .eq("package_item_id", itemId),
        supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("line_type", "package")
          .eq("reference_id", itemId),
      ]);

      const hasReferences = ((legacyRefs ?? 0) + (lineRefs ?? 0)) > 0;

      if (hasReferences) {
        // Soft delete: set status to inactive
        const { error: updateError } = await supabaseAdmin
          .from("package_items")
          .update({ status: "inactive" as "active" | "inactive" })
          .eq("id", itemId);

        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }

        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "UPDATE",
            p_entity_type: "PACKAGE_ITEM",
            p_entity_id: itemId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { status: "inactive", reason: "soft_delete" },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({
          message: "Package item deactivated (referenced by other records)",
          deactivated: true,
        });
      } else {
        // Hard delete: remove labor links first, then the item
        await supabaseAdmin
          .from("package_labor_items")
          .delete()
          .eq("package_id", itemId);

        const { error: deleteError } = await supabaseAdmin
          .from("package_items")
          .delete()
          .eq("id", itemId);

        if (deleteError) {
          res.status(500).json({ error: deleteError.message });
          return;
        }

        try {
          await supabaseAdmin.rpc("log_admin_action", {
            p_action: "DELETE",
            p_entity_type: "PACKAGE_ITEM",
            p_entity_id: itemId,
            p_performed_by_user_id: req.user!.id,
            p_performed_by_branch_id: req.user!.branchIds[0] || null,
            p_new_values: { name: existing.name, deleted: true },
          });
        } catch (auditErr) {
          console.error("Audit log error:", auditErr);
        }

        res.json({ message: "Package item deleted successfully" });
      }
    } catch (error) {
      console.error("Delete Package item error:", error);
      await logFailedAction(req, "DELETE", "PACKAGE_ITEM", (req.params.itemId as string) || null, error instanceof Error ? error.message : "Failed to delete Package item");
      res.status(500).json({ error: "Failed to delete Package item" });
    }
  }
);

/**
 * GET /api/packages/:itemId/inventory-links
 * Get all inventory items linked to a Package item
 * Roles: HM, POC, JS, R
 */
router.get(
  "/:itemId/inventory-links",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Deprecated endpoint kept for backward compatibility after inventory template removal.
      res.json([]);
    } catch (error) {
      console.error("Get package inventory links error:", error);
      res.status(500).json({ error: "Failed to fetch inventory links" });
    }
  }
);

/**
 * POST /api/packages/:itemId/inventory-links
 * Add an inventory item to a Package item with quantity
 * Roles: HM, POC, JS
 */
router.post(
  "/:itemId/inventory-links",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(410).json({ error: "Package inventory template links are no longer supported" });
    } catch (error) {
      console.error("Add package inventory link error:", error);
      res.status(500).json({ error: "Failed to add inventory link" });
    }
  }
);

/**
 * PUT /api/packages/:itemId/inventory-links/:linkId
 * Update inventory item quantity in a Package item
 * Roles: HM, POC, JS
 */
router.put(
  "/:itemId/inventory-links/:linkId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(410).json({ error: "Package inventory template links are no longer supported" });
    } catch (error) {
      console.error("Update package inventory item error:", error);
      res.status(500).json({ error: "Failed to update package inventory item" });
    }
  }
);

/**
 * DELETE /api/packages/:itemId/inventory-links/:linkId
 * Remove an inventory item link from a Package item
 * Roles: HM, POC, JS
 */
router.delete(
  "/:itemId/inventory-links/:linkId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(410).json({ error: "Package inventory template links are no longer supported" });
    } catch (error) {
      console.error("Delete package inventory link error:", error);
      res.status(500).json({ error: "Failed to remove inventory link" });
    }
  }
);

/**
 * GET /api/packages/:itemId/labor-items
 * Get all labor items linked to a Package item
 * Roles: HM, POC, JS, R
 */
router.get(
  "/:itemId/labor-items",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;

      const { data: packageItem, error: catError } = await supabaseAdmin
        .from("package_items")
        .select("id")
        .eq("id", itemId)
        .single();

      if (catError || !packageItem) {
        if (catError?.code === "PGRST116") {
          res.status(404).json({ error: "Package item not found" });
          return;
        }
        res.status(500).json({ error: catError?.message || "Failed to validate package item" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("package_labor_items")
        .select(`
          *,
          labor_items(id, name, light_price, heavy_price, extra_heavy_price, status)
        `)
        .eq("package_id", itemId)
        .order("created_at", { ascending: true });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data || []);
    } catch (error) {
      console.error("Get package labor items error:", error);
      res.status(500).json({ error: "Failed to fetch labor items" });
    }
  }
);

/**
 * POST /api/packages/:itemId/labor-items
 * Add labor item to a Package item with quantity
 * Roles: HM, POC, JS
 */
router.post(
  "/:itemId/labor-items",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const { labor_item_id, quantity } = req.body;

      if (!labor_item_id) {
        res.status(400).json({ error: "Labor item ID is required" });
        return;
      }

      const parsedQty = Number(quantity ?? 1);
      if (Number.isNaN(parsedQty) || parsedQty <= 0) {
        res.status(400).json({ error: "Quantity must be greater than 0" });
        return;
      }

      const { data: packageItem, error: catError } = await supabaseAdmin
        .from("package_items")
        .select("id")
        .eq("id", itemId)
        .single();

      if (catError || !packageItem) {
        if (catError?.code === "PGRST116") {
          res.status(404).json({ error: "Package item not found" });
          return;
        }
        res.status(500).json({ error: catError?.message || "Failed to validate package item" });
        return;
      }

      const { data: laborItem, error: laborError } = await supabaseAdmin
        .from("labor_items")
        .select("id, status")
        .eq("id", labor_item_id)
        .single();

      if (laborError || !laborItem) {
        res.status(400).json({ error: "Labor item not found" });
        return;
      }
      if (laborItem.status !== "active") {
        res.status(400).json({ error: "Labor item is not active" });
        return;
      }

      const { data: existing } = await supabaseAdmin
        .from("package_labor_items")
        .select("id")
        .eq("package_id", itemId)
        .eq("labor_id", labor_item_id)
        .maybeSingle();

      if (existing) {
        res.status(409).json({ error: "This labor item is already linked to this Package item" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("package_labor_items")
        .insert({
          package_id: itemId,
          labor_id: labor_item_id,
          quantity: parsedQty,
        })
        .select(`
          *,
          labor_items(id, name, light_price, heavy_price, extra_heavy_price, status)
        `)
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (error) {
      console.error("Add package labor item error:", error);
      res.status(500).json({ error: "Failed to add labor item" });
    }
  }
);

/**
 * PUT /api/packages/:itemId/labor-items/:linkId
 * Update labor item quantity in a Package item
 * Roles: HM, POC, JS
 */
router.put(
  "/:itemId/labor-items/:linkId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const linkId = req.params.linkId as string;
      const { quantity } = req.body;

      const parsedQty = Number(quantity);
      if (Number.isNaN(parsedQty) || parsedQty <= 0) {
        res.status(400).json({ error: "Quantity must be greater than 0" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("package_labor_items")
        .update({ quantity: parsedQty })
        .eq("id", linkId)
        .eq("package_id", itemId)
        .select(`
          *,
          labor_items(id, name, light_price, heavy_price, extra_heavy_price, status)
        `)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Package labor item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error) {
      console.error("Update package labor item error:", error);
      res.status(500).json({ error: "Failed to update package labor item" });
    }
  }
);

/**
 * DELETE /api/packages/:itemId/labor-items/:linkId
 * Remove a labor item link from a Package item
 * Roles: HM, POC, JS
 */
router.delete(
  "/:itemId/labor-items/:linkId",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const itemId = req.params.itemId as string;
      const linkId = req.params.linkId as string;

      const { error } = await supabaseAdmin
        .from("package_labor_items")
        .delete()
        .eq("id", linkId)
        .eq("package_id", itemId);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ message: "Labor item removed successfully" });
    } catch (error) {
      console.error("Delete package labor item error:", error);
      res.status(500).json({ error: "Failed to remove labor item" });
    }
  }
);

export default router;
