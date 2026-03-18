import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";
import { fixAuditLogUser, logFailedAction } from "../lib/auditLogger.js";

const router = Router();

router.use(requireAuth);

const VALID_STATUSES = ["active", "inactive"] as const;

function parseNonNegativePrice(value: unknown): number | null {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

/**
 * GET /api/labor-items
 * List labor items with filtering and pagination.
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("labor_items")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status as "active" | "inactive");
      }
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.ilike("name", searchTerm);
      }

      query = query.range(
        parseInt(offset as string, 10),
        parseInt(offset as string, 10) + parseInt(limit as string, 10) - 1
      );

      const { data, error, count } = await query;

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({
        data,
        pagination: {
          total: count,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      });
    } catch (error) {
      console.error("Get labor items error:", error);
      res.status(500).json({ error: "Failed to fetch labor items" });
    }
  }
);

/**
 * GET /api/labor-items/:id
 * Get one labor item.
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data, error } = await supabaseAdmin
        .from("labor_items")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Labor item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error) {
      console.error("Get labor item error:", error);
      res.status(500).json({ error: "Failed to fetch labor item" });
    }
  }
);

/**
 * GET /api/labor-items/:id/delete-mode
 * Returns whether labor item can be hard-deleted or will be deactivated.
 */
router.get(
  "/:id/delete-mode",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const [{ count: legacyRefs }, { count: lineRefs }, { count: packageRefs }] = await Promise.all([
        supabaseAdmin
          .from("job_order_items")
          .select("id", { count: "exact", head: true })
          .eq("labor_item_id", id),
        supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("line_type", "labor")
          .eq("reference_id", id),
          supabaseAdmin
            .from("package_labor_items")
            .select("id", { count: "exact", head: true })
            .eq("labor_id", id),
      ]);

          const references = (legacyRefs || 0) + (lineRefs || 0) + (packageRefs || 0);
      const mode = references > 0 ? "deactivate" : "delete";

      res.json({
        deletable: references === 0,
        mode,
        reference_count: references,
      });
    } catch (error) {
      console.error("Get labor delete mode error:", error);
      res.status(500).json({ error: "Failed to determine labor delete mode" });
    }
  }
);

/**
 * POST /api/labor-items
 * Create labor item.
 */
router.post(
  "/",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, light_price, heavy_price, extra_heavy_price, status } = req.body;

      if (!name || !String(name).trim()) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      const parsedLightPrice = parseNonNegativePrice(light_price);
      const parsedHeavyPrice = parseNonNegativePrice(heavy_price);
      const parsedExtraHeavyPrice = parseNonNegativePrice(extra_heavy_price);

      if (parsedLightPrice === null) {
        res.status(400).json({ error: "light_price must be a non-negative number" });
        return;
      }
      if (parsedHeavyPrice === null) {
        res.status(400).json({ error: "heavy_price must be a non-negative number" });
        return;
      }
      if (parsedExtraHeavyPrice === null) {
        res.status(400).json({ error: "extra_heavy_price must be a non-negative number" });
        return;
      }

      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("labor_items")
        .insert({
          name: String(name).trim(),
          light_price: parsedLightPrice,
          heavy_price: parsedHeavyPrice,
          extra_heavy_price: parsedExtraHeavyPrice,
          status: status || "active",
        })
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      await fixAuditLogUser("LABOR_ITEM", data.id, "CREATE", req.user!.id, req.user!.branchIds[0] || null);

      res.status(201).json(data);
    } catch (error) {
      console.error("Create labor item error:", error);
      await logFailedAction(
        req,
        "CREATE",
        "LABOR_ITEM",
        null,
        error instanceof Error ? error.message : "Failed to create labor item"
      );
      res.status(500).json({ error: "Failed to create labor item" });
    }
  }
);

/**
 * PUT /api/labor-items/:id
 * Update labor item.
 */
router.put(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { name, light_price, heavy_price, extra_heavy_price, status } = req.body;

      const updates: Record<string, unknown> = {};

      if (name !== undefined) {
        if (!String(name).trim()) {
          res.status(400).json({ error: "Name cannot be empty" });
          return;
        }
        updates.name = String(name).trim();
      }

      if (light_price !== undefined) {
        const parsedPrice = parseNonNegativePrice(light_price);
        if (parsedPrice === null) {
          res.status(400).json({ error: "light_price must be a non-negative number" });
          return;
        }
        updates.light_price = parsedPrice;
      }

      if (heavy_price !== undefined) {
        const parsedPrice = parseNonNegativePrice(heavy_price);
        if (parsedPrice === null) {
          res.status(400).json({ error: "heavy_price must be a non-negative number" });
          return;
        }
        updates.heavy_price = parsedPrice;
      }

      if (extra_heavy_price !== undefined) {
        const parsedPrice = parseNonNegativePrice(extra_heavy_price);
        if (parsedPrice === null) {
          res.status(400).json({ error: "extra_heavy_price must be a non-negative number" });
          return;
        }
        updates.extra_heavy_price = parsedPrice;
      }

      if (status !== undefined) {
        if (!VALID_STATUSES.includes(status)) {
          res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
          return;
        }
        updates.status = status;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from("labor_items")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Labor item not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      await fixAuditLogUser("LABOR_ITEM", id, "UPDATE", req.user!.id, req.user!.branchIds[0] || null);

      res.json(data);
    } catch (error) {
      console.error("Update labor item error:", error);
      await logFailedAction(
        req,
        "UPDATE",
        "LABOR_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to update labor item"
      );
      res.status(500).json({ error: "Failed to update labor item" });
    }
  }
);

/**
 * DELETE /api/labor-items/:id
 * Hard delete labor item if not referenced.
 */
router.delete(
  "/:id",
  requireRoles("HM", "POC", "JS", "R"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const [{ count: legacyRefs }, { count: lineRefs }, { count: packageRefs }] = await Promise.all([
        supabaseAdmin
          .from("job_order_items")
          .select("id", { count: "exact", head: true })
          .eq("labor_item_id", id),
        supabaseAdmin
          .from("job_order_lines")
          .select("id", { count: "exact", head: true })
          .eq("line_type", "labor")
          .eq("reference_id", id),
        supabaseAdmin
          .from("package_labor_items")
          .select("id", { count: "exact", head: true })
          .eq("labor_id", id),
      ]);

      const totalRefs = (legacyRefs || 0) + (lineRefs || 0) + (packageRefs || 0);

      if (totalRefs > 0) {
        const { error: updateError } = await supabaseAdmin
          .from("labor_items")
          .update({ status: "inactive" })
          .eq("id", id);

        if (updateError) {
          res.status(500).json({ error: updateError.message });
          return;
        }

        res.json({
          message: "Labor item is referenced by job orders and has been deactivated instead",
          deactivated: true,
        });
        return;
      }

      const { error } = await supabaseAdmin
        .from("labor_items")
        .delete()
        .eq("id", id);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ message: "Labor item deleted successfully" });
    } catch (error) {
      console.error("Delete labor item error:", error);
      await logFailedAction(
        req,
        "DELETE",
        "LABOR_ITEM",
        (req.params.id as string) || null,
        error instanceof Error ? error.message : "Failed to delete labor item"
      );
      res.status(500).json({ error: "Failed to delete labor item" });
    }
  }
);

export default router;
