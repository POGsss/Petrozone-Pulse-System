import { Router } from "express";
import type { Request, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/staff-performance
 * List staff performance records with filtering and pagination
 * View: HM, POC, JS, R, T
 */
router.get(
  "/",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        staff_id,
        branch_id,
        metric_type,
        period_start,
        period_end,
        search,
        limit = "50",
        offset = "0",
      } = req.query;

      let query = supabaseAdmin
        .from("staff_performance")
        .select(
          "*, user_profiles!staff_performance_staff_id_fkey(id, full_name, email), branches!staff_performance_branch_id_fkey(id, name, code)",
          { count: "exact" }
        )
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (staff_id) query = query.eq("staff_id", staff_id as string);
      if (branch_id) query = query.eq("branch_id", branch_id as string);
      if (metric_type) query = query.eq("metric_type", metric_type as string);
      if (period_start) query = query.gte("period_start", period_start as string);
      if (period_end) query = query.lte("period_end", period_end as string);

      // Search by staff name (join filter)
      if (search) {
        const searchTerm = `%${search}%`;
        query = query.or(
          `user_profiles.full_name.ilike.${searchTerm},user_profiles.email.ilike.${searchTerm}`
        );
      }

      query = query.range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
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
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error("Get staff performance error:", error);
      res.status(500).json({ error: "Failed to fetch staff performance records" });
    }
  }
);



/**
 * GET /api/staff-performance/:id
 * Get a single staff performance record
 * View: HM, POC, JS, R, T
 */
router.get(
  "/:id",
  requireRoles("HM", "POC", "JS", "R", "T"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const { data, error } = await supabaseAdmin
        .from("staff_performance")
        .select(
          "*, user_profiles!staff_performance_staff_id_fkey(id, full_name, email), branches!staff_performance_branch_id_fkey(id, name, code)"
        )
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          res.status(404).json({ error: "Staff performance record not found" });
          return;
        }
        res.status(500).json({ error: error.message });
        return;
      }

      res.json(data);
    } catch (error) {
      console.error("Get staff performance record error:", error);
      res.status(500).json({ error: "Failed to fetch staff performance record" });
    }
  }
);



export default router;
