import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { logFailedAction } from "../lib/auditLogger.js";

const router = Router();

// All pricing routes require authentication
router.use(requireAuth);

const VALID_PRICING_TYPES = ["labor", "packaging"];
const VALID_STATUSES = ["active", "inactive"];

/**
 * GET /api/pricing
 * Get pricing matrices with filtering and pagination
 * HM sees all; others see their branch-scoped items
 * Roles: HM, POC, JS, R, T (view)
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        pricing_type,
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
          catalog_items(id, name, type, base_price),
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
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (pricing_type) {
        query = query.eq("pricing_type", pricing_type as "labor" | "packaging");
      }
      if (catalog_item_id) {
        query = query.eq("catalog_item_id", catalog_item_id as string);
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `description.ilike.${searchTerm}`
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
          catalog_items(id, name, type, base_price),
          branches(id, name, code)
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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this pricing matrix's branch" });
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
 * Resolve the active pricing for a catalog item at a given branch
 * Used during job order creation
 */
router.get(
  "/resolve/:catalogItemId",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const catalogItemId = req.params.catalogItemId as string;
      const { branch_id } = req.query;

      if (!branch_id) {
        res.status(400).json({ error: "branch_id query parameter is required" });
        return;
      }

      // Get all active pricing rules for this catalog item at this branch
      const { data: pricingRules, error } = await supabaseAdmin
        .from("pricing_matrices")
        .select(
          `
          *,
          catalog_items(id, name, type, base_price)
        `
        )
        .eq("catalog_item_id", catalogItemId)
        .eq("branch_id", branch_id as string)
        .eq("status", "active");

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Also get the catalog item's base price
      const { data: catalogItem, error: catalogError } = await supabaseAdmin
        .from("catalog_items")
        .select("id, name, type, base_price")
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

      res.json({
        catalog_item: catalogItem,
        pricing_rules: pricingRules || [],
        resolved_prices: {
          base_price: catalogItem.base_price,
          labor: pricingRules?.find((r: any) => r.pricing_type === "labor")?.price ?? null,
          packaging: pricingRules?.find((r: any) => r.pricing_type === "packaging")?.price ?? null,
        },
      });
    } catch (error) {
      console.error("Resolve pricing error:", error);
      res.status(500).json({ error: "Failed to resolve pricing" });
    }
  }
);

