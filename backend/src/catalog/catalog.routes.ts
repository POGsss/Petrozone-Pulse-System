import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All catalog routes require authentication
router.use(requireAuth);

const VALID_TYPES = ["service", "product", "package"];
const VALID_STATUSES = ["active", "inactive"];

/**
 * GET /api/catalog
 * Get catalog items with filtering and pagination
 * HM sees all; others see global items + their branch-scoped items
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        branch_id,
        status,
        type,
        search,
        is_global,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("catalog_items")
        .select(
          `
          *,
          branches(id, name, code)
        `,
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // Branch scoping: HM sees all, others see global + their branch items
      if (!req.user!.roles.includes("HM")) {
        query = query.or(
          `is_global.eq.true,branch_id.in.(${req.user!.branchIds.join(",")})`
        );
      }

      // Apply filters
      if (branch_id) {
        query = query.eq("branch_id", branch_id as string);
      }
      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (type) {
        query = query.eq(
          "type",
          type as "service" | "product" | "package"
        );
      }
      if (is_global === "true") {
        query = query.eq("is_global", true);
      } else if (is_global === "false") {
        query = query.eq("is_global", false);
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
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !item.is_global &&
        item.branch_id &&
        !req.user!.branchIds.includes(item.branch_id)
      ) {
        res.status(403).json({ error: "No access to this catalog item's branch" });
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
 * Create a new catalog item
 * HM, POC, JS can create
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        name,
        type,
        description,
        base_price,
        status,
        branch_id,
        is_global,
      } = req.body;

      // Validation: name required
      if (!name || !name.trim()) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      // Validation: type
      if (!type || !VALID_TYPES.includes(type)) {
        res.status(400).json({
          error: `Type must be one of: ${VALID_TYPES.join(", ")}`,
        });
        return;
      }

      // Validation: base_price required and must be a positive number
      if (base_price === undefined || base_price === null) {
        res.status(400).json({ error: "Base price is required" });
        return;
      }
      const price = parseFloat(base_price);
      if (isNaN(price) || price < 0) {
        res.status(400).json({ error: "Base price must be a non-negative number" });
        return;
      }

      // Validation: status if provided
      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
        });
        return;
      }

      // Validation: branch_id or is_global
      const isGlobalFlag = is_global === true || is_global === "true";
      if (!isGlobalFlag && !branch_id) {
        res.status(400).json({
          error: "Either branch_id or is_global flag is required",
        });
        return;
      }

      // If global, branch_id should be null
      const effectiveBranchId = isGlobalFlag ? null : branch_id;

      // Branch access check for non-HM users
      if (
        effectiveBranchId &&
        !req.user!.roles.includes("HM") &&
        !req.user!.branchIds.includes(effectiveBranchId)
      ) {
        res.status(403).json({ error: "No access to this branch" });
        return;
      }

      // Only HM can create global items
      if (isGlobalFlag && !req.user!.roles.includes("HM")) {
        res.status(403).json({
          error: "Only Higher Management can create global catalog items",
        });
        return;
      }

      // Verify branch exists if branch-scoped
      if (effectiveBranchId) {
        const { data: branch, error: branchError } = await supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", effectiveBranchId)
          .single();

        if (branchError || !branch) {
          res.status(400).json({ error: "Branch not found" });
          return;
        }
      }

      const { data: item, error } = await supabaseAdmin
        .from("catalog_items")
        .insert({
          name: name.trim(),
          type,
          description: description?.trim() || null,
          base_price: price,
          status: status || "active",
          branch_id: effectiveBranchId,
          is_global: isGlobalFlag,
          created_by: req.user!.id,
        })
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "CATALOG_ITEM")
        .eq("entity_id", item.id)
        .eq("action", "CREATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.status(201).json(item);
    } catch (error) {
      console.error("Create catalog item error:", error);
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
      const {
        name,
        type,
        description,
        base_price,
        status,
        branch_id,
        is_global,
      } = req.body;

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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !existing.is_global &&
        existing.branch_id &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this catalog item's branch" });
        return;
      }

      // Only HM can edit global items
      if (existing.is_global && !req.user!.roles.includes("HM")) {
        res.status(403).json({
          error: "Only Higher Management can edit global catalog items",
        });
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

      if (type !== undefined) {
        if (!VALID_TYPES.includes(type)) {
          res.status(400).json({
            error: `Type must be one of: ${VALID_TYPES.join(", ")}`,
          });
          return;
        }
        updateData.type = type;
      }

      if (description !== undefined) {
        updateData.description = description?.trim() || null;
      }

      if (base_price !== undefined) {
        const price = parseFloat(base_price);
        if (isNaN(price) || price < 0) {
          res.status(400).json({ error: "Base price must be a non-negative number" });
          return;
        }
        updateData.base_price = price;
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

      if (is_global !== undefined) {
        const isGlobalFlag = is_global === true || is_global === "true";
        // Only HM can toggle global flag
        if (!req.user!.roles.includes("HM")) {
          res.status(403).json({
            error: "Only Higher Management can change global flag",
          });
          return;
        }
        updateData.is_global = isGlobalFlag;
        if (isGlobalFlag) {
          updateData.branch_id = null;
        }
      }

      if (branch_id !== undefined && !updateData.is_global) {
        if (branch_id) {
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

          // Branch access check for non-HM
          if (
            !req.user!.roles.includes("HM") &&
            !req.user!.branchIds.includes(branch_id)
          ) {
            res.status(403).json({ error: "No access to this branch" });
            return;
          }
        }
        updateData.branch_id = branch_id || null;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      const { data: item, error } = await supabaseAdmin
        .from("catalog_items")
        .update(updateData)
        .eq("id", itemId)
        .select(
          `
          *,
          branches(id, name, code)
        `
        )
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Update audit log with user_id
      await supabaseAdmin
        .from("audit_logs")
        .update({ user_id: req.user!.id })
        .eq("entity_type", "CATALOG_ITEM")
        .eq("entity_id", itemId)
        .eq("action", "UPDATE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json(item);
    } catch (error) {
      console.error("Update catalog item error:", error);
      res.status(500).json({ error: "Failed to update catalog item" });
    }
  }
);

/**
 * DELETE /api/catalog/:itemId
 * Delete a catalog item permanently, or deactivate if referenced by other records
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

      // Branch access check for non-HM users
      if (
        !req.user!.roles.includes("HM") &&
        !existing.is_global &&
        existing.branch_id &&
        !req.user!.branchIds.includes(existing.branch_id)
      ) {
        res.status(403).json({ error: "No access to this catalog item's branch" });
        return;
      }

      // Only HM can delete global items
      if (existing.is_global && !req.user!.roles.includes("HM")) {
        res.status(403).json({
          error: "Only Higher Management can delete global catalog items",
        });
        return;
      }

      // Try hard delete first
      const { error: deleteError } = await supabaseAdmin
        .from("catalog_items")
        .delete()
        .eq("id", itemId);

      if (deleteError) {
        // If FK constraint violation, fall back to soft delete (deactivate)
        if (deleteError.code === "23503") {
          const { error: updateError } = await supabaseAdmin
            .from("catalog_items")
            .update({ status: "inactive" as "active" | "inactive" })
            .eq("id", itemId);

          if (updateError) {
            res.status(500).json({ error: updateError.message });
            return;
          }

          // Update audit log with user_id
          await supabaseAdmin
            .from("audit_logs")
            .update({ user_id: req.user!.id })
            .eq("entity_type", "CATALOG_ITEM")
            .eq("entity_id", itemId)
            .eq("action", "UPDATE")
            .is("user_id", null)
            .order("created_at", { ascending: false })
            .limit(1);

          res.json({
            message: "Catalog item is referenced by other records and has been deactivated instead",
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
        .eq("entity_type", "CATALOG_ITEM")
        .eq("entity_id", itemId)
        .eq("action", "DELETE")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);

      res.json({ message: "Catalog item deleted successfully" });
    } catch (error) {
      console.error("Delete catalog item error:", error);
      res.status(500).json({ error: "Failed to delete catalog item" });
    }
  }
);

export default router;
