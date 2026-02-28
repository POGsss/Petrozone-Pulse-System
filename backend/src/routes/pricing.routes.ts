import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction, fixAuditLogUser, filterUnchangedFields } from "../lib/auditLogger.js";

const router = Router();

// All pricing routes require authentication
router.use(requireAuth);

const VALID_STATUSES = ["active", "inactive"];

/**
 * GET /api/pricing
 * Get pricing matrices with filtering and pagination
 * All pricing matrices are global - no branch scoping
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status,
        catalog_item_id,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("pricing_matrices")
        .select(
          `
          *,
          catalog_items(id, name)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Apply filters
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (catalog_item_id) {
        query = query.eq("catalog_item_id", catalog_item_id as string);
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `catalog_item_id.eq.${search}`
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
      console.error("Get pricing matrices error:", error);
      res.status(500).json({ error: "Failed to fetch pricing matrices" });
    }
  }
);

/**
 * GET /api/pricing/:id
 * Get a single pricing matrix by ID
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data: item, error } = await supabaseAdmin
        .from("pricing_matrices")
        .select(
          `
          *,
          catalog_items(id, name)
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Pricing matrix not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(item);
    } catch (error) {
      console.error("Get pricing matrix error:", error);
      res.status(500).json({ error: "Failed to fetch pricing matrix" });
    }
  }
);

/**
 * GET /api/pricing/resolve/:catalogItemId
 * Resolve the active pricing for a catalog item
 * Returns light_price, heavy_price, extra_heavy_price
 */
router.get(
  "/resolve/:catalogItemId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const catalogItemId = req.params.catalogItemId as string;

      // Get the catalog item
      const { data: catalogItem, error: catalogError } = await supabaseAdmin
        .from("catalog_items")
        .select("id, name")
        .eq("id", catalogItemId)
        .single();

      if (catalogError) {
        if (catalogError.code === "PGRST116") {
          res.status(404).json({ error: "Catalog item not found" });
          return;
        }
        res.status(500).json({ error: catalogError.message });
        return;
      }

      // Get active pricing matrix for this catalog item (one active per catalog_item_id)
      const { data: pricingMatrix, error } = await supabaseAdmin
        .from("pricing_matrices")
        .select("*")
        .eq("catalog_item_id", catalogItemId)
        .eq("status", "active")
        .maybeSingle();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        catalog_item: catalogItem,
        pricing: pricingMatrix
          ? {
              id: pricingMatrix.id,
              light_price: pricingMatrix.light_price,
              heavy_price: pricingMatrix.heavy_price,
              extra_heavy_price: pricingMatrix.extra_heavy_price,
            }
          : null,
      });
    } catch (error) {
      console.error("Resolve pricing error:", error);
      res.status(500).json({ error: "Failed to resolve pricing" });
    }
  }
);

/**
 * POST /api/pricing/resolve-bulk
 * Resolve pricing for multiple catalog items in one call
 * Body: { catalog_item_ids: string[] }
 */
router.post(
  "/resolve-bulk",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { catalog_item_ids } = req.body;

      if (!Array.isArray(catalog_item_ids) || catalog_item_ids.length === 0) {
        res.status(400).json({ error: "catalog_item_ids must be a non-empty array" });
        return;
      }

      // Get all active pricing matrices for these catalog items
      const { data: pricingMatrices, error } = await supabaseAdmin
        .from("pricing_matrices")
        .select("*")
        .in("catalog_item_id", catalog_item_ids)
        .eq("status", "active");

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Get catalog items
      const { data: catalogItems, error: catError } = await supabaseAdmin
        .from("catalog_items")
        .select("id, name")
        .in("id", catalog_item_ids);

      if (catError) {
        res.status(500).json({ error: catError.message });
        return;
      }

      // Build results map
      const results: Record<string, {
        catalog_item: { id: string; name: string } | null;
        pricing: {
          id: string;
          light_price: number;
          heavy_price: number;
          extra_heavy_price: number;
        } | null;
      }> = {};

      for (const itemId of catalog_item_ids) {
        const catItem = catalogItems?.find((c: any) => c.id === itemId) || null;
        const matrix = pricingMatrices?.find((m: any) => m.catalog_item_id === itemId) || null;
        results[itemId] = {
          catalog_item: catItem,
          pricing: matrix
            ? {
                id: matrix.id,
                light_price: matrix.light_price,
                heavy_price: matrix.heavy_price,
                extra_heavy_price: matrix.extra_heavy_price,
              }
            : null,
        };
      }

      res.json(results);
    } catch (error) {
      console.error("Bulk resolve pricing error:", error);
      res.status(500).json({ error: "Failed to resolve bulk pricing" });
    }
  }
);