/**
 * POST /api/pricing
 * Create a new pricing matrix
 * HM, POC, JS, R can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        catalog_item_id,
        pricing_type,
        price,
        status,
        branch_id,
        description,
      } = req.body;

      // Validation: catalog_item_id required
      if (!catalog_item_id) {
        res.status(400).json({ error: "Catalog item is required" });
        return;
      }

      // Validation: pricing_type
      if (!pricing_type || !VALID_PRICING_TYPES.includes(pricing_type)) {
        res.status(400).json({
          error: `Pricing type must be one of: ${VALID_PRICING_TYPES.join(", ")}`,
        });
        return;
      }

      // Validation: price required and must be non-negative
      if (price === undefined || price === null) {
        res.status(400).json({ error: "Price is required" });
        return;
      }
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        res.status(400).json({ error: "Price must be a non-negative number" });
        return;
      }

      // Validation: branch_id required
      if (!branch_id) {
        res.status(400).json({ error: "Branch is required" });
        return;
      }

      // Validation: status if provided
      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
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

      // Verify branch exists
      const { data: branch, error: branchError } = await supabaseAdmin
        .from("branches")
        .select("id")
        .eq("id", branch_id)
        .single();

      if (branchError || !branch) {
        res.status(400).json({ error: "Branch not found" });
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

      // Conflict detection: check for existing active rule with same catalog_item + pricing_type + branch
      const effectiveStatus = status || "active";
      if (effectiveStatus === "active") {
        const { data: conflicting, error: conflictError } = await supabaseAdmin
          .from("pricing_matrices")
          .select("id")
          .eq("catalog_item_id", catalog_item_id)
          .eq("pricing_type", pricing_type)
          .eq("branch_id", branch_id)
          .eq("status", "active")
          .limit(1);

        if (conflictError) {
          res.status(500).json({ error: conflictError.message });
          return;
        }

        if (conflicting && conflicting.length > 0) {
          res.status(409).json({
            error: `An active ${pricing_type} pricing rule already exists for this catalog item in this branch. Deactivate it first or create as inactive.`,
          });
          return;
        }
      }

      const { data: item, error } = await supabaseAdmin
        .from("pricing_matrices")
        .insert({
          catalog_item_id,
          pricing_type,
          price: parsedPrice,
          status: effectiveStatus,
          branch_id,
          description: description?.trim() || null,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          catalog_items(id, name, type, base_price),
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        // Handle unique constraint violation from the partial index
        if (error.code === "23505") {
          res.status(409).json({
            error: `An active ${pricing_type} pricing rule already exists for this catalog item in this branch.`,
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "PRICING_MATRIX")
        .eq("entity_id", item.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

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
 * HM, POC, JS, R can update
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const {
        catalog_item_id,
        pricing_type,
        price,
        status,
        branch_id,
        description,
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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this pricing matrix's branch" });
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

      if (pricing_type !== undefined) {
        if (!VALID_PRICING_TYPES.includes(pricing_type)) {
          res.status(400).json({
            error: `Pricing type must be one of: ${VALID_PRICING_TYPES.join(", ")}`,
          });
          return;
        }
        updateData.pricing_type = pricing_type;
      }

      if (price !== undefined) {
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          res.status(400).json({ error: "Price must be a non-negative number" });
          return;
        }
        updateData.price = parsedPrice;
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

      if (branch_id !== undefined) {
        // Verify branch exists
        const { data: branch, error: branchErr } = await supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", branch_id)
          .single();

        if (branchErr || !branch) {
          res.status(400).json({ error: "Branch not found" });
          return;
        }

        // Branch access check for non-HM
        if (
          !req.user!.roles.includes("HM") &&
          !req.user!.branchIds.includes(branch_id)
        ) {
          res.status(403).json({ error: "No access to this branch" });
          return;
        }
        updateData.branch_id = branch_id;
      }

      if (description !== undefined) {
        updateData.description = description?.trim() || null;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      // Conflict detection when activating or changing key fields
      const newStatus = (updateData.status as string) || existing.status;
      const newCatalogItemId = (updateData.catalog_item_id as string) || existing.catalog_item_id;
      const newPricingType = (updateData.pricing_type as string) || existing.pricing_type;
      const newBranchId = (updateData.branch_id as string) || existing.branch_id;

      if (newStatus === "active") {
        const { data: conflicting, error: conflictError } = await supabaseAdmin
          .from("pricing_matrices")
          .select("id")
          .eq("catalog_item_id", newCatalogItemId)
          .eq("pricing_type", newPricingType as "labor" | "packaging")
          .eq("branch_id", newBranchId)
          .eq("status", "active")
          .neq("id", id)
          .limit(1);

        if (conflictError) {
          res.status(500).json({ error: conflictError.message });
          return;
        }

        if (conflicting && conflicting.length > 0) {
          res.status(409).json({
            error: `An active ${newPricingType} pricing rule already exists for this catalog item in this branch. Deactivate it first.`,
          });
          return;
        }
      }

      const { data: item, error } = await supabaseAdmin
        .from("pricing_matrices")
        .update(updateData)
        .eq("id", id)
        .select(
          `
          *,
          catalog_items(id, name, type, base_price),
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        if (error.code === "23505") {
          res.status(409).json({
            error: `An active ${newPricingType} pricing rule already exists for this catalog item in this branch.`,
          });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "PRICING_MATRIX")
        .eq("entity_id", id)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(item);
    } catch (error) {
      console.error("Update pricing matrix error:", error);
      await logFailedAction(req, "UPDATE", "PRICING_MATRIX", req.params.id || null, error instanceof Error ? error.message : "Failed to update pricing matrix");
      res.status(500).json({ error: "Failed to update pricing matrix" });
    }
  }
);

/**
 * DELETE /api/pricing/:id
 * Delete a pricing matrix
 * HM, POC, JS, R can delete
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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this pricing matrix's branch" });
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

          // Update audit log with user_id
          await supabaseAdmin
            .from("audit_logs")
            .update({ user_id: req.user!.id })
            .eq("entity_type", "PRICING_MATRIX")
            .eq("entity_id", id)
            .eq("action", "UPDATE")
            .is("user_id", null)
            .order("created_at", { ascending: false })
            .limit(1);

          res.json({
            message: "Pricing matrix is referenced by other records and has been deactivated instead",
            deactivated: true,
          });
          return;
        }

        res.status(500).json({ error: deleteError.message });
        return;
      }

      // Update audit log with user_id for the DELETE action
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "PRICING_MATRIX")
        .eq("entity_id", id)
        .eq("action", "DELETE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json({ message: "Pricing matrix deleted successfully" });
    } catch (error) {
      console.error("Delete pricing matrix error:", error);
      await logFailedAction(req, "DELETE", "PRICING_MATRIX", req.params.id || null, error instanceof Error ? error.message : "Failed to delete pricing matrix");
      res.status(500).json({ error: "Failed to delete pricing matrix" });
    }
  }
);

export default router;