/**
 * POST /api/pricing
 * Create a new pricing matrix
 * Fields: catalog_item_id, light_price, heavy_price, extra_heavy_price, status
 * Constraint: one active pricing matrix per catalog_item_id
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        catalog_item_id,
        light_price,
        heavy_price,
        extra_heavy_price,
        status,
      } = req.body;

      // Validation: catalog_item_id required
      if (!catalog_item_id) {
        res.status(400).json({ error: "Catalog item is required" });
        return;
      }

      // Validation: prices required and must be non-negative
      const parsedLightPrice = parseFloat(light_price);
      const parsedHeavyPrice = parseFloat(heavy_price);
      const parsedExtraHeavyPrice = parseFloat(extra_heavy_price);

      if (isNaN(parsedLightPrice) || parsedLightPrice < 0) {
        res.status(400).json({ error: "Light price must be a non-negative number" });
        return;
      }
      if (isNaN(parsedHeavyPrice) || parsedHeavyPrice < 0) {
        res.status(400).json({ error: "Heavy price must be a non-negative number" });
        return;
      }
      if (isNaN(parsedExtraHeavyPrice) || parsedExtraHeavyPrice < 0) {
        res.status(400).json({ error: "Extra heavy price must be a non-negative number" });
        return;
      }

      // Validation: status if provided
      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
        });
        return;
      }

      // Verify catalog item exists
      const { data: catalogItem, error: catalogError } = await supabaseAdmin
        .from("catalog_items")
        .select("id")
        .eq("id", catalog_item_id)
        .single();

      if (catalogError || !catalogItem) {
        res.status(400).json({ error: "Catalog item not found" });
        return;
      }

      // Conflict detection: one active pricing matrix per catalog_item_id
      const effectiveStatus = status || "active";
      if (effectiveStatus === "active") {
        const { data: conflicting, error: conflictError } = await supabaseAdmin
          .from("pricing_matrices")
          .select("id")
          .eq("catalog_item_id", catalog_item_id)
          .eq("status", "active")
          .limit(1);

        if (conflictError) {
          res.status(500).json({ error: conflictError.message });
          return;
        }

        if (conflicting && conflicting.length > 0) {
          res.status(409).json({
            error: "An active pricing matrix already exists for this catalog item. Deactivate it first or create as inactive.",
          });
          return;
        }
      }

      const { data: item, error } = await supabaseAdmin
        .from("pricing_matrices")
        .insert({
          catalog_item_id,
          light_price: parsedLightPrice,
          heavy_price: parsedHeavyPrice,
          extra_heavy_price: parsedExtraHeavyPrice,
          status: effectiveStatus,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          catalog_items(id, name)
        `
        )
        .single();

      if (error) {
        // Handle unique constraint violation from the partial index
        if (error.code === "23505") {
          res.status(409).json({
            error: "An active pricing matrix already exists for this catalog item.",
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("PRICING_MATRIX", item.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(item);
    } catch (error) {
      console.error("Create pricing matrix error:", error);
      await logFailedAction(req, "CREATE", "PRICING_MATRIX", null, error instanceof Error ? error.message : "Failed to create pricing matrix");
      res.status(500).json({ error: "Failed to create pricing matrix" });
    }
  }
);

/**
 * PUT /api/pricing/:id
 * Update a pricing matrix
 * Fields: catalog_item_id, light_price, heavy_price, extra_heavy_price, status
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const {
        catalog_item_id,
        light_price,
        heavy_price,
        extra_heavy_price,
        status,
      } = req.body;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("pricing_matrices")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Pricing matrix not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (catalog_item_id !== undefined) {
        // Verify catalog item exists
        const { data: catalogItem, error: catErr } = await supabaseAdmin
          .from("catalog_items")
          .select("id")
          .eq("id", catalog_item_id)
          .single();

        if (catErr || !catalogItem) {
          res.status(400).json({ error: "Catalog item not found" });
          return;
        }
        updateData.catalog_item_id = catalog_item_id;
      }

      if (light_price !== undefined) {
        const parsed = parseFloat(light_price);
        if (isNaN(parsed) || parsed < 0) {
          res.status(400).json({ error: "Light price must be a non-negative number" });
          return;
        }
        updateData.light_price = parsed;
      }

      if (heavy_price !== undefined) {
        const parsed = parseFloat(heavy_price);
        if (isNaN(parsed) || parsed < 0) {
          res.status(400).json({ error: "Heavy price must be a non-negative number" });
          return;
        }
        updateData.heavy_price = parsed;
      }

      if (extra_heavy_price !== undefined) {
        const parsed = parseFloat(extra_heavy_price);
        if (isNaN(parsed) || parsed < 0) {
          res.status(400).json({ error: "Extra heavy price must be a non-negative number" });
          return;
        }
        updateData.extra_heavy_price = parsed;
      }

      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status)) {
          res.status(400).json({
            error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
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
        const { data: current } = await supabaseAdmin
          .from("pricing_matrices")
          .select(`*, catalog_items(id, name)`)
          .eq("id", id)
          .single();
        res.json(current);
        return;
      }

      // Conflict detection when activating or changing catalog_item_id
      const newStatus = (actualChanges.status as string) || existing.status;
      const newCatalogItemId = (actualChanges.catalog_item_id as string) || existing.catalog_item_id;

      if (newStatus === "active") {
        const { data: conflicting, error: conflictError } = await supabaseAdmin
          .from("pricing_matrices")
          .select("id")
          .eq("catalog_item_id", newCatalogItemId)
          .eq("status", "active")
          .neq("id", id)
          .limit(1);

        if (conflictError) {
          res.status(500).json({ error: conflictError.message });
          return;
        }

        if (conflicting && conflicting.length > 0) {
          res.status(409).json({
            error: "An active pricing matrix already exists for this catalog item. Deactivate it first.",
          });
          return;
        }
      }

      const { data: item, error } = await supabaseAdmin
        .from("pricing_matrices")
        .update(actualChanges)
        .eq("id", id)
        .select(
          `
          *,
          catalog_items(id, name)
        `
        )
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({
            error: "An active pricing matrix already exists for this catalog item.",
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Fix audit log user_id
      await fixAuditLogUser("PRICING_MATRIX", id, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(item);
    } catch (error) {
      console.error("Update pricing matrix error:", error);
      await logFailedAction(req, "UPDATE", "PRICING_MATRIX", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to update pricing matrix");
      res.status(500).json({ error: "Failed to update pricing matrix" });
    }
  }
);

/**
 * DELETE /api/pricing/:id
 * Delete a pricing matrix permanently, or deactivate if referenced
 */
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      // Get existing item
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from("pricing_matrices")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          res.status(404).json({ error: "Pricing matrix not found" });
          return;
        }
        res.status(500).json({ error: fetchError.message });
        return;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("pricing_matrices")
        .delete()
        .eq("id", id);

      if (deleteError) {
        // If FK constraint violation, fall back to soft delete (deactivate)
        if (deleteError.code === "23503") {
          const { error: updateError } = await supabaseAdmin
            .from("pricing_matrices")
            .update({ status: "inactive" })
            .eq("id", id);

          if (updateError) {
            res.status(500).json({ error: updateError.message });
            return;
          }

          try {
            await supabaseAdmin.rpc("log_admin_action", {
              p_action: "UPDATE",
              p_entity_type: "PRICING_MATRIX",
              p_entity_id: id,
              p_performed_by_user_id: req.user!.id,
              p_performed_by_branch_id: req.user!.branchIds[0] || null,
              p_new_values: { status: "inactive", reason: "soft_delete" },
            });
          } catch (auditErr) {
            console.error("Audit log error:", auditErr);
          }

          res.json({
            message: "Pricing matrix is referenced by other records and has been deactivated instead",
            deactivated: true,
          });
          return;
        }

        res.status(500).json({ error: deleteError.message });
        return;
      }

      // Log hard delete
      try {
        await supabaseAdmin.rpc("log_admin_action", {
          p_action: "DELETE",
          p_entity_type: "PRICING_MATRIX",
          p_entity_id: id,
          p_performed_by_user_id: req.user!.id,
          p_performed_by_branch_id: req.user!.branchIds[0] || null,
          p_new_values: { catalog_item_id: existing.catalog_item_id, deleted: true },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      res.json({ message: "Pricing matrix deleted successfully" });
    } catch (error) {
      console.error("Delete pricing matrix error:", error);
      await logFailedAction(req, "DELETE", "PRICING_MATRIX", (req.params.id as string) || null, error instanceof Error ? error.message : "Failed to delete pricing matrix");
      res.status(500).json({ error: "Failed to delete pricing matrix" });
    }
  }
);

export default router;
